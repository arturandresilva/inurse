-- =====================================================================
-- iNurse v2 — moradas de recolha (várias) e devoluções (devolução fácil CTT)
-- =====================================================================

create table pickup_addresses (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,                    -- ex.: "Armazém Nursing Care", "Casa"
  supplier_id   uuid references suppliers(id) on delete set null,
  contact_name  text not null,
  phone         text,
  email         text,
  line1         text not null,
  line2         text,
  zip           text not null check (zip ~ '^\d{4}-\d{3}$'),
  city          text not null,
  country_code  text not null default 'PT',
  opening_hours text,                             -- ex.: "dias úteis 9h–17h" (para a CTT)
  is_default_pickup boolean not null default false,   -- recolha por defeito do fornecedor (ou da loja, se sem fornecedor)
  is_return_address boolean not null default false,   -- morada principal de devoluções (só uma)
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
-- só uma morada de devoluções e só uma recolha por defeito por fornecedor
create unique index pickup_one_return on pickup_addresses ((true)) where is_return_address and active;
create unique index pickup_one_default_per_supplier on pickup_addresses (coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_default_pickup and active;
alter table pickup_addresses enable row level security;
create policy "admin gere tudo" on pickup_addresses for all to authenticated using (is_admin()) with check (is_admin());

-- definir a morada de devoluções (troca a anterior numa só operação)
create or replace function public.set_return_address(p_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  update pickup_addresses set is_return_address = false where is_return_address and id <> p_id;
  update pickup_addresses set is_return_address = true where id = p_id and active;
  if not found then raise exception 'morada não encontrada ou inativa'; end if;
end $$;
grant execute on function public.set_return_address(uuid) to authenticated;

-- morada de recolha de um fornecedor (por defeito dele; senão a da loja)
create or replace function public.pickup_address_for(p_supplier uuid) returns pickup_addresses
language sql stable set search_path = public as $$
  select * from pickup_addresses where active and is_default_pickup
     and (supplier_id = p_supplier or supplier_id is null)
   order by (supplier_id is not distinct from p_supplier) desc limit 1;
$$;

alter table shipments add column pickup_address_id uuid references pickup_addresses(id) on delete set null;

-- ---------- Devoluções ----------
create sequence return_number_seq start 1;
create table returns (
  id              uuid primary key default gen_random_uuid(),
  number          int not null unique default nextval('return_number_seq'),
  order_id        uuid not null references orders(id) on delete cascade,
  reason          text not null check (reason in ('tamanho','defeito','engano_envio','nao_gostou','outro')),
  kind            text not null default 'reembolso' check (kind in ('reembolso','troca')),
  items           jsonb not null default '[]',          -- [{order_item_id, quantity, exchange_variant_id?}]
  customer_notes  text,
  status          text not null default 'requested'
                  check (status in ('requested','approved','label_sent','in_transit','received','refunded','exchanged','rejected','cancelled')),
  return_address_id uuid references pickup_addresses(id) on delete set null,   -- para onde volta (morada principal de devoluções)
  carrier         text default 'CTT Expresso',
  tracking_code   text,
  label_url       text,
  refund_cents    int,
  shipping_cost_cents int,               -- custo da devolução para a loja (s/IVA)
  restock         boolean not null default false,
  internal_notes  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on returns(order_id);
create index on returns(status);
alter table returns enable row level security;
create policy "admin gere tudo" on returns for all to authenticated using (is_admin()) with check (is_admin());

-- pedido de devolução pelo cliente (página pública com número + token da encomenda), até 14 dias após envio
create or replace function public.request_return(p_number int, p_token uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders; rid uuid; rnum int; ship timestamptz; it jsonb; ra uuid; lim int;
begin
  select * into o from orders where number = p_number and public_token = p_token;
  if o.id is null then raise exception 'encomenda não encontrada'; end if;
  if o.status not in ('shipped','delivered') then raise exception 'a encomenda ainda não foi enviada'; end if;
  select coalesce((value->>'return_days')::int, 14) into lim from settings where key = 'public.store';
  select max(shipped_at) into ship from shipments where order_id = o.id;
  if coalesce(ship, o.created_at) < now() - make_interval(days => coalesce(lim, 14) + 5) then
    raise exception 'o prazo de devolução terminou';
  end if;
  if exists (select 1 from returns where order_id = o.id and status not in ('rejected','cancelled')) then
    raise exception 'já existe um pedido de devolução para esta encomenda';
  end if;
  if jsonb_array_length(coalesce(p->'items', '[]')) = 0 then raise exception 'indique os artigos a devolver'; end if;
  for it in select * from jsonb_array_elements(p->'items') loop
    if not exists (select 1 from order_items where id = (it->>'order_item_id')::uuid and order_id = o.id
                     and quantity >= greatest(1, coalesce((it->>'quantity')::int, 1))) then
      raise exception 'artigo inválido';
    end if;
  end loop;
  select id into ra from pickup_addresses where is_return_address and active;
  insert into returns (order_id, reason, kind, items, customer_notes, return_address_id)
  values (o.id, coalesce(p->>'reason', 'outro'), coalesce(p->>'kind', 'reembolso'), p->'items', left(p->>'notes', 1000), ra)
  returning id, number into rid, rnum;
  return jsonb_build_object('return_number', rnum, 'status', 'requested');
end $$;
grant execute on function public.request_return(int, uuid, jsonb) to anon, authenticated;

-- o custo das devoluções entra na conta de resultados como despesa da loja (via despesas 'transportes'),
-- e os reembolsos já são descontados pelo estado 'refunded' da encomenda.
