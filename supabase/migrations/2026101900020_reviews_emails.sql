-- =====================================================================
-- iNurse v2 — avaliações (produto e experiência de compra) e emails ao cliente
--  · só quem comprou avalia: link com a chave da encomenda (email depois da entrega, área de cliente)
--  · as avaliações ficam "por aprovar" até o Artur as publicar no backoffice; a sugestão é só para a loja
--  · fila de emails (email_outbox): encomenda recebida, enviada e, X horas depois de entregue, pedido de avaliação
--    a função "emails" envia o que está na fila (de 10 em 10 minutos)
-- =====================================================================
alter table orders add column if not exists delivered_at timestamptz;

create or replace function public.orders_delivered_at() returns trigger language plpgsql as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' and new.delivered_at is null then new.delivered_at := now(); end if;
  return new;
end $$;
drop trigger if exists orders_delivered_at on orders;
create trigger orders_delivered_at before update of status on orders for each row execute function orders_delivered_at();

-- ---------- avaliações ----------
create table if not exists reviews (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('produto', 'loja')),
  order_id     uuid references orders(id) on delete set null,
  product_id   uuid references products(id) on delete set null,
  model        text,                                  -- modelo do produto no momento da avaliação (as cores partilham avaliações)
  rating       int not null check (rating between 1 and 5),
  title        text,
  body         text,
  suggestion   text,                                  -- só para a loja, nunca publicada
  author       text,                                  -- nome mostrado ("Ana C.")
  status       text not null default 'pending' check (status in ('pending', 'published', 'hidden')),
  reply        text,                                  -- resposta pública da loja
  created_at   timestamptz not null default now(),
  published_at timestamptz
);
create unique index if not exists reviews_store_once on reviews(order_id) where kind = 'loja';
create unique index if not exists reviews_product_once on reviews(order_id, product_id) where kind = 'produto';
create index if not exists reviews_public on reviews(kind, lower(model), status);
alter table reviews enable row level security;
create policy "admin gere avaliações" on reviews for all to authenticated using (is_admin()) with check (is_admin());

-- o que o público vê (sem sugestões nem ligação à encomenda)
create or replace view public.public_reviews as
  select id, kind, product_id, model, rating, title, body, author, reply, coalesce(published_at, created_at) as created_at
    from reviews where status = 'published';
grant select on public.public_reviews to anon, authenticated;

create or replace function public.review_author(p_name text) returns text language sql immutable as $$
  select case when coalesce(trim(p_name), '') = '' then 'Cliente iNurse'
              else initcap(split_part(trim(p_name), ' ', 1)) ||
                   case when position(' ' in trim(p_name)) > 0 then ' ' || upper(left(regexp_replace(trim(p_name), '^.*\s', ''), 1)) || '.' else '' end end;
$$;

