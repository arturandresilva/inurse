-- =====================================================================
-- iNurse v2 — o cliente recebe um email a cada mudança de estado da encomenda
-- (recebida, paga, em preparação, enviada, entregue, cancelada, reembolsada) e, depois da entrega, o pedido de avaliação
-- =====================================================================
alter table email_outbox drop constraint if exists email_outbox_kind_check;
alter table email_outbox add constraint email_outbox_kind_check check (kind in (
  'encomenda_recebida', 'encomenda_paga', 'encomenda_preparacao', 'encomenda_enviada', 'encomenda_entregue',
  'encomenda_cancelada', 'encomenda_reembolsada', 'avaliacao', 'teste'));

create or replace function public.orders_enqueue_emails() returns trigger
language plpgsql security definer set search_path = public as $$
declare delay int; k text;
begin
  if tg_op = 'INSERT' then
    insert into email_outbox (kind, order_id, to_email) values ('encomenda_recebida', new.id, new.email) on conflict do nothing;
    return null;
  end if;
  if new.status is not distinct from old.status then return null; end if;
  k := case new.status when 'paid' then 'encomenda_paga' when 'processing' then 'encomenda_preparacao' when 'shipped' then 'encomenda_enviada'
                       when 'delivered' then 'encomenda_entregue' when 'cancelled' then 'encomenda_cancelada' when 'refunded' then 'encomenda_reembolsada' end;
  if k is not null then
    -- envio: dá tempo a que o código de seguimento fique registado
    insert into email_outbox (kind, order_id, to_email, send_after)
    values (k, new.id, new.email, now() + case when k = 'encomenda_enviada' then interval '2 minutes' else interval '0' end) on conflict do nothing;
  end if;
  if new.status = 'delivered' then
    select coalesce((value->>'review_delay_hours')::int, 24) into delay from settings where key = 'email';
    insert into email_outbox (kind, order_id, to_email, send_after)
    values ('avaliacao', new.id, new.email, now() + make_interval(hours => coalesce(delay, 24))) on conflict do nothing;
  end if;
  return null;
end $$;
