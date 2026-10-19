-- Campanhas: a loja (anon) só vê campanhas ativas dentro das datas e os respetivos diapositivos
grant select on home_campaigns, home_slides to anon;
insert into home_campaigns (id, name, status, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'ativa', 'active', null, null),
  ('00000000-0000-0000-0000-0000000000c2', 'rascunho', 'draft', null, null),
  ('00000000-0000-0000-0000-0000000000c3', 'acabou', 'active', now() - interval '10 days', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000c4', 'futura', 'active', now() + interval '1 day', null);
insert into home_slides (campaign_id, media_url) select id, 'x.jpg' from home_campaigns;
insert into home_slides (campaign_id, kind, media_url) values ('00000000-0000-0000-0000-0000000000c1', 'video', 'v.mp4');
set role anon;
do $$ declare n int; s int; begin
  select count(*) into n from home_campaigns; select count(*) into s from home_slides;
  if n <> 1 then raise notice 'ERRO: anon vê % campanhas (esperado 1)', n; end if;
  if s <> 2 then raise notice 'ERRO: anon vê % diapositivos (esperado 2)', s; end if;
end $$;
reset role;
do $$ begin
  begin insert into home_slides (campaign_id, kind, media_url) values ('00000000-0000-0000-0000-0000000000c1', 'gif', 'a'); raise notice 'ERRO: tipo inválido aceite';
  exception when check_violation then null; end;
  if not exists (select 1 from settings where key = 'public.home') then raise notice 'ERRO: falta public.home'; end if;
end $$;

-- Conversas: aviso à loja quando precisa de resposta; resposta por email ao cliente
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000001','artur.impact@gmail.com');
set test.uid = '00000000-0000-0000-0000-000000000001';
insert into chat_conversations (id, name, contact, locale) values
  ('00000000-0000-0000-0000-0000000000d1', 'Rita', 'rita@x.pt', 'es'),
  ('00000000-0000-0000-0000-0000000000d2', null, '912345678', 'pt');
update chat_conversations set status = 'needs_human' where id = '00000000-0000-0000-0000-0000000000d1';
update chat_conversations set summary = 'x' where id = '00000000-0000-0000-0000-0000000000d1';   -- não repete o aviso
select chat_reply('00000000-0000-0000-0000-0000000000d1', 'Sí, ceden un poco.', true);
select chat_reply('00000000-0000-0000-0000-0000000000d2', 'Ligamos já.');                  -- só no balão
do $$ declare a int; b int; st text; begin
  select count(*) into a from email_outbox where kind = 'conversa_alerta';
  select count(*) into b from email_outbox where kind = 'conversa' and to_email = 'rita@x.pt' and payload->>'locale' = 'es';
  select status into st from chat_conversations where id = '00000000-0000-0000-0000-0000000000d1';
  if a <> 1 then raise notice 'ERRO: % avisos (esperado 1)', a; end if;
  if b <> 1 then raise notice 'ERRO: resposta por email não ficou na fila'; end if;
  if st <> 'open' then raise notice 'ERRO: conversa respondida ficou %', st; end if;
  begin perform chat_reply('00000000-0000-0000-0000-0000000000d2', 'Olá', true); raise notice 'ERRO: email inválido aceite';
  exception when others then if sqlerrm not like '%email válido%' then raise notice 'ERRO: %', sqlerrm; end if; end;
  if exists (select 1 from settings where key = 'public.chat' and value ? 'whatsapp') then raise notice 'ERRO: WhatsApp ainda nas definições'; end if;
end $$;

-- Manutenção: com a loja em manutenção não entram encomendas
update settings set value = '{"enabled":true}' where key = 'public.maintenance';
do $$ begin
  begin perform place_order_l('{"email":"x@y.pt","accept_terms":true,"items":[]}'::jsonb); raise notice 'ERRO: encomenda aceite em manutenção';
  exception when others then if sqlerrm not like '%manutenção%' then raise notice 'ERRO: %', sqlerrm; end if; end;
end $$;
update settings set value = '{"enabled":false}' where key = 'public.maintenance';
do $$ begin
  begin perform place_order_l('{"email":"x@y.pt","accept_terms":true,"items":[]}'::jsonb);
  exception when others then if sqlerrm like '%manutenção%' then raise notice 'ERRO: manutenção desligada continua a bloquear'; end if; end;
end $$;
