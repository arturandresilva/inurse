-- =====================================================================
-- iNurse v2 — várias transportadoras: o cliente escolhe como quer receber (e paga esse envio)
--  · cada escalão de portes pertence a uma transportadora/serviço (CTT, DPD, GLS, pontos de recolha…)
--  · o carrinho devolve todas as opções com preço; a encomenda guarda a escolhida
--  · portes grátis: a opção mais barata fica a 0 € e as outras custam só a diferença
-- =====================================================================
alter table shipping_rates add column label text;                         -- nome mostrado ao cliente
alter table shipping_rates add column delivery text not null default 'domicilio' check (delivery in ('domicilio','ponto'));
alter table shipping_rates add column eta text;                           -- ex.: "1–2 dias úteis"
alter table orders add column shipping_method jsonb;                      -- opção escolhida no checkout

create or replace function public.quote_cart(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  it jsonb; v record; lines jsonb := '[]'; subtotal int := 0; qty int;
  promo promotions; discount int := 0; ship int := 0; zones jsonb; z jsonb; region text; free_ship boolean := false;
  problems jsonb := '[]'; w int; rate shipping_rates; opts jsonb := '[]'; o record; chosen jsonb; base int; is_free boolean;
begin
  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]')) loop
    qty := greatest(1, least(coalesce((it->>'qty')::int, 1), 20));
    select v2.id, v2.price_cents, v2.stock, v2.active, v2.option_value, v2.allow_backorder, pr.title, pr.status, pr.vat_rate, pr.handle
      into v from variants v2 join products pr on pr.id = v2.product_id where v2.id = (it->>'variant_id')::uuid;
    if v.id is null or not v.active or v.status <> 'active' then
      problems := problems || jsonb_build_object('variant_id', it->>'variant_id', 'erro', 'indisponível'); continue;
    end if;
    if v.stock is not null and not v.allow_backorder and v.stock < qty then
      problems := problems || jsonb_build_object('variant_id', v.id, 'erro', 'stock insuficiente', 'disponivel', greatest(v.stock, 0)); continue;
    end if;
    subtotal := subtotal + v.price_cents * qty;
    lines := lines || jsonb_build_object('variant_id', v.id, 'title', v.title, 'option_value', v.option_value, 'handle', v.handle,
                                         'qty', qty, 'unit_cents', v.price_cents, 'vat_rate', v.vat_rate, 'line_cents', v.price_cents * qty);
  end loop;

  if coalesce(p->>'promo_code', '') <> '' then
    select * into promo from promotions where upper(code) = upper(trim(p->>'promo_code')) and active
       and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())
       and (max_uses is null or uses < max_uses);
    if promo.id is null then problems := problems || jsonb_build_object('erro', 'cupão inválido ou expirado');
    elsif subtotal < promo.min_order_cents then problems := problems || jsonb_build_object('erro', 'cupão exige compra mínima', 'minimo_cents', promo.min_order_cents); promo := null;
    else
      discount := case promo.kind when 'percent' then round(subtotal * promo.value / 100.0) when 'fixed' then least(subtotal, round(promo.value * 100)) else 0 end;
      free_ship := promo.kind = 'free_shipping';
    end if;
  end if;

  region := coalesce(p->>'region', 'Continente');
  w := chargeable_weight_g((select coalesce(jsonb_agg(jsonb_build_object('variant_id', l->>'variant_id', 'qty', l->'qty')), '[]') from jsonb_array_elements(lines) l));
  select value->'zones' into zones from settings where key = 'public.shipping';
  select x into z from jsonb_array_elements(coalesce(zones, '[]')) x where x->>'region' = region;
  -- uma opção por transportadora/serviço: o escalão mais baixo que aguenta o peso
  for o in select distinct on (r.carrier, r.service) r.* from shipping_rates r
            where r.active and r.zone = region and r.max_weight_g >= w
            order by r.carrier, r.service, r.max_weight_g loop
    opts := opts || jsonb_build_object('key', o.carrier || '|' || o.service, 'rate_id', o.id, 'carrier', o.carrier, 'service', o.service,
              'label', coalesce(o.label, o.carrier || ' ' || o.service), 'delivery', o.delivery, 'eta', o.eta, 'price_cents', o.price_cents);
  end loop;
  select coalesce(jsonb_agg(x order by (x->>'price_cents')::int, x->>'label'), '[]') into opts from jsonb_array_elements(opts) x;
  is_free := free_ship or (z is not null and coalesce((z->>'free_from_cents')::int, 0) > 0 and subtotal - discount >= (z->>'free_from_cents')::int);
  if jsonb_array_length(opts) > 0 then
    -- portes grátis: a opção mais barata fica a 0 € e as outras custam só a diferença
    base := (opts->0->>'price_cents')::int;
    if is_free then
      select jsonb_agg(x || jsonb_build_object('price_cents', (x->>'price_cents')::int - base, 'was_cents', (x->>'price_cents')::int)) into opts from jsonb_array_elements(opts) x;
    end if;
    select x into chosen from jsonb_array_elements(opts) x where x->>'key' = p->>'shipping_option';
    if chosen is null then chosen := opts->0; end if;
    ship := (chosen->>'price_cents')::int;
    select * into rate from shipping_rates where id = (chosen->>'rate_id')::uuid;
  elsif exists (select 1 from shipping_rates where zone = region and active) then
    problems := problems || jsonb_build_object('erro', 'encomenda acima do peso máximo para envio; contacte-nos');
  elsif z is not null then
    ship := case when is_free then 0 else (z->>'price_cents')::int end;      -- sem escalões definidos: preço fixo da zona
  else
    problems := problems || jsonb_build_object('erro', 'zona de envio indisponível');
  end if;
  if subtotal = 0 then ship := 0; end if;

  return jsonb_build_object('lines', lines, 'subtotal_cents', subtotal, 'discount_cents', discount, 'shipping_cents', ship,
                            'total_cents', subtotal - discount + ship, 'promotion_id', promo.id, 'problems', problems,
                            'weight_g', w, 'shipping_rate_id', rate.id, 'shipping_options', opts, 'shipping_option', chosen->>'key');
