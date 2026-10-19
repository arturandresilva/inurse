-- =====================================================================
-- iNurse v2 — área de cliente: conta, histórico de compras, seguimento, faturas, moradas e favoritos
-- Tudo passa por funções que só devolvem os dados do próprio cliente (auth.uid()).
-- =====================================================================

create table favorites (
  customer_id uuid not null references customers(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (customer_id, product_id)
);
alter table favorites enable row level security;
create policy "admin gere tudo" on favorites for all to authenticated using (is_admin()) with check (is_admin());

-- cliente da sessão atual: liga a conta (auth) à ficha de cliente pelo email confirmado; cria a ficha se não existir
create or replace function public.my_customer_id() returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); u jsonb; em text; cid uuid;
begin
  if uid is null then return null; end if;
  select id into cid from customers where auth_user_id = uid;
  if cid is not null then return cid; end if;
  select to_jsonb(x) into u from auth.users x where x.id = uid;
  em := lower(u->>'email');
  if em is null then return null; end if;
  -- só com email confirmado se pode ver o histórico associado a esse email
  if u ? 'email_confirmed_at' and u->>'email_confirmed_at' is null then return null; end if;
  update customers set auth_user_id = uid where lower(email) = em and auth_user_id is null returning id into cid;
  if cid is null then
    insert into customers (email, auth_user_id) values (em, uid) on conflict (email) do nothing returning id into cid;
  end if;
  return cid;
end $$;
grant execute on function public.my_customer_id() to authenticated;

create or replace function public.customer_me() returns jsonb
language plpgsql security definer set search_path = public as $$
declare cid uuid := my_customer_id(); c customers;
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
        'items', (select coalesce(jsonb_agg(jsonb_build_object('title', i.title, 'option_value', i.option_value, 'quantity', i.quantity,
                     'unit_price_cents', i.unit_price_cents, 'handle', p.handle,
                     'image', (select pi.url from product_images pi where pi.product_id = p.id order by pi.position limit 1))), '[]')
                    from order_items i left join variants v on v.id = i.variant_id left join products p on p.id = v.product_id where i.order_id = o.id),
        'tracking', (select coalesce(jsonb_agg(jsonb_build_object('carrier', s.carrier, 'code', s.tracking_code, 'status', s.status, 'shipped_at', s.shipped_at)), '[]')
                       from shipments s where s.order_id = o.id and s.tracking_code is not null),
        'invoices', (select coalesce(jsonb_agg(jsonb_build_object('number', iv.number, 'pdf_url', iv.pdf_url, 'status', iv.status)), '[]')
                       from invoices iv where iv.order_id = o.id and iv.pdf_url is not null),
        'returns', (select coalesce(jsonb_agg(jsonb_build_object('number', r.number, 'status', r.status, 'kind', r.kind)), '[]') from returns r where r.order_id = o.id)
      ) order by o.created_at desc), '[]') from orders o where o.customer_id = cid),
    'favorites', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'handle', p.handle, 'title', p.title, 'status', p.status,
        'image', (select pi.url from product_images pi where pi.product_id = p.id order by pi.position limit 1),
        'price_cents', (select min(v.price_cents) from variants v where v.product_id = p.id and v.active and v.price_cents > 0)) order by f.created_at desc), '[]')
      from favorites f join products p on p.id = f.product_id where f.customer_id = cid and p.status in ('active','out_of_stock'))
  );
end $$;
grant execute on function public.customer_me() to authenticated;

