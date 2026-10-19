-- =====================================================================
-- iNurse v2 — faturação automática no InvoiceXpress
--  · invoice_payload(order) prepara a fatura-recibo (linhas sem IVA, desconto, portes repartidos por taxa de IVA)
--  · a função "faturas" (Edge) cria, finaliza, guarda o PDF num espaço privado e envia ao cliente por email
--  · o PDF abre por um link com chave própria (área de cliente e email), sem expor o espaço de ficheiros
--  · de 10 em 10 minutos o agendador fatura as encomendas pagas que ainda não têm fatura
-- =====================================================================
alter table invoices add column if not exists kind         text not null default 'fatura-recibo';
alter table invoices add column if not exists access_token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
alter table invoices add column if not exists storage_path text;
alter table invoices add column if not exists permalink    text;
alter table invoices add column if not exists total_cents  int;
alter table invoices add column if not exists sent_to      text;
alter table invoices add column if not exists error        text;
alter table invoices add column if not exists attempts     int not null default 0;
alter table invoices add column if not exists updated_at   timestamptz not null default now();
-- uma só fatura válida por encomenda (as que falharam ou foram anuladas não contam)
create unique index if not exists invoices_one_per_order on invoices(order_id) where kind = 'fatura-recibo' and status in ('pending', 'final');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('faturas', 'faturas', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;
drop policy if exists "admin lê faturas" on storage.objects;
create policy "admin lê faturas" on storage.objects for select to authenticated using (bucket_id = 'faturas' and public.is_admin());

insert into settings (key, value) values ('invoicing', '{"provider":"invoicexpress","account":"","auto_invoice":true,"send_email":true}')
on conflict (key) do update set value = jsonb_build_object('send_email', true) || settings.value;

-- Dados da fatura-recibo a partir da encomenda. Preços na loja são com IVA; no InvoiceXpress as linhas vão sem IVA.
create or replace function public.invoice_payload(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  o orders; cfg jsonb; addr jsonb; items jsonb := '[]'; disc numeric := 0; r record;
  ship_left int; rates int; i int := 0; part int; gross_goods int; lisbon date; nif text; cust customers;
begin
  select * into o from orders where id = p_order;
  if o.id is null then raise exception 'encomenda não encontrada'; end if;
  if o.status not in ('paid', 'processing', 'shipped', 'delivered') then
    raise exception 'só se fatura uma encomenda paga (estado atual: %)', order_status_label(o.status);
  end if;
  select value into cfg from settings where key = 'invoicing';
  select * into cust from customers where id = o.customer_id;
  addr := coalesce(nullif(o.billing_address, 'null'::jsonb), o.shipping_address);
  nif := nullif(regexp_replace(coalesce(o.nif, ''), '\D', '', 'g'), '');
  if o.subtotal_cents > 0 and o.discount_cents > 0 then disc := round(o.discount_cents * 100.0 / o.subtotal_cents, 4); end if;

  for r in select * from order_items where order_id = p_order order by title, option_value loop
    items := items || jsonb_build_object(
      'name', left(coalesce(nullif(r.sku, ''), 'ART-' || upper(left(md5(coalesce(r.variant_id, r.id)::text), 10))), 60),
      'description', r.title || coalesce(' — tamanho ' || nullif(r.option_value, ''), ''),
      'unit_price', round(r.unit_price_cents / 100.0 / (1 + r.vat_rate / 100.0), 6)::text,
      'quantity', r.quantity::text,
      'discount', disc::text,
      'tax', jsonb_build_object('name', 'IVA' || trim(to_char(r.vat_rate, 'FM990.##'))));
  end loop;

  -- portes: acompanham o IVA dos artigos (repartidos pelo valor de cada taxa)
  if o.shipping_cents > 0 then
    ship_left := o.shipping_cents;
    select sum(unit_price_cents * quantity) into gross_goods from order_items where order_id = p_order;
    select count(distinct vat_rate) into rates from order_items where order_id = p_order;
    for r in select vat_rate, sum(unit_price_cents * quantity) as g from order_items where order_id = p_order group by vat_rate order by vat_rate desc loop
      i := i + 1;
      part := case when i = rates or coalesce(gross_goods, 0) = 0 then ship_left else round(o.shipping_cents * r.g::numeric / gross_goods) end;
      ship_left := ship_left - part;
      continue when part <= 0;
      items := items || jsonb_build_object(
        'name', 'PORTES',
        'description', 'Portes de envio' || coalesce(' — ' || (o.shipping_method->>'label'), '') || case when rates > 1 then ' (IVA ' || trim(to_char(r.vat_rate, 'FM990.##')) || '%)' else '' end,
        'unit_price', round(part / 100.0 / (1 + r.vat_rate / 100.0), 6)::text,
        'quantity', '1', 'discount', '0',
        'tax', jsonb_build_object('name', 'IVA' || trim(to_char(r.vat_rate, 'FM990.##'))));
    end loop;
  end if;

  lisbon := (now() at time zone 'Europe/Lisbon')::date;
  return jsonb_build_object(
    'date', to_char(lisbon, 'DD/MM/YYYY'), 'due_date', to_char(lisbon, 'DD/MM/YYYY'),
    'reference', 'Encomenda #' || o.number,
    'observations', 'Encomenda #' || o.number || ' em inurse.pt · pagamento por ' ||
       case o.payment_method when 'mbway' then 'MB WAY' when 'multibanco' then 'Multibanco' when 'transfer' then 'transferência bancária' else coalesce(o.payment_method, '—') end,
    'sequence_id', nullif(cfg->>'sequence', ''),
    'client', jsonb_strip_nulls(jsonb_build_object(
       -- o InvoiceXpress identifica o cliente pelo código: com NIF, o NIF; sem NIF, o email (consumidor final)
       'code', case when nif is not null then 'NIF' || nif else 'CF-' || left(md5(lower(o.email)), 12) end,
       'name', left(coalesce(nullif(case when nif is not null then cust.company end, ''), nullif(addr->>'name', ''), cust.name, o.email), 100),
       'email', o.email,
       'fiscal_id', nif,
       'address', nullif(concat_ws(', ', nullif(addr->>'line1', ''), nullif(addr->>'line2', '')), ''),
       'postal_code', nullif(addr->>'zip', ''),
       'city', nullif(addr->>'city', ''),
       'phone', nullif(coalesce(addr->>'phone', cust.phone), ''),
       'country', case coalesce(addr->>'country_code', 'PT') when 'PT' then 'Portugal' else coalesce(addr->>'country_code', 'Portugal') end)),
    'items', items,
    'expected_total_cents', o.total_cents,
    'order_number', o.number);
end $$;
revoke all on function public.invoice_payload(uuid) from public, anon, authenticated;
do $$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then
  execute 'grant execute on function public.invoice_payload(uuid) to service_role'; end if; end $$;

-- Encomendas pagas sem fatura (para o agendador). Só depois de a faturação ter sido ligada.
create or replace function public.orders_to_invoice(p_limit int default 5) returns setof uuid
language sql stable security definer set search_path = public as $$
  select o.id from orders o
   where o.status in ('paid', 'processing', 'shipped', 'delivered')
     and o.paid_at >= coalesce((select (value->>'active_since')::timestamptz from settings where key = 'invoicing'), 'infinity'::timestamptz)
     and not exists (select 1 from invoices iv where iv.order_id = o.id and iv.kind = 'fatura-recibo'
                       and (iv.status = 'final' or (iv.status = 'pending' and iv.updated_at > now() - interval '15 minutes')
                            or (iv.status = 'error' and (iv.attempts >= 3 or iv.updated_at > now() - interval '30 minutes'))))
   order by o.paid_at limit p_limit;
$$;
revoke all on function public.orders_to_invoice(int) from public, anon, authenticated;
do $$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then
  execute 'grant execute on function public.orders_to_invoice(int) to service_role'; end if; end $$;

-- Ao ligar a emissão automática pela primeira vez fica a data: encomendas pagas antes disso não são faturadas sozinhas.
create or replace function public.invoicing_active_since() returns trigger
language plpgsql as $$
begin
  if new.key = 'invoicing' and coalesce((new.value->>'auto_invoice')::boolean, false) and coalesce(new.value->>'account', '') <> ''
     and new.value->>'active_since' is null then
    new.value := new.value || jsonb_build_object('active_since', now());
  end if;
  return new;
end $$;
drop trigger if exists invoicing_active_since on settings;
create trigger invoicing_active_since before insert or update on settings for each row execute function invoicing_active_since();

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute $q$select cron.schedule('faturas-pendentes', '*/10 * * * *', $c$
      select net.http_post(
        url := 'https://ssmckeparvmrahsnoypt.supabase.co/functions/v1/faturas',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value->>'secret' from public.settings where key = 'cron')),
        body := '{"mode":"due"}'::jsonb,
        timeout_milliseconds := 120000)
    $c$)$q$;
  end if;
end $$;