end $$;

create or replace function public.place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  q jsonb; v_email text; cid uuid; oid uuid; onum int; tok uuid; it jsonb; pm text; pay jsonb; ln jsonb;
  ship jsonb := p->'shipping_address';
begin
  v_email := lower(trim(p->>'email'));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email inválido'; end if;
  if coalesce((p->>'accept_terms')::boolean, false) is false then raise exception 'é preciso aceitar os termos e condições'; end if;
  if ship is null or coalesce(ship->>'line1', '') = '' or coalesce(ship->>'zip', '') = '' or coalesce(ship->>'city', '') = '' or coalesce(ship->>'name', '') = '' then
    raise exception 'morada de entrega incompleta';
  end if;
  if (ship->>'region') = 'Continente' and (ship->>'zip') !~ '^\d{4}-\d{3}$' then raise exception 'código postal inválido (0000-000)'; end if;
  if jsonb_array_length(coalesce(p->'items', '[]')) = 0 then raise exception 'carrinho vazio'; end if;

  pm := p->>'payment_method';
  select value into pay from settings where key = 'public.payments';
  if pm not in ('mbway','multibanco','transfer') or coalesce((pay->>pm)::boolean, false) is false then raise exception 'método de pagamento indisponível'; end if;
  if pm = 'mbway' and coalesce(p->>'phone', ship->>'phone', '') !~ '^(\+351)?9\d{8}$' then raise exception 'para MB WAY indica um telemóvel português'; end if;

  -- bloqueia as variantes com stock controlado para evitar vender a mais
  perform 1 from variants where id in (select (x->>'variant_id')::uuid from jsonb_array_elements(p->'items') x) and stock is not null for update;

  q := quote_cart(jsonb_build_object('items', p->'items', 'promo_code', p->>'promo_code', 'region', ship->>'region', 'shipping_option', p->>'shipping_option'));
  if jsonb_array_length(q->'problems') > 0 then
    raise exception 'não foi possível concluir: %', (select string_agg(x->>'erro', ', ') from jsonb_array_elements(q->'problems') x);
  end if;
  if jsonb_array_length(q->'lines') = 0 then raise exception 'carrinho vazio'; end if;

  select id into cid from customers where customers.email = v_email;
  if cid is null then
    insert into customers (email, name, phone, nif, newsletter, newsletter_consent_at, terms_accepted_at)
    values (v_email, ship->>'name', coalesce(p->>'phone', ship->>'phone'), nullif(p->>'nif', ''),
            coalesce((p->>'newsletter')::boolean, false), case when (p->>'newsletter')::boolean then now() end, now())
    returning id into cid;
    insert into addresses (customer_id, kind, name, phone, line1, line2, zip, city, region)
    values (cid, 'delivery', ship->>'name', ship->>'phone', ship->>'line1', ship->>'line2', ship->>'zip', ship->>'city', ship->>'region');
  elsif coalesce((p->>'newsletter')::boolean, false) then
    update customers set newsletter = true, newsletter_consent_at = coalesce(newsletter_consent_at, now()) where id = cid;
  end if;

  insert into orders (customer_id, email, status, payment_method, shipping_address, billing_address, nif,
                      subtotal_cents, shipping_cents, discount_cents, total_cents, notes, promotion_id, cart_id,
                      weight_g, shipping_rate_id, shipping_method)
  values (cid, v_email, 'pending_payment', pm, ship, p->'billing_address', nullif(p->>'nif', ''),
          (q->>'subtotal_cents')::int, (q->>'shipping_cents')::int, (q->>'discount_cents')::int, (q->>'total_cents')::int,
          nullif(left(p->>'notes', 1000), ''), nullif(q->>'promotion_id', '')::uuid,
          (select id from carts where token = nullif(p->>'cart_token', '')::uuid),
          (q->>'weight_g')::int, nullif(q->>'shipping_rate_id', '')::uuid,
          (select x - 'rate_id' from jsonb_array_elements(coalesce(q->'shipping_options', '[]')) x where x->>'key' = q->>'shipping_option'))
  returning id, number, public_token into oid, onum, tok;

  for ln in select * from jsonb_array_elements(q->'lines') loop
    insert into order_items (order_id, variant_id, title, option_value, sku, vat_rate, unit_price_cents, quantity)
    select oid, v.id, ln->>'title', v.option_value, v.sku, (ln->>'vat_rate')::numeric, (ln->>'unit_cents')::int, (ln->>'qty')::int
      from variants v where v.id = (ln->>'variant_id')::uuid;
    insert into stock_movements (variant_id, delta, reason, order_id, note)
    select v.id, -(ln->>'qty')::int, 'venda', oid, 'Encomenda #' || onum from variants v
     where v.id = (ln->>'variant_id')::uuid and v.stock is not null;
  end loop;

  if q->>'promotion_id' is not null then update promotions set uses = uses + 1 where id = (q->>'promotion_id')::uuid; end if;
  update carts set status = 'converted', customer_id = cid, email = v_email where token = nullif(p->>'cart_token', '')::uuid;

  return jsonb_build_object('order_id', oid, 'number', onum, 'token', tok, 'total_cents', (q->>'total_cents')::int,
                            'payment_method', pm, 'iban', case when pm = 'transfer' then pay->>'iban' end);
