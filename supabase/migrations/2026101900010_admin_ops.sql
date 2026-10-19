-- =====================================================================
-- iNurse v2 — operações do backoffice: histórico da encomenda, estados, envios e notas
-- =====================================================================

create table order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  kind        text not null check (kind in ('estado','nota','envio','pagamento','fatura','custos','devolucao')),
  message     text not null,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default clock_timestamp()
);
create index on order_events(order_id, created_at);
alter table order_events enable row level security;
create policy "admin gere tudo" on order_events for all to authenticated using (is_admin()) with check (is_admin());

create or replace function public.order_status_label(s text) returns text language sql immutable as $$
  select case s when 'pending_payment' then 'a aguardar pagamento' when 'paid' then 'paga' when 'processing' then 'em preparação'
    when 'shipped' then 'enviada' when 'delivered' then 'entregue' when 'cancelled' then 'cancelada' when 'refunded' then 'reembolsada' else s end
$$;

-- Muda o estado de uma encomenda com as regras do negócio:
--  · "paga" regista a data de pagamento;
--  · "cancelada" devolve ao stock as unidades que tinham sido descontadas (só tamanhos com stock controlado);
--  · encomendas canceladas ou reembolsadas já não mudam de estado.
create or replace function public.set_order_status(p_order uuid, p_status text, p_note text default null) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare o orders; m record; restored int := 0;
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  if p_status not in ('pending_payment','paid','processing','shipped','delivered','cancelled','refunded') then
    raise exception 'estado inválido';
  end if;
  select * into o from orders where id = p_order for update;
  if o.id is null then raise exception 'encomenda não encontrada'; end if;
  if o.status = p_status then return jsonb_build_object('status', p_status); end if;
  if o.status in ('cancelled','refunded') then
    raise exception 'esta encomenda está %: já não pode mudar de estado', order_status_label(o.status);
  end if;
  if p_status = 'refunded' and o.status = 'pending_payment' then
    raise exception 'uma encomenda que não foi paga cancela-se, não se reembolsa';
  end if;

  update orders set status = p_status,
         paid_at = case when p_status in ('paid','processing','shipped','delivered') and paid_at is null then now() else paid_at end
   where id = p_order;

  if p_status in ('cancelled','refunded') then
    for m in select variant_id, -sum(delta) as qty from stock_movements
              where order_id = p_order and reason = 'venda' group by variant_id having sum(delta) < 0 loop
      insert into stock_movements (variant_id, delta, reason, order_id, note)
      values (m.variant_id, m.qty, 'devolucao', p_order, 'Encomenda #' || o.number || ' ' || order_status_label(p_status));
      restored := restored + m.qty;
    end loop;
  end if;

  insert into order_events (order_id, kind, message)
  values (p_order, 'estado', 'Estado: ' || order_status_label(o.status) || ' → ' || order_status_label(p_status) || coalesce(' — ' || nullif(p_note, ''), ''));
  return jsonb_build_object('status', p_status, 'stock_reposto', restored);
end $$;
grant execute on function public.set_order_status(uuid, text, text) to authenticated;

-- Regista um envio (manual ou vindo da API CTT) e marca a encomenda como enviada.
create or replace function public.add_shipment(p_order uuid, p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare o orders; sid uuid; pa pickup_addresses;
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  select * into o from orders where id = p_order for update;
  if o.id is null then raise exception 'encomenda não encontrada'; end if;
  if o.status in ('pending_payment','cancelled','refunded') then
    raise exception 'só se envia uma encomenda paga (estado atual: %)', order_status_label(o.status);
  end if;
  if nullif(p->>'pickup_address_id', '') is not null then
    select * into pa from pickup_addresses where id = (p->>'pickup_address_id')::uuid;
  end if;
  insert into shipments (order_id, carrier, service, tracking_code, label_url, status, shipped_at, supplier_id,
                         pickup_address_id, pickup_address, pickup_date, weight_g, parcels)
  values (p_order, coalesce(nullif(p->>'carrier', ''), 'CTT Expresso'), coalesce(nullif(p->>'service', ''), '48h'),
          nullif(trim(p->>'tracking_code'), ''), nullif(p->>'label_url', ''), coalesce(nullif(p->>'status', ''), 'in_transit'), now(),
          coalesce(nullif(p->>'supplier_id', '')::uuid, pa.supplier_id), pa.id,
          case when pa.id is not null then to_jsonb(pa) - 'id' - 'created_at' end,
          nullif(p->>'pickup_date', '')::date, coalesce(nullif(p->>'weight_g', '')::int, o.weight_g),
          coalesce(nullif(p->>'parcels', '')::int, 1))
  returning id into sid;
  if o.status <> 'shipped' then perform set_order_status(p_order, 'shipped', null); end if;
  insert into order_events (order_id, kind, message)
  values (p_order, 'envio', 'Envio ' || coalesce(nullif(p->>'carrier', ''), 'CTT Expresso') ||
          coalesce(' · seguimento ' || nullif(trim(p->>'tracking_code'), ''), ' · sem código de seguimento') ||
          coalesce(' · recolha em ' || pa.label, ''));
  return sid;
end $$;
grant execute on function public.add_shipment(uuid, jsonb) to authenticated;

-- Nota interna na encomenda
create or replace function public.add_order_note(p_order uuid, p_text text) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  if coalesce(trim(p_text), '') = '' then raise exception 'escreve a nota'; end if;
  insert into order_events (order_id, kind, message) values (p_order, 'nota', left(trim(p_text), 2000));
end $$;
grant execute on function public.add_order_note(uuid, text) to authenticated;

-- Custos reais da encomenda (corrigidos com as faturas): o Contabilista passa a usá-los
create or replace function public.set_order_costs(p_order uuid, p jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  update orders set
    cost_supplier_shipping_cents = coalesce(nullif(p->>'supplier_shipping', '')::int, cost_supplier_shipping_cents),
    cost_payment_fee_cents       = coalesce(nullif(p->>'payment_fee', '')::int, cost_payment_fee_cents),
    cost_carrier_cents           = coalesce(nullif(p->>'carrier', '')::int, cost_carrier_cents),
    cost_packaging_cents         = coalesce(nullif(p->>'packaging', '')::int, cost_packaging_cents),
    costs_confirmed = true
  where id = p_order;
  if not found then raise exception 'encomenda não encontrada'; end if;
  insert into order_events (order_id, kind, message) values (p_order, 'custos', 'Custos confirmados com as faturas');
end $$;
grant execute on function public.set_order_costs(uuid, jsonb) to authenticated;

-- Pesquisa de clientes com totais (histórico CTT + encomendas novas)
create or replace view public.customer_overview with (security_invoker = true) as
select c.id, c.email, c.name, c.phone, c.nif, c.company, c.newsletter, c.created_at,
       c.legacy_total_orders + coalesce(o.n, 0) as total_orders,
       c.legacy_total_spent_cents + coalesce(o.cents, 0) as total_spent_cents,
       o.last_at as last_order_at
  from customers c
  left join (select customer_id, count(*) as n, sum(total_cents) as cents, max(created_at) as last_at
               from orders where status in ('paid','processing','shipped','delivered') group by customer_id) o
    on o.customer_id = c.id;
grant select on public.customer_overview to authenticated;
