-- =====================================================================
-- iNurse v2 — assistente de contacto no site
--  · o cliente escreve no balão do site; a função "assistente" responde (IA) com o catálogo, portes, trocas e estado das encomendas
--  · cada conversa fica guardada (chat_conversations / chat_messages) e aparece no backoffice em "Conversas"
--  · quando o cliente pede uma pessoa ou o assistente não sabe, a conversa fica marcada "precisa de resposta"
--    e o Artur responde no backoffice (a resposta aparece no balão) ou pelo WhatsApp/email
-- =====================================================================
create table if not exists chat_conversations (
  id          uuid primary key default gen_random_uuid(),
  token       uuid not null default gen_random_uuid(),     -- chave do navegador do cliente (só ele lê a conversa)
  status      text not null default 'open' check (status in ('open', 'needs_human', 'closed')),
  locale      text not null default 'pt',
  page        text,
  name        text,
  contact     text,                                        -- email ou telefone deixado pelo cliente
  summary     text,
  unread      boolean not null default false,              -- há mensagens do cliente que o Artur ainda não viu
  messages    int not null default 0,
  cost_usd    numeric(10,4) not null default 0,
  created_at  timestamptz not null default now(),
  last_at     timestamptz not null default now()
);
create index if not exists chat_conversations_last on chat_conversations(last_at desc);

create table if not exists chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'staff')),
  content         text not null,
  created_at      timestamptz not null default clock_timestamp()
);
create index if not exists chat_messages_conv on chat_messages(conversation_id, created_at);

alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;
create policy "admin gere conversas" on chat_conversations for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin gere mensagens" on chat_messages for all to authenticated using (is_admin()) with check (is_admin());

-- resposta do Artur no backoffice
create or replace function public.chat_staff_reply(p_conversation uuid, p_text text) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  if coalesce(trim(p_text), '') = '' then raise exception 'escreve a resposta'; end if;
  insert into chat_messages (conversation_id, role, content) values (p_conversation, 'staff', left(trim(p_text), 2000));
  update chat_conversations set status = 'open', unread = false, last_at = now(), messages = messages + 1 where id = p_conversation;
end $$;
grant execute on function public.chat_staff_reply(uuid, text) to authenticated;

insert into settings (key, value) values ('public.chat', '{"enabled":true,"whatsapp":"351918889008","greeting":"Olá! Sou o assistente da iNurse. Posso ajudar a escolher modelo e tamanho, ou ver o estado da sua encomenda."}')
on conflict (key) do nothing;