end $$;

create or replace function public.estimate_order_costs(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; fees jsonb; ship int := 0; s record; fee int := 0; f jsonb; w int; rate shipping_rates; carrier int;
begin
  select * into o from orders where id = p_order;
  if o.id is null or o.costs_confirmed then return; end if;
  -- portes do fornecedor apenas se ele cobrar envios diretos ao cliente
  for s in select i.supplier_id, sum(coalesce(i.unit_cost_cents, 0) * i.quantity)::int as purchase
             from order_items i join suppliers sp on sp.id = i.supplier_id
            where i.order_id = p_order and coalesce((sp.conditions->>'charges_dropship_shipping')::boolean, false)
            group by i.supplier_id loop
    ship := ship + supplier_shipping_cents(s.supplier_id, s.purchase);
  end loop;
  select value into fees from settings where key = 'finance';
  f := fees->'payment_fees'->(o.payment_method);
  if f is not null then fee := round(o.total_cents * coalesce((f->>'pct')::numeric, 0) / 100.0 + coalesce((f->>'fixed_cents')::int, 0)); end if;
  -- custo CTT pelo peso cobrável
  w := chargeable_weight_g((select jsonb_agg(jsonb_build_object('variant_id', variant_id, 'qty', quantity)) from order_items where order_id = p_order and variant_id is not null));
  -- custo da transportadora que o cliente escolheu (ou, se não houver escolha, o escalão normal)
  select * into rate from shipping_rates where id = o.shipping_rate_id;
  if rate.id is null then rate := shipping_rate_for(coalesce(o.shipping_address->>'region', 'Continente'), w); end if;
  carrier := coalesce(rate.cost_cents, round(rate.price_cents / 1.23), (fees->>'carrier_cents_per_order')::int, 0);
  update orders set cost_supplier_shipping_cents = ship, cost_payment_fee_cents = fee, cost_carrier_cents = carrier,
         cost_packaging_cents = coalesce((fees->>'packaging_cents_per_order')::int, 0), weight_g = w, shipping_rate_id = rate.id
   where id = p_order;
end $$;
