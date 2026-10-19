\set ON_ERROR_STOP 1
\pset pager off
-- avaliações e fila de emails
insert into products (id, handle, title, status) values ('70000000-0000-0000-0000-000000000001','clog-01-azul','CLOG 01 - AZUL','active'),('70000000-0000-0000-0000-000000000003','clog-02-rosa','CLOG 02 - ROSA','active');
insert into variants (id, product_id, option_value, price_cents) values ('70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','38',3000),('70000000-0000-0000-0000-000000000004','70000000-0000-0000-0000-000000000003','38',3000);
update settings set value='{"mbway":true,"multibanco":true,"transfer":true,"iban":"PT50000201231234567890154"}' where key='public.payments';
select place_order('{"email":"ana@x.pt","accept_terms":true,"payment_method":"transfer","shipping_address":{"name":"ana maria costa","line1":"R","zip":"4590-000","city":"P","region":"Continente"},"items":[{"variant_id":"70000000-0000-0000-0000-000000000002","qty":1},{"variant_id":"70000000-0000-0000-0000-000000000004","qty":1}]}'::jsonb) is not null;
do $$ declare o orders; r jsonb; begin
  select * into o from orders limit 1;
  if (select count(*) from email_outbox where kind = 'encomenda_recebida') <> 1 then raise notice 'ERRO email de encomenda recebida'; end if;
  begin perform review_order(o.number, o.public_token); raise notice 'ERRO avaliou antes de receber'; exception when others then null; end;
  update orders set status = 'shipped' where id = o.id;
  update orders set status = 'delivered' where id = o.id;
  if (select delivered_at from orders where id = o.id) is null then raise notice 'ERRO delivered_at'; end if;
  if (select send_after from email_outbox where kind = 'avaliacao') < now() + interval '23 hours' then raise notice 'ERRO atraso do email de avaliação'; end if;
  if (select count(*) from email_outbox where kind = 'encomenda_enviada') <> 1 then raise notice 'ERRO email enviada'; end if;
  begin perform review_order(o.number, gen_random_uuid()); raise notice 'ERRO chave errada'; exception when others then null; end;
  r := review_order(o.number, o.public_token);
  if jsonb_array_length(r->'products') <> 2 or (r->'products'->0->>'title') <> 'CLOG' then raise notice 'ERRO produtos %', r; end if;
  r := review_submit(o.number, o.public_token, jsonb_build_object('store', '{"rating":5,"body":"Rápido","suggestion":"Mais cores"}'::jsonb,
         'products', jsonb_build_array(jsonb_build_object('product_id', '70000000-0000-0000-0000-000000000001', 'rating', 4, 'body', 'Confortáveis'),
                                       jsonb_build_object('product_id', '70000000-0000-0000-0000-000000000003', 'rating', 9))));
  if (r->>'saved')::int <> 2 then raise notice 'ERRO gravou %', r; end if;
  if (select author from reviews limit 1) <> 'Ana C.' then raise notice 'ERRO autor %', (select author from reviews limit 1); end if;
  if (select model from reviews where kind = 'produto') <> 'CLOG' then raise notice 'ERRO modelo'; end if;
  if (select count(*) from public_reviews) <> 0 then raise notice 'ERRO publicado sem aprovação'; end if;
  begin perform review_submit(o.number, o.public_token, '{"store":{"rating":1}}'); raise notice 'ERRO repetiu avaliação';
  exception when others then null; end;
end $$;
-- publicada: aparece sem a sugestão
update reviews set status = 'published';
select kind, rating, author, body from public_reviews order by kind;
do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'public_reviews' and column_name in ('suggestion', 'order_id')) then raise notice 'ERRO a vista expõe dados privados'; end if;
  if (select count(*) from reviews) <> 2 then raise notice 'ERRO duplicou'; end if;
end $$;
\echo '-- um email por estado'
do $$ declare o orders; begin
  select * into o from orders limit 1;
  if (select count(*) from email_outbox where order_id = o.id and kind in ('encomenda_enviada','encomenda_entregue','avaliacao','encomenda_recebida')) <> 4 then
    raise notice 'ERRO emails por estado: %', (select string_agg(kind, ',') from email_outbox);
  end if;
end $$;
\echo '-- encomenda com língua'
do $$ declare r jsonb; begin
  r := place_order_l('{"locale":"fr","email":"jean@x.fr","accept_terms":true,"payment_method":"transfer","shipping_address":{"name":"Jean","line1":"R","zip":"4590-000","city":"P","region":"Continente"},"items":[{"variant_id":"70000000-0000-0000-0000-000000000002","qty":1}]}');
  if (select locale from orders where number = (r->>'number')::int) <> 'fr' then raise notice 'ERRO língua da encomenda'; end if;
end $$;
