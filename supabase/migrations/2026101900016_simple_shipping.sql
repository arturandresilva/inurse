-- =====================================================================
-- iNurse v2 — tabela de portes simples, definida no backoffice:
--   peso:   até X kg → preço A; acima → preço B
--   volume: até X litros → preço A; acima → preço B
--   o cliente paga o mais caro dos dois (por peso ou por volume)
-- Guardada em settings "public.shipping".simple = {enabled, zones:{Continente:{...}}, default_item_volume_l}
-- =====================================================================
create or replace function public.order_volume_l(p_items jsonb) returns numeric
language sql stable set search_path = public as $$
  with cfg as (select coalesce((value->'simple'->>'default_item_volume_l')::numeric, 0) as dv from settings where key = 'public.shipping')
  select coalesce(sum(greatest(1, least(coalesce((x->>'qty')::int, 1), 20)) *
           coalesce(p.length_cm * p.width_cm * p.height_cm / 1000.0, (select dv from cfg))), 0)
    from jsonb_array_elements(coalesce(p_items, '[]')) x
    join variants v on v.id = (x->>'variant_id')::uuid join products p on p.id = v.product_id;
$$;

create or replace function public.simple_shipping(p_region text, p_items jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare s jsonb; z jsonb; w int; vol numeric; pw int; pv int; cw int; cv int;
begin
  select value->'simple' into s from settings where key = 'public.shipping';
  if s is null or coalesce((s->>'enabled')::boolean, false) is false then return null; end if;
  z := s->'zones'->p_region;
  -- tabela simples ligada mas sem envio para esta zona
  if z is null or coalesce((z->>'available')::boolean, true) is false or z->>'weight_up_cents' is null then return '{"unavailable": true}'; end if;
  w := chargeable_weight_g(p_items);
  vol := order_volume_l(p_items);
  pw := case when w <= coalesce((z->>'weight_limit_g')::int, 2147483647) then (z->>'weight_up_cents')::int else (z->>'weight_over_cents')::int end;
  cw := case when w <= coalesce((z->>'weight_limit_g')::int, 2147483647) then (z->>'weight_up_cost_cents')::int else (z->>'weight_over_cost_cents')::int end;
  pv := case when coalesce((z->>'volume_limit_l')::numeric, 0) = 0 then 0
             when vol <= (z->>'volume_limit_l')::numeric then coalesce((z->>'volume_up_cents')::int, 0) else coalesce((z->>'volume_over_cents')::int, 0) end;
  cv := case when coalesce((z->>'volume_limit_l')::numeric, 0) = 0 then null
             when vol <= (z->>'volume_limit_l')::numeric then (z->>'volume_up_cost_cents')::int else (z->>'volume_over_cost_cents')::int end;
  return jsonb_build_object('price_cents', greatest(coalesce(pw, 0), pv),
                            'cost_cents', case when coalesce(pv, 0) > coalesce(pw, 0) then cv else cw end,
                            'by', case when coalesce(pv, 0) > coalesce(pw, 0) then 'volume' else 'peso' end,
                            'weight_g', w, 'volume_l', round(vol, 1), 'service', s->>'service', 'eta', z->>'eta');
end $$;

create or replace function public.quote_cart(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  it jsonb; v record; lines jsonb := '[]'; subtotal int := 0; qty int;
  promo promotions; discount int := 0; ship int := 0; zones jsonb; z jsonb; region text; free_ship boolean := false;
  problems jsonb := '[]'; w int; rate shipping_rates; opts jsonb := '[]'; o record; chosen jsonb; base int; is_free boolean; sp jsonb;
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
  -- tabela simples (até X kg / acima; até X litros / acima): uma só opção, CTT
  sp := simple_shipping(region, (select coalesce(jsonb_agg(jsonb_build_object('variant_id', l->>'variant_id', 'qty', l->'qty')), '[]') from jsonb_array_elements(lines) l));
  if sp ? 'unavailable' then
    problems := problems || jsonb_build_object('erro', 'de momento não enviamos para esta zona');
  elsif sp is not null then
    opts := jsonb_build_array(jsonb_build_object('key', 'CTT Expresso|simples', 'carrier', 'CTT Expresso', 'service', coalesce(sp->>'service', '48h'),
              'label', 'CTT Expresso', 'delivery', 'domicilio', 'eta', sp->>'eta', 'price_cents', (sp->>'price_cents')::int,
              'volume_l', sp->'volume_l', 'by', sp->>'by'));
  end if;
  -- uma opção por transportadora/serviço: o escalão mais baixo que aguenta o peso
  for o in select distinct on (r.carrier, r.service) r.* from shipping_rates r
            where sp is null and r.active and r.zone = region and r.max_weight_g >= w
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
  elsif sp is null and exists (select 1 from shipping_rates where zone = region and active) then
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

create or replace function public.estimate_order_costs(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; fees jsonb; ship int := 0; s record; fee int := 0; f jsonb; w int; rate shipping_rates; carrier int; simple_cost int;
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
  -- tabela simples: o custo vem da tabela (até X kg / acima, até X litros / acima)
  if o.shipping_method->>'key' = 'CTT Expresso|simples' then
    simple_cost := (simple_shipping(coalesce(o.shipping_address->>'region', 'Continente'),
      (select jsonb_agg(jsonb_build_object('variant_id', variant_id, 'qty', quantity)) from order_items where order_id = p_order and variant_id is not null))->>'cost_cents')::int;
  end if;
  if rate.id is null and o.shipping_method->>'key' is distinct from 'CTT Expresso|simples' then rate := shipping_rate_for(coalesce(o.shipping_address->>'region', 'Continente'), w); end if;
  carrier := coalesce(simple_cost, rate.cost_cents, round(rate.price_cents / 1.23),
                      case when o.shipping_method->>'key' = 'CTT Expresso|simples' then round(o.shipping_cents / 1.23) end,
                      (fees->>'carrier_cents_per_order')::int, 0);
  update orders set cost_supplier_shipping_cents = ship, cost_payment_fee_cents = fee, cost_carrier_cents = carrier,
         cost_packaging_cents = coalesce((fees->>'packaging_cents_per_order')::int, 0), weight_g = w, shipping_rate_id = rate.id
   where id = p_order;
end $$;
