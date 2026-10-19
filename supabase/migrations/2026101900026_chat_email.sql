-- =====================================================================
-- iNurse v2 — conversas do site sem WhatsApp: quando o assistente não sabe, pede o email e respondemos por email
--  · aviso por email à loja quando uma conversa precisa de resposta ("conversa_alerta")
--  · a resposta escrita no backoffice pode seguir também por email para o cliente ("conversa")
-- =====================================================================
alter table email_outbox add column if not exists conversation_id uuid references chat_conversations(id) on delete cascade;
alter table email_outbox add column if not exists payload jsonb;
alter table email_outbox drop constraint if exists email_outbox_kind_check;
alter table email_outbox add constraint email_outbox_kind_check check (kind in (
  'encomenda_recebida', 'encomenda_paga', 'encomenda_preparacao', 'encomenda_enviada', 'encomenda_entregue',
  'encomenda_cancelada', 'encomenda_reembolsada', 'avaliacao', 'teste', 'conversa', 'conversa_alerta'));

-- resposta do Artur no backoffice (substitui chat_staff_reply; p_email: enviar também por email para o contacto deixado pelo cliente)
create or replace function public.chat_reply(p_conversation uuid, p_text text, p_email boolean default false) returns void
language plpgsql security invoker set search_path = public as $$
declare c chat_conversations;
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  if coalesce(trim(p_text), '') = '' then raise exception 'escreve a resposta'; end if;
  select * into c from chat_conversations where id = p_conversation;
  if not found then raise exception 'conversa não encontrada'; end if;
  insert into chat_messages (conversation_id, role, content) values (p_conversation, 'staff', left(trim(p_text), 2000));
  update chat_conversations set status = 'open', unread = false, last_at = now(), messages = messages + 1 where id = p_conversation;
  if p_email then
    if coalesce(c.contact, '') !~ '^\S+@\S+\.\S+$' then raise exception 'o cliente não deixou um email válido'; end if;
    insert into email_outbox (kind, conversation_id, to_email, payload)
    values ('conversa', p_conversation, c.contact, jsonb_build_object('text', left(trim(p_text), 2000), 'locale', c.locale, 'name', c.name));
  end if;
end $$;
grant execute on function public.chat_reply(uuid, text, boolean) to authenticated;

-- aviso à loja quando a conversa passa a "precisa de resposta" (uma vez por passagem)
create or replace function public.chat_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare dest text;
begin
  if new.status = 'needs_human' and old.status is distinct from 'needs_human' then
    select coalesce(nullif(value->>'alert_to', ''), nullif(value->>'reply_to', '')) into dest from settings where key = 'email';
    if dest is null then select nullif(value->>'email', '') into dest from settings where key = 'public.store'; end if;
    insert into email_outbox (kind, conversation_id, to_email, send_after) values ('conversa_alerta', new.id, coalesce(dest, 'info@inurse.pt'), now() + interval '1 minute');
  end if;
  return null;
end $$;
create or replace trigger chat_alert after update of status on chat_conversations for each row execute function public.chat_alert();

update settings set value = value - 'whatsapp' where key = 'public.chat';
