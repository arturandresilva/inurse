-- Biblioteca de multimédia: lista ficheiros com tamanho e onde são usados; só para administradores
insert into auth.users(id, email) values ('00000000-0000-0000-0000-000000000001', 'a@x.pt') on conflict do nothing;
insert into admins(user_id, email) values ('00000000-0000-0000-0000-000000000001', 'a@x.pt') on conflict do nothing;
insert into storage.objects (bucket_id, name, metadata) values
  ('produtos', 'ctt/soca-azul.jpg', '{"size": 1234, "mimetype": "image/jpeg"}'),
  ('produtos', 'biblioteca/livre.png', '{"size": 99, "mimetype": "image/png"}'),
  ('campanhas', 'verao/video.mp4', '{"size": 5000, "mimetype": "video/mp4"}');
insert into products (handle, title, status) values ('soca-azul', 'Soca Azul', 'active');
insert into product_images (product_id, url) select id, 'https://x.supabase.co/storage/v1/object/public/produtos/ctt/soca-azul.jpg' from products where handle = 'soca-azul';
update settings set value = '{"hero_images":["https://x.supabase.co/storage/v1/object/public/produtos/biblioteca/livre.png"],"tiles":{}}' where key = 'public.home';
do $$ begin
  begin perform media_list('produtos'); raise notice 'ERRO: não-admin conseguiu listar';
  exception when others then null; end;
end $$;
set test.uid = '00000000-0000-0000-0000-000000000001';
do $$ declare r jsonb; it jsonb; begin
  r := media_list('produtos');
  if (r->>'total')::int <> 2 then raise notice 'ERRO: total %', r->>'total'; end if;
  select x into it from jsonb_array_elements(r->'items') x where x->>'name' = 'ctt/soca-azul.jpg';
  if it->'used' <> '["Produto: Soca Azul"]'::jsonb then raise notice 'ERRO: uso do produto %', it->'used'; end if;
  if (it->>'size')::int <> 1234 then raise notice 'ERRO: tamanho'; end if;
  select x into it from jsonb_array_elements(r->'items') x where x->>'name' = 'biblioteca/livre.png';
  if it->'used' <> '["Página inicial"]'::jsonb then raise notice 'ERRO: uso na página inicial %', it->'used'; end if;
  r := media_list('produtos', 'livre');
  if (r->>'total')::int <> 1 then raise notice 'ERRO: pesquisa'; end if;
  if (media_list('campanhas')->>'total')::int <> 1 then raise notice 'ERRO: campanhas'; end if;
  begin perform media_list('faturas'); raise notice 'ERRO: balde privado listado'; exception when others then null; end;
end $$;
