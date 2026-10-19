-- =====================================================================
-- iNurse v2 — núcleo: fornecedores, custos, regras de margem, importação
-- de folhas de fornecedores, checkout seguro, pesquisa, páginas, redirects
-- =====================================================================

create extension if not exists unaccent with schema extensions;

-- ---------- Fornecedores ----------
create table suppliers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  email            text,
  phone            text,
  website          text,
  lead_time_days   int,                       -- prazo típico de entrega ao cliente
  dropship         boolean not null default true,
  notes            text,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
alter table suppliers enable row level security;

alter table products add column supplier_id uuid references suppliers(id) on delete set null;
alter table products add column supplier_ref text;          -- referência do modelo no fornecedor
create index on products(supplier_id);

alter table variants add column cost_cents int check (cost_cents >= 0);   -- custo SEM IVA
alter table variants add column supplier_sku text;
alter table variants add column ean text;
alter table variants add column price_locked boolean not null default false; -- preço manual: regras não mexem
create index on variants(supplier_sku);
create index on variants(ean);

-- ---------- Regras de margem ----------
-- Escolhe-se a regra mais específica ativa: produto > categoria > marca > fornecedor > global; empate -> maior prioridade.
create table pricing_rules (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  scope           text not null check (scope in ('global','supplier','brand','category','product')),
  scope_id        uuid,                                    -- null só para global
  method          text not null default 'markup' check (method in ('markup','margin')),
  -- markup: preço_s/IVA = custo × (1 + pct)   | margin: preço_s/IVA = custo ÷ (1 − pct)
  pct             numeric(6,2) not null check (pct >= 0 and pct < 1000),
  rounding        text not null default '0.90' check (rounding in ('none','0.90','0.99','0.50','1.00')),
  min_profit_cents int not null default 0,                 -- lucro mínimo por unidade (s/IVA)
  priority        int not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  check ((scope = 'global') = (scope_id is null))
);
alter table pricing_rules enable row level security;

