-- =====================================================================
-- iNurse v2 — portes por peso/volume (CTT), envio direto do armazém com
-- recolha CTT, preço por margem própria OU preço recomendado (PVPR)
-- =====================================================================

-- ---------- Preço: margem própria ou PVPR do fornecedor ----------
alter table variants add column rrp_cents int check (rrp_cents >= 0);      -- PVPR do fornecedor (c/IVA)
-- base da regra: 'cost' (custo + margem/markup) ou 'rrp' (PVPR do fornecedor × (1 + rrp_adjust_pct/100))
alter table pricing_rules add column base text not null default 'cost' check (base in ('cost','rrp'));
alter table pricing_rules add column rrp_adjust_pct numeric(5,2) not null default 0 check (rrp_adjust_pct > -50 and rrp_adjust_pct < 100);

create or replace function public.compute_price_v2(p_cost_cents int, p_vat numeric, r pricing_rules, p_rrp_cents int) returns int
language plpgsql immutable set search_path = public as $$
declare net numeric; gross int;
begin
  if r.id is null then return null; end if;
  if r.base = 'rrp' then
    if p_rrp_cents is null then return null; end if;
    gross := round(p_rrp_cents * (1 + r.rrp_adjust_pct / 100.0));
    -- nunca abaixo do lucro mínimo
    if p_cost_cents is not null and gross / (1 + p_vat / 100.0) - p_cost_cents < r.min_profit_cents then
      gross := round((p_cost_cents + r.min_profit_cents) * (1 + p_vat / 100.0));
    end if;
    return round_price(gross, r.rounding);
  end if;
  if p_cost_cents is null then return null; end if;
  net := case r.method when 'margin' then p_cost_cents / (1 - least(r.pct, 99) / 100.0)
                       else p_cost_cents * (1 + r.pct / 100.0) end;
  if net - p_cost_cents < r.min_profit_cents then net := p_cost_cents + r.min_profit_cents; end if;
  gross := round(net * (1 + p_vat / 100.0));
  return round_price(gross, r.rounding);
end $$;

create or replace function public.apply_pricing(p_products uuid[] default null, p_dry_run boolean default true)
returns table (variant_id uuid, product_title text, option_value text, cost_cents int, old_cents int, new_cents int, rule_name text)
language plpgsql security invoker set search_path = public as $$
declare rec record; r pricing_rules; np int;
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  for rec in
    select v.id, v.cost_cents, v.rrp_cents, v.price_cents, p.vat_rate, p.title, v.option_value
      from variants v join products p on p.id = v.product_id
     where (v.cost_cents is not null or v.rrp_cents is not null) and not v.price_locked
       and (p_products is null or p.id = any(p_products))
  loop
    r := rule_for_variant(rec.id);
    np := compute_price_v2(rec.cost_cents, rec.vat_rate, r, rec.rrp_cents);
    if np is not null and np <> rec.price_cents then
      variant_id := rec.id; product_title := rec.title; option_value := rec.option_value;
      cost_cents := rec.cost_cents; old_cents := rec.price_cents; new_cents := np; rule_name := r.name;
      return next;
      if not p_dry_run then
        update variants set price_cents = np where id = rec.id;
        insert into price_history (variant_id, old_cents, new_cents, reason, rule_id) values (rec.id, rec.price_cents, np, 'regra', r.id);
      end if;
    end if;
  end loop;
end $$;
grant execute on function public.apply_pricing(uuid[], boolean) to authenticated;