-- Dados para a página "Avaliar a encomenda"
create or replace function public.review_order(p_number int, p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where number = p_number and public_token = p_token;
  if o.id is null then raise exception 'encomenda não encontrada'; end if;
  if o.status not in ('shipped', 'delivered') then raise exception 'pode avaliar depois de receber a encomenda'; end if;
  return jsonb_build_object('number', o.number, 'name', o.shipping_address->>'name',
    'store_done', exists (select 1 from reviews where order_id = o.id and kind = 'loja'),
    'products', (select coalesce(jsonb_agg(x order by x->>'title'), '[]') from (
        select distinct on (p.id) jsonb_build_object('product_id', p.id, 'title', coalesce(p.model, p.title), 'color', p.color, 'handle', p.handle,
               'image', (select url from product_images pi where pi.product_id = p.id order by position limit 1),
               'done', exists (select 1 from reviews r where r.order_id = o.id and r.product_id = p.id and r.kind = 'produto')) as x
          from order_items i join variants v on v.id = i.variant_id join products p on p.id = v.product_id where i.order_id = o.id) s));
end $$;
grant execute on function public.review_order(int, uuid) to anon, authenticated;

create or replace function public.review_submit(p_number int, p_token uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders; it jsonb; n int := 0; author text; s jsonb := p->'store'; pr products;
begin
  perform review_order(p_number, p_token);                       -- valida encomenda e estado
  select * into o from orders where number = p_number and public_token = p_token;
  author := review_author(coalesce(nullif(p->>'author', ''), o.shipping_address->>'name'));
  if s is not null and coalesce((s->>'rating')::int, 0) between 1 and 5
     and not exists (select 1 from reviews where order_id = o.id and kind = 'loja') then
    insert into reviews (kind, order_id, rating, body, suggestion, author)
    values ('loja', o.id, (s->>'rating')::int, left(nullif(trim(s->>'body'), ''), 2000), left(nullif(trim(s->>'suggestion'), ''), 2000), author);
    n := n + 1;
  end if;
  for it in select * from jsonb_array_elements(coalesce(p->'products', '[]')) loop
    continue when coalesce((it->>'rating')::int, 0) not between 1 and 5;
    select pr2.* into pr from products pr2 where pr2.id = (it->>'product_id')::uuid
       and exists (select 1 from order_items i join variants v on v.id = i.variant_id where i.order_id = o.id and v.product_id = pr2.id);
    continue when pr.id is null or exists (select 1 from reviews where order_id = o.id and product_id = pr.id and kind = 'produto');
    insert into reviews (kind, order_id, product_id, model, rating, title, body, author)
    values ('produto', o.id, pr.id, pr.model, (it->>'rating')::int, left(nullif(trim(it->>'title'), ''), 120), left(nullif(trim(it->>'body'), ''), 2000), author);
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'escolha pelo menos uma classificação de 1 a 5 estrelas'; end if;
  insert into order_events (order_id, kind, message) values (o.id, 'nota', 'O cliente deixou ' || n || ' avaliação(ões)');
  return jsonb_build_object('saved', n);
end $$;
grant execute on function public.review_submit(int, uuid, jsonb) to anon, authenticated;

create or replace function public.review_moderate(p_id uuid, p_status text, p_reply text default null) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  if p_status not in ('pending', 'published', 'hidden') then raise exception 'estado inválido'; end if;
  update reviews set status = p_status, reply = coalesce(nullif(trim(p_reply), ''), reply),
         published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end
   where id = p_id;
end $$;
grant execute on function public.review_moderate(uuid, text, text) to authenticated;

-- ---------- emails ao cliente ----------
create table if not exists email_outbox (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('encomenda_recebida', 'encomenda_enviada', 'avaliacao', 'teste')),
  order_id    uuid references orders(id) on delete cascade,
  to_email    text not null,
  send_after  timestamptz not null default now(),
  status      text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'error')),
  sent_at     timestamptz,
  attempts    int not null default 0,
  error       text,
  created_at  timestamptz not null default now()
);
create unique index if not exists email_outbox_once on email_outbox(order_id, kind) where order_id is not null;
create index if not exists email_outbox_due on email_outbox(status, send_after);
alter table email_outbox enable row level security;
create policy "admin vê emails" on email_outbox for select to authenticated using (is_admin());

insert into settings (key, value) values ('email', jsonb_build_object(
  'enabled', false, 'from', 'iNurse <info@inurse.pt>', 'reply_to', 'info@inurse.pt', 'site_url', 'https://www.inurse.pt',
  'review_delay_hours', 24,
  'kinds', jsonb_build_object('encomenda_recebida', true, 'encomenda_enviada', true, 'avaliacao', true)))
on conflict (key) do nothing;

create or replace function public.orders_enqueue_emails() returns trigger
language plpgsql security definer set search_path = public as $$
declare delay int;
begin
  if tg_op = 'INSERT' then
    insert into email_outbox (kind, order_id, to_email) values ('encomenda_recebida', new.id, new.email) on conflict do nothing;
  elsif new.status is distinct from old.status then
    if new.status = 'shipped' then
      insert into email_outbox (kind, order_id, to_email) values ('encomenda_enviada', new.id, new.email) on conflict do nothing;
    elsif new.status = 'delivered' then
      select coalesce((value->>'review_delay_hours')::int, 24) into delay from settings where key = 'email';
      insert into email_outbox (kind, order_id, to_email, send_after)
      values ('avaliacao', new.id, new.email, now() + make_interval(hours => coalesce(delay, 24))) on conflict do nothing;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists orders_enqueue_emails on orders;
create trigger orders_enqueue_emails after insert or update of status on orders for each row execute function orders_enqueue_emails();

-- ao ligar os emails pela primeira vez: o que já estava na fila não é enviado de repente
create or replace function public.email_active_since() returns trigger language plpgsql as $$
begin
  if new.key = 'email' and coalesce((new.value->>'enabled')::boolean, false) and new.value->>'active_since' is null then
    new.value := new.value || jsonb_build_object('active_since', now());
  end if;
  return new;
end $$;
drop trigger if exists email_active_since on settings;
create trigger email_active_since before insert or update on settings for each row execute function email_active_since();

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute $q$select cron.schedule('emails-pendentes', '*/10 * * * *', $c$
      select net.http_post(
        url := 'https://ssmckeparvmrahsnoypt.supabase.co/functions/v1/emails',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value->>'secret' from public.settings where key = 'cron')),
        body := '{"mode":"due"}'::jsonb,
        timeout_milliseconds := 60000)
    $c$)$q$;
  end if;
end $$;