create table price_history (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references variants(id) on delete cascade,
  old_cents   int,
  new_cents   int not null,
  reason      text not null,          -- 'regra', 'manual', 'importacao', 'agente'
  rule_id     uuid references pricing_rules(id) on delete set null,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index on price_history(variant_id, created_at desc);
alter table price_history enable row level security;

-- arredonda um preço COM IVA (cêntimos) para o final escolhido, sempre para cima
create or replace function public.round_price(cents int, mode text) returns int
language plpgsql immutable as $$
declare euros int;
begin
  if cents is null then return null; end if;
  if mode = 'none' then return cents; end if;
  euros := cents / 100;
  return case mode
    when '0.90' then (case when cents <= euros*100 + 90 then euros*100 + 90 else (euros+1)*100 + 90 end)
    when '0.99' then (case when cents <= euros*100 + 99 then euros*100 + 99 else (euros+1)*100 + 99 end)
    when '0.50' then (case when cents <= euros*100 + 50 then euros*100 + 50 else (euros+1)*100 + 50 end)
    when '1.00' then (case when cents % 100 = 0 then cents else (euros+1)*100 end)
    else cents end;
end $$;

-- regra aplicável a uma variante
create or replace function public.rule_for_variant(p_variant uuid) returns pricing_rules
language sql stable as $$
  select r.* from variants v join products p on p.id = v.product_id
  join pricing_rules r on r.active and (
       (r.scope = 'product'  and r.scope_id = p.id)
    or (r.scope = 'category' and r.scope_id in (select category_id from product_categories where product_id = p.id))
    or (r.scope = 'brand'    and r.scope_id = p.brand_id)
    or (r.scope = 'supplier' and r.scope_id = p.supplier_id)
    or (r.scope = 'global'))
  where v.id = p_variant
  order by case r.scope when 'product' then 5 when 'category' then 4 when 'brand' then 3 when 'supplier' then 2 else 1 end desc,
           r.priority desc, r.created_at
  limit 1;
$$;

-- preço de venda COM IVA calculado a partir do custo e da regra
create or replace function public.compute_price(p_cost_cents int, p_vat numeric, r pricing_rules) returns int
language plpgsql immutable as $$
declare net numeric; gross int;
begin
  if p_cost_cents is null or r.id is null then return null; end if;
  net := case r.method when 'margin' then p_cost_cents / (1 - least(r.pct, 99) / 100.0)
                       else p_cost_cents * (1 + r.pct / 100.0) end;
  if net - p_cost_cents < r.min_profit_cents then net := p_cost_cents + r.min_profit_cents; end if;
  gross := round(net * (1 + p_vat / 100.0));
  return round_price(gross, r.rounding);
end $$;

-- simula ou aplica as regras: devolve as alterações; só mexe em variantes com custo e sem preço bloqueado
create or replace function public.apply_pricing(p_products uuid[] default null, p_dry_run boolean default true)
returns table (variant_id uuid, product_title text, option_value text, cost_cents int, old_cents int, new_cents int, rule_name text)
language plpgsql security invoker set search_path = public as $$
declare rec record; r pricing_rules; np int;
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  for rec in
    select v.id, v.cost_cents, v.price_cents, p.vat_rate, p.title, v.option_value
      from variants v join products p on p.id = v.product_id
     where v.cost_cents is not null and not v.price_locked
       and (p_products is null or p.id = any(p_products))
  loop
    r := rule_for_variant(rec.id);
    np := compute_price(rec.cost_cents, rec.vat_rate, r);
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

-- ---------- Importação de folhas de fornecedores ----------
create table import_jobs (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid references suppliers(id) on delete set null,
  file_name    text not null,
  file_path    text,                                  -- Storage (bucket privado 'importacoes')
  status       text not null default 'uploaded'
               check (status in ('uploaded','mapping','review','applying','applied','failed','cancelled')),
  mapping      jsonb,                                 -- coluna da folha -> campo
  options      jsonb not null default '{}',           -- ex.: {"create_new":true,"update_costs":true,"new_status":"draft"}
  stats        jsonb not null default '{}',
  error        text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  applied_at   timestamptz
);
alter table import_jobs enable row level security;

-- uma linha = um artigo (modelo + tamanho/cor) já normalizado
create table import_rows (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references import_jobs(id) on delete cascade,
  row_index         int not null,
  raw               jsonb not null,
  -- campos normalizados (preenchidos pelo mapeamento / IA)
  model_ref         text,           -- agrupa tamanhos/cores num produto
  title             text,
  brand             text,
  color             text,
  size              text,
  supplier_sku      text,
  ean               text,
  cost_cents        int,
  rrp_cents         int,            -- PVP recomendado (com IVA), se existir
  vat_rate          numeric(4,2),
  category_path     text,
  description       text,
  image_urls        text[] not null default '{}',
  -- resultado da comparação com o catálogo
  match_variant_id  uuid references variants(id) on delete set null,
  match_product_id  uuid references products(id) on delete set null,
  action            text not null default 'pending' check (action in ('pending','create','update','skip')),
  issues            text[] not null default '{}',
  unique (job_id, row_index)
);
create index on import_rows(job_id);
alter table import_rows enable row level security;

-- compara as linhas com o catálogo e propõe ação (criar / atualizar / ignorar)
create or replace function public.match_import_job(p_job uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare j import_jobs; n_create int; n_update int; n_skip int;
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  select * into j from import_jobs where id = p_job;
  if j.id is null then raise exception 'importação não encontrada'; end if;

  update import_rows r set issues = '{}' where r.job_id = p_job;
  -- 1) por EAN, 2) por referência do fornecedor, 3) por modelo do fornecedor + tamanho
  update import_rows r set match_variant_id = v.id, match_product_id = v.product_id
    from variants v where r.job_id = p_job and r.ean is not null and v.ean = r.ean;
  update import_rows r set match_variant_id = v.id, match_product_id = v.product_id
    from variants v join products p on p.id = v.product_id
   where r.job_id = p_job and r.match_variant_id is null and r.supplier_sku is not null
     and v.supplier_sku = r.supplier_sku and (j.supplier_id is null or p.supplier_id is not distinct from j.supplier_id);
  update import_rows r set match_variant_id = v.id, match_product_id = p.id
    from products p join variants v on v.product_id = p.id
   where r.job_id = p_job and r.match_variant_id is null and r.model_ref is not null
     and p.supplier_ref = r.model_ref and (j.supplier_id is null or p.supplier_id is not distinct from j.supplier_id)
     and lower(v.option_value) = lower(coalesce(r.size, ''));
  -- produto existe mas tamanho novo
  update import_rows r set match_product_id = p.id
    from products p
   where r.job_id = p_job and r.match_product_id is null and r.model_ref is not null
     and p.supplier_ref = r.model_ref and (j.supplier_id is null or p.supplier_id is not distinct from j.supplier_id);

  update import_rows r set issues = array_remove(array[
      case when coalesce(r.title, '') = '' and r.match_product_id is null then 'sem nome' end,
      case when r.cost_cents is null then 'sem custo' end,
      case when coalesce(r.size, '') = '' then 'sem tamanho' end,
      case when r.model_ref is null and r.supplier_sku is null and r.ean is null then 'sem referência' end
    ], null)
   where r.job_id = p_job;

  update import_rows r set action = case
      when r.action = 'skip' then 'skip'
      when r.match_variant_id is not null then 'update'
      when 'sem custo' = any(r.issues) and r.match_product_id is null then 'skip'
      when coalesce(r.title, '') = '' and r.match_product_id is null then 'skip'
      else 'create' end
   where r.job_id = p_job;

  select count(*) filter (where action = 'create'), count(*) filter (where action = 'update'), count(*) filter (where action = 'skip')
    into n_create, n_update, n_skip from import_rows where job_id = p_job;
  update import_jobs set status = 'review',
         stats = stats || jsonb_build_object('criar', n_create, 'atualizar', n_update, 'ignorar', n_skip, 'linhas', n_create + n_update + n_skip)
   where id = p_job;
  return jsonb_build_object('criar', n_create, 'atualizar', n_update, 'ignorar', n_skip);