-- a importação passa a guardar o PVPR do fornecedor
create or replace function public.import_rrp_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- depois de aplicar uma importação, copia o PVPR das linhas para os tamanhos e recalcula
  if new.status = 'applied' and old.status is distinct from 'applied' then
    update variants v set rrp_cents = r.rrp_cents
      from import_rows r
     where r.job_id = new.id and r.rrp_cents is not null and r.action in ('create','update')
       and (v.id = r.match_variant_id or (v.supplier_sku is not null and v.supplier_sku = r.supplier_sku));
    perform 1 from apply_pricing((select array_agg(distinct v.product_id) from variants v join import_rows r
                                   on r.job_id = new.id and (v.id = r.match_variant_id or v.supplier_sku = r.supplier_sku)), false);
    update products set status = 'draft' where id in (select v.product_id from variants v join import_rows r on r.job_id = new.id
                                   and v.supplier_sku = r.supplier_sku where v.price_cents = 0)
      and status <> 'draft';
  end if;
  return new;
end $$;
create trigger trg_import_rrp after update of status on import_jobs for each row execute function import_rrp_sync();

-- ---------- Envio: peso e volume ----------
alter table products add column length_cm numeric(6,1);
alter table products add column width_cm numeric(6,1);
alter table products add column height_cm numeric(6,1);

-- tabela de portes por zona e escalão de peso (o que o cliente paga e o que a CTT te cobra)
create table shipping_rates (
  id            uuid primary key default gen_random_uuid(),
  zone          text not null check (zone in ('Continente','Açores','Madeira')),
  carrier       text not null default 'CTT Expresso',
  service       text not null default '48h',
  max_weight_g  int not null check (max_weight_g > 0),
  price_cents   int not null check (price_cents >= 0),     -- cobrado ao cliente (c/IVA)
  cost_cents    int check (cost_cents >= 0),               -- custo CTT para ti (s/IVA); vazio = igual ao cobrado
  active        boolean not null default true,
  unique (zone, carrier, service, max_weight_g)
);
alter table shipping_rates enable row level security;
create policy "portes públicos" on shipping_rates for select using (active);
create policy "admin gere tudo" on shipping_rates for all to authenticated using (is_admin()) with check (is_admin());

-- escalões de exemplo: AJUSTAR no backoffice com a tabela do teu contrato CTT
insert into shipping_rates (zone, max_weight_g, price_cents, cost_cents) values
 ('Continente', 2000, 450, null), ('Continente', 5000, 590, null), ('Continente', 10000, 790, null), ('Continente', 20000, 1190, null),
 ('Açores', 2000, 990, null), ('Açores', 5000, 1490, null), ('Açores', 10000, 2190, null),
 ('Madeira', 2000, 990, null), ('Madeira', 5000, 1490, null), ('Madeira', 10000, 2190, null);

update settings set value = value || '{"volumetric_divisor": 6000, "default_item_weight_g": 900, "packaging_weight_g": 100, "rates_confirmed": false}'
 where key = 'public.shipping';

-- peso cobrável (g) de uma lista de artigos: máx(peso real, peso volumétrico) por artigo + embalagem
create or replace function public.chargeable_weight_g(p_items jsonb) returns int
language sql stable set search_path = public as $$
  with cfg as (select value as c from settings where key = 'public.shipping'),
  it as (
    select greatest(1, least(coalesce((x->>'qty')::int, 1), 20)) as qty, p.weight_g, p.length_cm, p.width_cm, p.height_cm
      from jsonb_array_elements(coalesce(p_items, '[]')) x
      join variants v on v.id = (x->>'variant_id')::uuid join products p on p.id = v.product_id)
  select coalesce(sum(qty * greatest(coalesce(nullif(weight_g, 0), (select (c->>'default_item_weight_g')::int from cfg), 900),
           coalesce(round(length_cm * width_cm * height_cm * 1000 / nullif((select (c->>'volumetric_divisor')::numeric from cfg), 0)), 0)))::int, 0)
       + coalesce((select (c->>'packaging_weight_g')::int from cfg), 0)
    from it;
$$;

-- escalão aplicável
create or replace function public.shipping_rate_for(p_zone text, p_weight_g int) returns shipping_rates
language sql stable set search_path = public as $$
  select * from shipping_rates where active and zone = p_zone and max_weight_g >= p_weight_g order by max_weight_g limit 1;
$$;

