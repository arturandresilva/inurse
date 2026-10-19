-- Loja própria — esquema base (Fase 1)
-- Preços guardados em cêntimos, COM IVA incluído (preço que o cliente vê).
-- O valor sem IVA calcula-se a partir de vat_rate quando for preciso (faturação).

create extension if not exists "pgcrypto";

-- ---------- Catálogo ----------
create table categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references categories(id) on delete cascade,
  name        text not null,
  slug        text not null,
  path        text not null unique,          -- ex.: 'CALÇADO>SOCAS'
  position    int  not null default 0
);

create table products (
  id               uuid primary key default gen_random_uuid(),
  handle           text not null unique,     -- slug do URL
  legacy_handle    text,                     -- handle original na loja CTT (para redirecionamentos)
  title            text not null,
  excerpt          text,
  description_html text,
  brand            text,
  tags             text[] not null default '{}',
  status           text not null default 'active'
                   check (status in ('active','out_of_stock','draft','archived')),
  vat_rate         numeric(4,2) not null default 23,   -- 23 calçado, 6 meias terapêuticas
  weight_g         int,
  featured         boolean not null default false,
  option_name      text default 'Tamanho',
  seo_title        text,
  seo_description  text,
  position         int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table product_categories (
  product_id  uuid references products(id) on delete cascade,
  category_id uuid references categories(id) on delete cascade,
  primary key (product_id, category_id)
);

create table product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  url         text not null,                 -- a migrar do CDN dos CTT para o Storage
  position    int  not null default 0
);

create table variants (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products(id) on delete cascade,
  option_value text not null,                -- tamanho: '38', '35/36', 'II'…
  sku          text,
  price_cents  int  not null check (price_cents >= 0),     -- com IVA
  compare_at_cents int,                      -- preço "antes" para promoções
  stock        int,                          -- null = stock não controlado
  allow_backorder boolean not null default false,
  active       boolean not null default true,
  position     int not null default 0,
  unique (product_id, option_value)
);

-- ---------- Clientes ----------
create table customers (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique,               -- ligação a auth.users quando o cliente cria conta
  email           text not null unique,
  name            text,
  company         text,
  nif             text,
  phone           text,
  newsletter      boolean not null default false,
  internal_notes  text,
  legacy_total_spent_cents int default 0,    -- histórico vindo dos CTT
  legacy_total_orders      int default 0,
  created_at      timestamptz not null default now()
);

create table addresses (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  kind         text not null check (kind in ('delivery','billing')),
  name         text, phone text,
  line1        text, line2 text,
  zip          text, city text,
  region       text,                         -- Continente / Açores / Madeira (portes diferentes)
  country_code text not null default 'PT',
  is_default   boolean not null default true
);

-- ---------- Encomendas (estrutura pronta para as fases 2–4) ----------
create sequence order_number_seq start 1001;

create table orders (
  id               uuid primary key default gen_random_uuid(),
  number           int  not null unique default nextval('order_number_seq'),
  customer_id      uuid references customers(id),
  email            text not null,
  status           text not null default 'pending_payment'
                   check (status in ('pending_payment','paid','processing','shipped','delivered','cancelled','refunded')),
  payment_method   text check (payment_method in ('mbway','multibanco','transfer')),
  shipping_address jsonb not null,
  billing_address  jsonb,
  nif              text,
  subtotal_cents   int not null,
  shipping_cents   int not null default 0,
  discount_cents   int not null default 0,
  total_cents      int not null,
  notes            text,
  created_at       timestamptz not null default now(),
  paid_at          timestamptz
);

create table order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  variant_id  uuid references variants(id),
  title       text not null,                 -- cópia no momento da compra
  option_value text,
  sku         text,
  vat_rate    numeric(4,2) not null,
  unit_price_cents int not null,
  quantity    int not null check (quantity > 0)
);

create table payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  provider    text not null,                 -- ifthenpay / eupago / manual
  method      text not null,
  reference   text,                          -- entidade/referência MB, id MB WAY…
  amount_cents int not null,
  status      text not null default 'pending' check (status in ('pending','paid','failed','expired','refunded')),
  raw         jsonb,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);

create table invoices (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  provider    text not null default 'invoicexpress',
  external_id text,
  number      text,
  pdf_url     text,
  status      text not null default 'pending',
  created_at  timestamptz not null default now()
);

create table shipments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  carrier     text,
  service     text,
  tracking_code text,
  label_url   text,
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  shipped_at  timestamptz
);

create index on variants(product_id);
create index on product_images(product_id);
create index on addresses(customer_id);
create index on orders(customer_id);
create index on orders(status);

-- ---------- Segurança ----------
-- Tudo fechado por omissão. A loja pública só lê catálogo ativo;
-- o backoffice usa a service role (servidor), nunca o browser.
alter table categories          enable row level security;
alter table products            enable row level security;
alter table product_categories  enable row level security;
alter table product_images      enable row level security;
alter table variants            enable row level security;
alter table customers           enable row level security;
alter table addresses           enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table payments            enable row level security;
alter table invoices            enable row level security;
alter table shipments           enable row level security;

create policy "catálogo público" on categories         for select using (true);
create policy "catálogo público" on products           for select using (status in ('active','out_of_stock'));
create policy "catálogo público" on product_categories for select using (true);
create policy "catálogo público" on product_images     for select using (true);
create policy "catálogo público" on variants           for select using (active);

create policy "o cliente vê os seus dados" on customers for select using (auth_user_id = auth.uid());
create policy "o cliente vê as suas moradas" on addresses for select
  using (customer_id in (select id from customers where auth_user_id = auth.uid()));
create policy "o cliente vê as suas encomendas" on orders for select
  using (customer_id in (select id from customers where auth_user_id = auth.uid()));
create policy "o cliente vê os itens das suas encomendas" on order_items for select
  using (order_id in (select o.id from orders o join customers c on c.id = o.customer_id where c.auth_user_id = auth.uid()));