end $$;

-- aplica a importação: cria/atualiza produtos e tamanhos, depois recalcula preços com as regras
create or replace function public.apply_import_job(p_job uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  j import_jobs; g record; r record; pid uuid; vid uuid; bid uuid; hnd text; n int;
  v_status text; created_p int := 0; created_v int := 0; updated_v int := 0; affected uuid[] := '{}';
  cpath text; parts text[]; ppath text; cid uuid; parent uuid; i int;
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  select * into j from import_jobs where id = p_job for update;
  if j.status not in ('review') then raise exception 'a importação não está pronta para aplicar (estado: %)', j.status; end if;
  update import_jobs set status = 'applying' where id = p_job;
  v_status := coalesce(j.options->>'new_status', 'draft');

  -- agrupa por produto: modelo do fornecedor (ou produto já existente, ou a própria linha)
  for g in
    with rows as (
      select ir.*, coalesce(ir.match_product_id::text, ir.model_ref, ir.supplier_sku, ir.ean, ir.id::text) as gkey
        from import_rows ir where ir.job_id = p_job and ir.action in ('create','update'))
    select gkey,
           (array_agg(match_product_id) filter (where match_product_id is not null))[1] as product_id,
           (array_agg(title order by row_index) filter (where title is not null))[1] as title,
           (array_agg(brand order by row_index) filter (where brand is not null))[1] as brand,
           (array_agg(model_ref order by row_index) filter (where model_ref is not null))[1] as model_ref,
           (array_agg(description order by row_index) filter (where description is not null))[1] as description,
           (array_agg(category_path order by row_index) filter (where category_path is not null))[1] as category_path,
           (array_agg(vat_rate order by row_index) filter (where vat_rate is not null))[1] as vat_rate,
           (select array_agg(distinct u) from rows r2, unnest(r2.image_urls) u where r2.gkey = rows.gkey) as images,
           min(row_index) as first_row
      from rows group by gkey order by first_row
  loop
    pid := g.product_id;
    if pid is null then
      if coalesce((j.options->>'create_new')::boolean, true) is false then continue; end if;
      bid := null;
      if g.brand is not null then
        insert into brands (name, slug) values (g.brand, lower(regexp_replace(g.brand, '[^A-Za-z0-9]+', '-', 'g')))
          on conflict (name) do update set name = excluded.name returning id into bid;
      end if;
      hnd := lower(regexp_replace(extensions.unaccent(g.title), '[^A-Za-z0-9]+', '-', 'g'));
      hnd := trim(both '-' from hnd); n := 2;
      while exists (select 1 from products where handle = hnd) loop hnd := hnd || '-' || n; n := n + 1; end loop;
      insert into products (handle, title, description_html, brand, brand_id, status, vat_rate, supplier_id, supplier_ref)
      values (hnd, g.title, case when g.description is not null then '<p>' || g.description || '</p>' end,
              g.brand, bid, v_status, coalesce(g.vat_rate, 23), j.supplier_id, g.model_ref)
      returning id into pid;
      created_p := created_p + 1;
      if g.category_path is not null then
        parts := string_to_array(g.category_path, '>'); parent := null;
        for i in 1..array_length(parts, 1) loop
          ppath := array_to_string(parts[1:i], '>');
          select id into cid from categories where path = ppath;
          if cid is null then
            insert into categories (parent_id, name, slug, path) values (parent, trim(parts[i]),
              lower(regexp_replace(extensions.unaccent(parts[i]), '[^A-Za-z0-9]+', '-', 'g')), ppath) returning id into cid;
          end if;
          parent := cid;
        end loop;
        insert into product_categories values (pid, cid) on conflict do nothing;
      end if;
      if g.images is not null then
        insert into product_images (product_id, url, position) select pid, u, row_number() over () - 1 from unnest(g.images) u;
      end if;
    end if;
    affected := affected || pid;

    for r in select * from import_rows where job_id = p_job and action in ('create','update')
               and coalesce(match_product_id::text, model_ref, supplier_sku, ean, id::text) = g.gkey order by row_index
    loop
      if r.match_variant_id is not null then
        update variants set
          cost_cents   = case when coalesce((j.options->>'update_costs')::boolean, true) then coalesce(r.cost_cents, cost_cents) else cost_cents end,
          supplier_sku = coalesce(r.supplier_sku, supplier_sku),
          ean          = coalesce(r.ean, ean)
        where id = r.match_variant_id;
        updated_v := updated_v + 1;
      else
        insert into variants (product_id, option_value, sku, supplier_sku, ean, cost_cents, price_cents, position)
        values (pid, coalesce(nullif(r.size, ''), 'Único'), r.supplier_sku, r.supplier_sku, r.ean, r.cost_cents,
                coalesce(r.rrp_cents, 0), (select count(*) from variants where product_id = pid))
        on conflict (product_id, option_value) do update set cost_cents = excluded.cost_cents,
          supplier_sku = coalesce(excluded.supplier_sku, variants.supplier_sku), ean = coalesce(excluded.ean, variants.ean)
        returning id into vid;
        created_v := created_v + 1;
      end if;
    end loop;
  end loop;

  -- recalcula preços dos produtos tocados
  perform 1 from apply_pricing(affected, false);
  -- produtos novos sem regra de margem e sem PVP ficariam a 0 €: ficam em rascunho
  update products set status = 'draft' where id = any(affected)
     and exists (select 1 from variants v where v.product_id = products.id and v.price_cents = 0);

  update import_jobs set status = 'applied', applied_at = now(),
         stats = stats || jsonb_build_object('produtos_criados', created_p, 'tamanhos_criados', created_v, 'tamanhos_atualizados', updated_v)
   where id = p_job;
  return jsonb_build_object('produtos_criados', created_p, 'tamanhos_criados', created_v, 'tamanhos_atualizados', updated_v);
end $$;


-- Estado automático do produto (corrige v1): só fica "Esgotado" quando NENHUM tamanho ativo se pode vender.
-- Tamanho sem stock controlado (stock null, envio do fornecedor) ou com encomenda em falta permitida conta como disponível.
create or replace function public.sync_product_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.product_id, old.product_id); sellable boolean; controlled boolean;
begin
  select bool_or(active and (stock is null or stock > 0 or allow_backorder)),
         bool_or(active and stock is not null)
    into sellable, controlled from variants where product_id = pid;
  if controlled then
    update products set status = case when sellable then 'active' else 'out_of_stock' end, updated_at = now()
     where id = pid and status in ('active','out_of_stock')
       and status <> case when sellable then 'active' else 'out_of_stock' end;
  end if;
  return null;
