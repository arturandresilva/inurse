-- =====================================================================
-- iNurse v2 — aviso de encomendas novas no backoffice + email à loja; levantamento num ponto CTT
--  · orders.admin_seen_at: encomenda ainda não aberta no backoffice = "nova" (contador no menu)
--  · email à loja a cada encomenda nova ("loja_nova_encomenda")
--  · pickup_points: pontos CTT (lojas, agentes Payshop, cacifos) para o cliente escolher no checkout
--  · a tabela simples de portes ganha a opção "Ponto CTT" (settings public.shipping.simple.pickup)
-- =====================================================================
alter table orders add column if not exists admin_seen_at timestamptz;
update orders set admin_seen_at = now() where admin_seen_at is null and created_at < now() - interval '1 day';

create table if not exists pickup_points (
  code       text primary key,                 -- código do ponto nos CTT
  name       text not null,
  kind       text not null default 'ponto' check (kind in ('loja', 'ponto', 'cacifo')),
  address    text,
  zip        text not null,
  city       text,
  lat        double precision,
  lng        double precision,
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists pickup_points_zip on pickup_points(zip);
alter table pickup_points enable row level security;
create policy "pontos visíveis" on pickup_points for select using (active);
create policy "admin gere pontos" on pickup_points for all to authenticated using (is_admin()) with check (is_admin());

-- pontos perto de um código postal (os mais próximos pelo número do código postal)
create or replace function public.pickup_points_near(p_zip text, p_limit int default 12) returns setof pickup_points
language sql stable set search_path = public as $$
  select * from pickup_points
   where active and left(zip, 2) = left(regexp_replace(p_zip, '\D', '', 'g'), 2)
   order by abs(coalesce(nullif(regexp_replace(zip, '\D', '', 'g'), '')::int, 0) - coalesce(nullif(rpad(regexp_replace(p_zip, '\D', '', 'g'), 7, '0'), '')::int, 0)), name
   limit least(coalesce(p_limit, 12), 30)
$$;
grant execute on function public.pickup_points_near(text, int) to anon, authenticated;

create or replace function public.quote_cart(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  it jsonb; v record; lines jsonb := '[]'; subtotal int := 0; qty int;
  promo promotions; discount int := 0; ship int := 0; zones jsonb; z jsonb; region text; free_ship boolean := false;
  problems jsonb := '[]'; w int; rate shipping_rates; opts jsonb := '[]'; o record; chosen jsonb; base int; is_free boolean; sp jsonb; pk jsonb;
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
    -- levantar num ponto CTT (opcional): mesmo preço da morada, menos o desconto definido no backoffice
    select value->'simple'->'pickup' into pk from settings where key = 'public.shipping';
    if coalesce((pk->>'enabled')::boolean, false) then
      opts := opts || jsonb_build_object('key', 'CTT Expresso|ponto', 'carrier', 'CTT Expresso', 'service', 'ponto',
                'label', coalesce(nullif(pk->>'label', ''), 'Ponto CTT'), 'delivery', 'ponto', 'eta', coalesce(nullif(pk->>'eta', ''), sp->>'eta'),
                'price_cents', greatest(0, (sp->>'price_cents')::int - coalesce((pk->>'discount_cents')::int, 0)));
    end if;
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
    -- por defeito: a mais barata, exceto o ponto CTT (que obriga a escolher o ponto)
    if chosen is null then select x into chosen from jsonb_array_elements(opts) x where x->>'key' <> 'CTT Expresso|ponto' limit 1; end if;
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


-- encomenda com levantamento num ponto: tem de vir o ponto escolhido (guardado na encomenda)
create or replace function public.place_order_l(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; l text := coalesce(nullif(p->>'locale', ''), 'pt'); pt jsonb := p->'pickup_point';
begin
  if coalesce((select (value->>'enabled')::boolean from settings where key = 'public.maintenance'), false) then
    raise exception 'A loja está em manutenção. Tente novamente dentro de pouco tempo.';
  end if;
  if coalesce(p->>'shipping_option', '') like '%|ponto' and coalesce(trim(pt->>'name'), '') = '' then
    raise exception 'escolhe o ponto CTT onde queres levantar a encomenda';
  end if;
  r := place_order(p - 'locale' - 'pickup_point');
  update orders set locale = case when l in ('en','es','fr') then l else locale end,
         shipping_method = case when coalesce(shipping_method->>'delivery', '') = 'ponto' and pt is not null
                                then shipping_method || jsonb_build_object('point', jsonb_build_object(
                                  'code', left(pt->>'code', 40), 'name', left(pt->>'name', 160), 'address', left(pt->>'address', 200),
                                  'zip', left(pt->>'zip', 12), 'city', left(pt->>'city', 80)))
                                else shipping_method end
   where number = (r->>'number')::int;
  return r;
end $$;
grant execute on function public.place_order_l(jsonb) to anon, authenticated;

-- email à loja a cada encomenda nova
alter table email_outbox drop constraint if exists email_outbox_kind_check;
alter table email_outbox add constraint email_outbox_kind_check check (kind in (
  'encomenda_recebida', 'encomenda_paga', 'encomenda_preparacao', 'encomenda_enviada', 'encomenda_entregue',
  'encomenda_cancelada', 'encomenda_reembolsada', 'avaliacao', 'teste', 'conversa', 'conversa_alerta', 'loja_nova_encomenda'));
create or replace function public.orders_alert_store() returns trigger
language plpgsql security definer set search_path = public as $$
declare dest text;
begin
  select coalesce(nullif(value->>'alert_to', ''), nullif(value->>'reply_to', '')) into dest from settings where key = 'email';
  if dest is null then select nullif(value->>'email', '') into dest from settings where key = 'public.store'; end if;
  insert into email_outbox (kind, order_id, to_email, send_after) values ('loja_nova_encomenda', new.id, coalesce(dest, 'info@inurse.pt'), now() + interval '1 minute');
  return null;
end $$;
create or replace trigger orders_alert_store after insert on orders for each row execute function public.orders_alert_store();
