-- =====================================================================
-- iNurse v2 — estatísticas de visitas (sem cookies) e trocas/devoluções na área de cliente
--  · page_views: uma linha por página vista. O visitante é uma impressão digital diária (hash de IP + navegador com um sal
--    que muda todos os dias e é apagado), por isso não se guarda o IP nem se segue ninguém de um dia para o outro.
--  · analytics_summary(de, até): resumo para o backoffice (visitantes, páginas, origens, aparelhos, funil e conversão)
--  · customer_me passa a incluir o que é preciso para pedir troca/devolução na área de cliente
-- =====================================================================
create table if not exists page_views (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  path        text not null,
  ref_host    text,
  utm_source  text,
  utm_medium  text,
  utm_campaign text,
  visitor     text not null,
  device      text,                 -- telemovel | tablet | computador
  country     text,
  locale      text
);
create index if not exists page_views_at on page_views(at);
alter table page_views enable row level security;
create policy "admin vê visitas" on page_views for select to authenticated using (is_admin());

-- um só sal, trocado quando o dia muda (o do dia anterior deixa de existir)
create table if not exists analytics_salt (id int primary key default 1 check (id = 1), day date not null, salt text not null);
alter table analytics_salt enable row level security;   -- só o servidor

-- chamado pela loja (rota /api/v) com o IP e o navegador, que não ficam guardados
create or replace function public.track_view(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare s text; d date := (now() at time zone 'Europe/Lisbon')::date; path text := left(coalesce(p->>'path', '/'), 300);
begin
  if path like '/admin%' or path like '/api%' then return; end if;
  select salt into s from analytics_salt where id = 1 and day = d;
  if s is null then
    insert into analytics_salt (id, day, salt) values (1, d, gen_random_uuid()::text || gen_random_uuid()::text)
    on conflict (id) do update set day = excluded.day, salt = excluded.salt where analytics_salt.day <> excluded.day;
    select salt into s from analytics_salt where id = 1;
  end if;
  insert into page_views (path, ref_host, utm_source, utm_medium, utm_campaign, visitor, device, country, locale)
  values (path, nullif(left(p->>'ref_host', 120), ''), nullif(left(p->>'utm_source', 80), ''), nullif(left(p->>'utm_medium', 80), ''), nullif(left(p->>'utm_campaign', 120), ''),
          left(encode(sha256(convert_to(s || coalesce(p->>'ip', '') || coalesce(p->>'ua', ''), 'UTF8')), 'hex'), 20),
          nullif(left(p->>'device', 20), ''), nullif(left(p->>'country', 2), ''), nullif(left(p->>'locale', 5), ''));
end $$;
revoke all on function public.track_view(jsonb) from public;
grant execute on function public.track_view(jsonb) to anon, authenticated;

create or replace function public.analytics_summary(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a timestamptz := (p_from::timestamp at time zone 'Europe/Lisbon'); b timestamptz := ((p_to + 1)::timestamp at time zone 'Europe/Lisbon');
  r jsonb; visitors int; orders_n int; revenue bigint;
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  -- visitante = impressão digital diária: conta visitantes por dia e soma
  select count(*) into visitors from (select distinct visitor, (at at time zone 'Europe/Lisbon')::date from page_views where at >= a and at < b) x;
  select count(*), coalesce(sum(total_cents), 0) into orders_n, revenue from orders where created_at >= a and created_at < b and status not in ('cancelled');
  with v as (select * from page_views where at >= a and at < b),
  vd as (select distinct visitor, (at at time zone 'Europe/Lisbon')::date as d from v)
  select jsonb_build_object(
    'visitors', visitors,
    'views', (select count(*) from v),
    'orders', orders_n, 'revenue_cents', revenue,
    'conversion', case when visitors > 0 then round(orders_n * 100.0 / visitors, 2) else 0 end,
    'daily', (select coalesce(jsonb_agg(x order by x.day), '[]') from (
        select g::date as day,
          (select count(*) from vd where vd.d = g::date) as visitors,
          (select count(*) from v where (v.at at time zone 'Europe/Lisbon')::date = g::date) as views,
          (select count(*) from orders o where (o.created_at at time zone 'Europe/Lisbon')::date = g::date and o.status <> 'cancelled') as orders
        from generate_series(p_from, p_to, interval '1 day') g) x),
    'pages', (select coalesce(jsonb_agg(x), '[]') from (select path, count(*) as views, count(distinct visitor) as visitors from v group by path order by count(*) desc limit 15) x),
    'sources', (select coalesce(jsonb_agg(x), '[]') from (
        select coalesce(utm_source, ref_host, 'direto') as source, count(distinct visitor) as visitors from v group by 1 order by 2 desc limit 12) x),
    'devices', (select coalesce(jsonb_agg(x), '[]') from (select coalesce(device, '?') as device, count(distinct visitor) as visitors from v group by 1 order by 2 desc) x),
    'countries', (select coalesce(jsonb_agg(x), '[]') from (select coalesce(country, '?') as country, count(distinct visitor) as visitors from v group by 1 order by 2 desc limit 10) x),
    'locales', (select coalesce(jsonb_agg(x), '[]') from (select coalesce(locale, 'pt') as locale, count(distinct visitor) as visitors from v group by 1 order by 2 desc) x),
    'funnel', jsonb_build_object(
        'visitors', visitors,
        'product', (select count(*) from (select distinct visitor, (at at time zone 'Europe/Lisbon')::date from v where path like '/produto/%') x),
        'cart', (select count(*) from (select distinct visitor, (at at time zone 'Europe/Lisbon')::date from v where path = '/carrinho') x),
        'checkout', (select count(*) from (select distinct visitor, (at at time zone 'Europe/Lisbon')::date from v where path like '/checkout%') x),
        'orders', orders_n)
  ) into r;
  return r;
end $$;
grant execute on function public.analytics_summary(date, date) to authenticated;

insert into settings (key, value) values ('public.analytics', '{"ga4_id":""}') on conflict (key) do nothing;


-- área de cliente: dados para pedir troca/devolução e ver o estado (etiqueta, seguimento)
create or replace function public.customer_me() returns jsonb
language plpgsql security definer set search_path = public as $$
declare cid uuid := my_customer_id(); c customers; rdays int := coalesce((select (value->>'return_days')::int from settings where key = 'public.store'), 14);
begin
  if cid is null then raise exception 'sessão inválida ou email por confirmar'; end if;
  select * into c from customers where id = cid;
  return jsonb_build_object(
    'profile', jsonb_build_object('email', c.email, 'name', c.name, 'phone', c.phone, 'nif', c.nif, 'company', c.company,
                                  'newsletter', c.newsletter, 'since', c.created_at,
                                  'legacy_orders', coalesce(c.legacy_total_orders, 0)),
    'addresses', (select coalesce(jsonb_agg(to_jsonb(a) - 'customer_id' order by a.is_default desc, a.kind), '[]') from addresses a where a.customer_id = cid),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object(
        'number', o.number, 'token', o.public_token, 'status', o.status, 'created_at', o.created_at, 'total_cents', o.total_cents,
        'payment_method', o.payment_method,
        'return_until', (select (coalesce(max(s.shipped_at), o.created_at) + make_interval(days => rdays + 5))::date from shipments s where s.order_id = o.id),
        'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'option_value', i.option_value, 'quantity', i.quantity,
                     'unit_price_cents', i.unit_price_cents, 'handle', p.handle,
                     'image', (select pi.url from product_images pi where pi.product_id = p.id order by pi.position limit 1))), '[]')
                    from order_items i left join variants v on v.id = i.variant_id left join products p on p.id = v.product_id where i.order_id = o.id),
        'tracking', (select coalesce(jsonb_agg(jsonb_build_object('carrier', s.carrier, 'code', s.tracking_code, 'status', s.status, 'shipped_at', s.shipped_at)), '[]')
                       from shipments s where s.order_id = o.id and s.tracking_code is not null),
        'invoices', (select coalesce(jsonb_agg(jsonb_build_object('number', iv.number, 'pdf_url', iv.pdf_url, 'status', iv.status)), '[]')
                       from invoices iv where iv.order_id = o.id and iv.pdf_url is not null),
        'returns', (select coalesce(jsonb_agg(jsonb_build_object('number', r.number, 'status', r.status, 'kind', r.kind, 'label_url', r.label_url, 'tracking_code', r.tracking_code)), '[]')
                      from returns r where r.order_id = o.id)
      ) order by o.created_at desc), '[]') from orders o where o.customer_id = cid),
    'favorites', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'handle', p.handle, 'title', p.title, 'status', p.status,
        'image', (select pi.url from product_images pi where pi.product_id = p.id order by pi.position limit 1),
        'price_cents', (select min(v.price_cents) from variants v where v.product_id = p.id and v.active and v.price_cents > 0)) order by f.created_at desc), '[]')
      from favorites f join products p on p.id = f.product_id where f.customer_id = cid and p.status in ('active','out_of_stock'))
  );
end $$;
grant execute on function public.customer_me() to authenticated;