end $$;

-- ---------- Pesquisa (português, sem acentos) ----------
create or replace function public.immutable_unaccent(text) returns text
language sql immutable parallel safe as $$ select extensions.unaccent('extensions.unaccent', $1) $$;

create or replace function public.product_search_vector(p_title text, p_brand text, p_tags text[], p_excerpt text) returns tsvector
language sql immutable parallel safe as $$
  select setweight(to_tsvector('portuguese'::regconfig, immutable_unaccent(coalesce(p_title, ''))), 'A') ||
         setweight(to_tsvector('portuguese'::regconfig, immutable_unaccent(coalesce(p_brand, ''))), 'A') ||
         setweight(to_tsvector('portuguese'::regconfig, immutable_unaccent(coalesce(array_to_string(p_tags, ' '), ''))), 'B') ||
         setweight(to_tsvector('portuguese'::regconfig, immutable_unaccent(coalesce(p_excerpt, ''))), 'C')
$$;
alter table products add column search tsvector generated always as (product_search_vector(title, brand, tags, excerpt)) stored;
create index products_search_idx on products using gin(search);

-- ---------- Carrinhos (para checkout e recuperação de carrinhos abandonados) ----------
create table carts (
  id           uuid primary key default gen_random_uuid(),
  token        uuid not null unique default gen_random_uuid(),
  customer_id  uuid references customers(id) on delete set null,
  email        text,
  items        jsonb not null default '[]',      -- [{variant_id, qty}]
  status       text not null default 'open' check (status in ('open','converted','abandoned','recovered')),
  reminder_sent_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on carts(status, updated_at);
alter table carts enable row level security;

-- guarda o carrinho do visitante (identificado pelo token que fica no browser)
create or replace function public.save_cart(p_token uuid, p_items jsonb, p_email text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid := coalesce(p_token, gen_random_uuid());
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then raise exception 'carrinho inválido'; end if;
  insert into carts (token, items, email) values (t, p_items, nullif(lower(trim(p_email)), ''))
  on conflict (token) do update set items = excluded.items, email = coalesce(excluded.email, carts.email), updated_at = now()
    where carts.status = 'open';
  return t;
end $$;

-- ---------- Encomendas: token público para a página de confirmação ----------
alter table orders add column public_token uuid not null default gen_random_uuid();
alter table orders add column promotion_id uuid references promotions(id) on delete set null;
alter table orders add column cart_id uuid references carts(id) on delete set null;
alter table customers add column newsletter_consent_at timestamptz;
alter table customers add column terms_accepted_at timestamptz;

-- cálculo do carrinho (preços SEMPRE da base de dados) — usado no site para mostrar totais
create or replace function public.quote_cart(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  it jsonb; v record; lines jsonb := '[]'; subtotal int := 0; qty int;
  promo promotions; discount int := 0; ship int := 0; zones jsonb; z jsonb; region text; free_ship boolean := false;
  problems jsonb := '[]';
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
  select value->'zones' into zones from settings where key = 'public.shipping';
  select x into z from jsonb_array_elements(coalesce(zones, '[]')) x where x->>'region' = region;
  if z is null then problems := problems || jsonb_build_object('erro', 'zona de envio indisponível');
  else
    ship := (z->>'price_cents')::int;
    if free_ship or (coalesce((z->>'free_from_cents')::int, 0) > 0 and subtotal - discount >= (z->>'free_from_cents')::int) then ship := 0; end if;
  end if;
  if subtotal = 0 then ship := 0; end if;

  return jsonb_build_object('lines', lines, 'subtotal_cents', subtotal, 'discount_cents', discount, 'shipping_cents', ship,
                            'total_cents', subtotal - discount + ship, 'promotion_id', promo.id, 'problems', problems);
end $$;

-- cria a encomenda de forma atómica (valida, reserva stock, aplica cupão)
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

  q := quote_cart(jsonb_build_object('items', p->'items', 'promo_code', p->>'promo_code', 'region', ship->>'region'));
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
                      subtotal_cents, shipping_cents, discount_cents, total_cents, notes, promotion_id, cart_id)
  values (cid, v_email, 'pending_payment', pm, ship, p->'billing_address', nullif(p->>'nif', ''),
          (q->>'subtotal_cents')::int, (q->>'shipping_cents')::int, (q->>'discount_cents')::int, (q->>'total_cents')::int,
          nullif(left(p->>'notes', 1000), ''), nullif(q->>'promotion_id', '')::uuid,
          (select id from carts where token = nullif(p->>'cart_token', '')::uuid))
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

-- página de confirmação: só com número + token
create or replace function public.get_order_public(p_number int, p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('number', o.number, 'status', o.status, 'payment_method', o.payment_method, 'total_cents', o.total_cents,
           'subtotal_cents', o.subtotal_cents, 'shipping_cents', o.shipping_cents, 'discount_cents', o.discount_cents,
           'created_at', o.created_at, 'shipping_address', o.shipping_address,
           'items', (select jsonb_agg(jsonb_build_object('title', i.title, 'option_value', i.option_value, 'quantity', i.quantity, 'unit_price_cents', i.unit_price_cents)) from order_items i where i.order_id = o.id),
           'iban', case when o.payment_method = 'transfer' then (select value->>'iban' from settings where key = 'public.payments') end,
           'payment', (select jsonb_build_object('reference', reference, 'status', status, 'raw', raw - 'secret') from payments where order_id = o.id order by created_at desc limit 1))
    from orders o where o.number = p_number and o.public_token = p_token;
$$;

-- ---------- Páginas institucionais e redirecionamentos ----------
create table pages (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  body_html   text not null default '',
  seo_title   text,
  seo_description text,
  published   boolean not null default true,
  updated_at  timestamptz not null default now()
);
alter table pages enable row level security;
create policy "páginas publicadas" on pages for select using (published);

create table redirects (
  from_path   text primary key,
  to_path     text not null,
  code        int not null default 301 check (code in (301, 302)),
  hits        int not null default 0
);
alter table redirects enable row level security;
create policy "redirects públicos" on redirects for select using (true);

-- ---------- Permissões ----------
do $$
declare t text;
begin
  foreach t in array array['suppliers','pricing_rules','price_history','import_jobs','import_rows','carts','pages','redirects'] loop
    execute format('create policy "admin gere tudo" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

grant execute on function public.save_cart(uuid, jsonb, text), public.quote_cart(jsonb), public.place_order(jsonb),
  public.get_order_public(int, uuid) to anon, authenticated;
grant execute on function public.apply_pricing(uuid[], boolean), public.match_import_job(uuid), public.apply_import_job(uuid) to authenticated;
