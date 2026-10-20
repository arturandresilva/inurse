-- Redes sociais: canais novos nas campanhas e perfis nas definições públicas
do $$ begin
  insert into campaigns (channel, title, content) values ('tiktok', 'Vídeo socas', '{"caption":"x","image_url":"https://x/y.png"}');
  insert into campaigns (channel, title) values ('pinterest', 'Pin');
  begin insert into campaigns (channel, title) values ('myspace', 'x'); raise notice 'ERRO: canal inválido aceite';
  exception when check_violation then null; end;
  if (select published from campaigns where title = 'Pin') <> '{}'::jsonb then raise notice 'ERRO: published por omissão'; end if;
  if not exists (select 1 from settings where key = 'public.social') then raise notice 'ERRO: falta public.social'; end if;
end $$;
