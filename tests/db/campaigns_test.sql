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