create or replace function public.customer_update(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid := my_customer_id();
begin
  if cid is null then raise exception 'sessão inválida'; end if;
  if coalesce(p->>'nif', '') <> '' and (p->>'nif') !~ '^\d{9}$' then raise exception 'o NIF tem 9 algarismos'; end if;
  update customers set
    name = left(nullif(trim(p->>'name'), ''), 120), phone = left(nullif(trim(p->>'phone'), ''), 30),
    nif = nullif(trim(p->>'nif'), ''), company = left(nullif(trim(p->>'company'), ''), 120),
    newsletter = coalesce((p->>'newsletter')::boolean, newsletter),
    newsletter_consent_at = case when coalesce((p->>'newsletter')::boolean, false) and not newsletter then now() else newsletter_consent_at end
  where id = cid;
end $$;
grant execute on function public.customer_update(jsonb) to authenticated;

create or replace function public.customer_address_save(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid := my_customer_id(); aid uuid;
begin
  if cid is null then raise exception 'sessão inválida'; end if;
  if coalesce(p->>'kind', 'delivery') not in ('delivery','billing') then raise exception 'tipo de morada inválido'; end if;
  if coalesce(p->>'region', 'Continente') = 'Continente' and coalesce(p->>'zip', '') !~ '^\d{4}-\d{3}$' then raise exception 'código postal no formato 0000-000'; end if;
  if coalesce(trim(p->>'line1'), '') = '' or coalesce(trim(p->>'city'), '') = '' then raise exception 'falta a morada ou a localidade'; end if;
  if coalesce((p->>'is_default')::boolean, true) then
    update addresses set is_default = false where customer_id = cid and kind = coalesce(p->>'kind', 'delivery');
  end if;
  if nullif(p->>'id', '') is not null then
    update addresses set kind = coalesce(p->>'kind', 'delivery'), name = p->>'name', phone = p->>'phone', line1 = p->>'line1', line2 = p->>'line2',
           zip = p->>'zip', city = p->>'city', region = coalesce(p->>'region', 'Continente'), is_default = coalesce((p->>'is_default')::boolean, true)
     where id = (p->>'id')::uuid and customer_id = cid returning id into aid;
    if aid is null then raise exception 'morada não encontrada'; end if;
  else
    insert into addresses (customer_id, kind, name, phone, line1, line2, zip, city, region, is_default)
    values (cid, coalesce(p->>'kind', 'delivery'), p->>'name', p->>'phone', p->>'line1', p->>'line2', p->>'zip', p->>'city',
            coalesce(p->>'region', 'Continente'), coalesce((p->>'is_default')::boolean, true))
    returning id into aid;
  end if;
  return aid;
end $$;
grant execute on function public.customer_address_save(jsonb) to authenticated;

create or replace function public.customer_address_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from addresses where id = p_id and customer_id = my_customer_id();
end $$;
grant execute on function public.customer_address_delete(uuid) to authenticated;

create or replace function public.favorite_toggle(p_product uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare cid uuid := my_customer_id();
begin
  if cid is null then raise exception 'entra na tua conta para guardar favoritos'; end if;
  if exists (select 1 from favorites where customer_id = cid and product_id = p_product) then
    delete from favorites where customer_id = cid and product_id = p_product;
    return false;
  end if;
  insert into favorites (customer_id, product_id) select cid, id from products where id = p_product and status in ('active','out_of_stock');
  return found;
end $$;
grant execute on function public.favorite_toggle(uuid) to authenticated;

create or replace function public.my_favorite_ids() returns uuid[]
language sql security definer set search_path = public as $$
  select coalesce(array_agg(product_id), '{}') from favorites where customer_id = my_customer_id();
$$;
grant execute on function public.my_favorite_ids() to authenticated;

-- no backoffice: quem tem conta e quantos favoritos
create or replace view public.customer_overview with (security_invoker = true) as
select c.id, c.email, c.name, c.phone, c.nif, c.company, c.newsletter, c.created_at,
       coalesce(c.legacy_total_orders, 0) + coalesce(o.n, 0) as total_orders,
       coalesce(c.legacy_total_spent_cents, 0) + coalesce(o.cents, 0) as total_spent_cents,
       o.last_at as last_order_at,
       c.auth_user_id is not null as has_account
  from customers c
  left join (select customer_id, count(*) as n, sum(total_cents) as cents, max(created_at) as last_at
               from orders where status in ('paid','processing','shipped','delivered') group by customer_id) o
    on o.customer_id = c.id;
grant select on public.customer_overview to authenticated;
