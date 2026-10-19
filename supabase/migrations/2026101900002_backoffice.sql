-- Backoffice: marcas, stock controlado, promoções, configurações e acesso de administradores

-- ---------- Administradores ----------
create table admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);
alter table admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create policy "admin lê admins" on admins for select using (is_admin());

-- ---------- Marcas ----------
create table brands (
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique,
  slug      text not null unique,
  logo_url  text,
  position  int not null default 0
);
alter table brands enable row level security;
create policy "catálogo público" on brands for select using (true);
alter table products add column brand_id uuid references brands(id) on delete set null;
create index on products(brand_id);

-- ---------- Stock ----------
-- variants.stock: null = ainda não contado; o produto passa sozinho a "esgotado"/"ativo".
create table stock_movements (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references variants(id) on delete cascade,
  delta       int  not null,
  reason      text not null check (reason in ('entrada','venda','devolucao','ajuste','contagem')),
  order_id    uuid references orders(id) on delete set null,
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index on stock_movements(variant_id, created_at desc);
alter table stock_movements enable row level security;

create or replace function public.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update variants set stock = coalesce(stock, 0) + new.delta where id = new.variant_id;
  return new;
end $$;
create trigger trg_stock_movement after insert on stock_movements
  for each row execute function apply_stock_movement();

-- Define stock absoluto (contagem) registando a diferença no histórico
create or replace function public.set_stock(p_variant uuid, p_qty int, p_note text default null)
returns void language plpgsql security invoker set search_path = public as $$
declare cur int;
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  if p_qty < 0 then raise exception 'stock não pode ser negativo'; end if;
  select stock into cur from variants where id = p_variant for update;
  if not found then raise exception 'tamanho não encontrado'; end if;
  if cur is null then
    update variants set stock = 0 where id = p_variant; cur := 0;
  end if;
  if p_qty <> cur then
    insert into stock_movements (variant_id, delta, reason, note) values (p_variant, p_qty - cur, 'contagem', p_note);
  end if;
end $$;

create or replace function public.sync_product_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
declare tot int; declare counted int;
begin
  select coalesce(sum(greatest(stock,0)) filter (where active), 0),
         count(*) filter (where stock is not null and active)
    into tot, counted from variants where product_id = pid;
  if counted > 0 then
    update products set status = case when tot > 0 then 'active' else 'out_of_stock' end, updated_at = now()
     where id = pid and status in ('active','out_of_stock');
  end if;
  return null;
end $$;
create trigger trg_sync_status after insert or update of stock, active on variants
  for each row execute function sync_product_status();

-- ---------- Promoções / cupões ----------
create table promotions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  code          text unique,                 -- null = promoção automática sem código
  kind          text not null check (kind in ('percent','fixed','free_shipping')),
  value         numeric(10,2) not null default 0,  -- % ou € conforme kind
  min_order_cents int not null default 0,
  starts_at     timestamptz,
  ends_at       timestamptz,
  max_uses      int,
  uses          int not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table promotions enable row level security;

-- ---------- Configurações (portes, pagamentos, dados da loja) ----------
create table settings (
  key   text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table settings enable row level security;
create policy "configurações públicas" on settings for select using (key like 'public.%');

insert into settings (key, value) values
 ('public.store', '{"name":"iNurse","domain":"www.inurse.pt","email":"","phone":""}'),
 ('public.shipping', '{"zones":[
    {"region":"Continente","price_cents":0,"free_from_cents":0},
    {"region":"Açores","price_cents":0,"free_from_cents":0},
    {"region":"Madeira","price_cents":0,"free_from_cents":0}]}'),
 ('public.payments', '{"mbway":true,"multibanco":true,"transfer":true,"iban":""}'),
 ('invoicing', '{"provider":"invoicexpress","account":"","auto_invoice":true}');

-- ---------- Acesso total para administradores ----------
do $$
declare t text;
begin
  foreach t in array array['categories','products','product_categories','product_images','variants','brands',
    'customers','addresses','orders','order_items','payments','invoices','shipments',
    'stock_movements','promotions','settings','admins']
  loop
    execute format('create policy "admin gere tudo" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- Mostrar ao admin também produtos em rascunho/arquivados (a policy pública já cobre os restantes)