-- quote_cart: portes por peso/volume (com portes grátis a partir de X por zona)
create or replace function public.quote_cart(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  it jsonb; v record; lines jsonb := '[]'; subtotal int := 0; qty int;
  promo promotions; discount int := 0; ship int := 0; zones jsonb; z jsonb; region text; free_ship boolean := false;
  problems jsonb := '[]'; w int; rate shipping_rates;
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
  rate := shipping_rate_for(region, w);
  if rate.id is not null then
    ship := rate.price_cents;
  elsif exists (select 1 from shipping_rates where zone = region and active) then
    problems := problems || jsonb_build_object('erro', 'encomenda acima do peso máximo para envio; contacte-nos');
  elsif z is not null then
    ship := (z->>'price_cents')::int;                       -- sem escalões definidos: preço fixo da zona
  else
    problems := problems || jsonb_build_object('erro', 'zona de envio indisponível');
  end if;
  if free_ship or (z is not null and coalesce((z->>'free_from_cents')::int, 0) > 0 and subtotal - discount >= (z->>'free_from_cents')::int) then ship := 0; end if;
  if subtotal = 0 then ship := 0; end if;

  return jsonb_build_object('lines', lines, 'subtotal_cents', subtotal, 'discount_cents', discount, 'shipping_cents', ship,
                            'total_cents', subtotal - discount + ship, 'promotion_id', promo.id, 'problems', problems,
                            'weight_g', w, 'shipping_rate_id', rate.id);
end $$;

-- ---------- Custos da encomenda: envio direto com recolha CTT ----------
alter table orders add column weight_g int;
alter table orders add column shipping_rate_id uuid references shipping_rates(id) on delete set null;
-- o fornecedor só cobra portes em entregas para a tua morada (não em envio direto com recolha CTT)
update suppliers set conditions = conditions || '{"charges_dropship_shipping": false}' where conditions ? 'shipping_tiers';

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
  rate := shipping_rate_for(coalesce(o.shipping_address->>'region', 'Continente'), w);
  carrier := coalesce(rate.cost_cents, round(rate.price_cents / 1.23), (fees->>'carrier_cents_per_order')::int, 0);
  update orders set cost_supplier_shipping_cents = ship, cost_payment_fee_cents = fee, cost_carrier_cents = carrier,
         cost_packaging_cents = coalesce((fees->>'packaging_cents_per_order')::int, 0), weight_g = w, shipping_rate_id = rate.id
   where id = p_order;
end $$;

-- ---------- Recolha CTT e guias ----------
alter table suppliers add column pickup_address jsonb;     -- morada do armazém para a recolha CTT
alter table shipments add column pickup_address jsonb;
alter table shipments add column pickup_date date;
alter table shipments add column pickup_ref text;
alter table shipments add column weight_g int;
alter table shipments add column parcels int not null default 1;
alter table shipments add column raw jsonb;
alter table shipments add column supplier_id uuid references suppliers(id) on delete set null;
alter table shipments add constraint shipments_status_check
  check (status in ('pending','label_created','pickup_scheduled','in_transit','delivered','failed','cancelled'));

insert into settings (key, value) values ('ctt', '{"enabled": false, "client_id": "", "contract_id": "", "service": "48h",
  "sender_name": "iNurse", "sender_email": "", "sender_phone": "", "note": "O ID de autenticação da API fica no cofre do servidor (segredo CTT_AUTH_ID), não aqui."}')
on conflict (key) do nothing;

-- ---------- Contabilista: modelo de custos atualizado ----------
update agents set instructions = replace(instructions,
  'Recebes a conta de resultados',
  'Modelo de negócio: os artigos seguem diretamente do armazém do fornecedor para o cliente, com recolha CTT paga pela loja; os portes cobrados ao cliente dependem do peso/volume e da zona. Os portes da tabela do fornecedor só se aplicam a entregas na morada da loja. Encomendas pequenas e grandes são tratadas da mesma forma. Recebes a conta de resultados')
 where key = 'contabilista';
