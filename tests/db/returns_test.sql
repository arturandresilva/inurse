\set ON_ERROR_STOP 1
\pset pager off
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000001','artur.impact@gmail.com');
set test.uid = '00000000-0000-0000-0000-000000000001';
insert into suppliers (id, name) values ('30000000-0000-0000-0000-000000000001','Nursing Care');
insert into pickup_addresses (id, label, supplier_id, contact_name, line1, zip, city, is_default_pickup) values
 ('50000000-0000-0000-0000-000000000001','Armazém Nursing Care','30000000-0000-0000-0000-000000000001','Armazém','Rua X 1','4000-001','Porto', true),
 ('50000000-0000-0000-0000-000000000002','Casa (iNurse)', null,'Artur Silva','Rua Y 2','4590-001','Paços de Ferreira', true);
select set_return_address('50000000-0000-0000-0000-000000000002');
select label from pickup_addresses where is_return_address;
select set_return_address('50000000-0000-0000-0000-000000000001');
select label, is_return_address from pickup_addresses order by label;
\echo '-- segunda recolha por defeito para o mesmo fornecedor deve falhar:'
do $$ begin insert into pickup_addresses (label, supplier_id, contact_name, line1, zip, city, is_default_pickup) values ('Outro','30000000-0000-0000-0000-000000000001','A','R','4000-002','Porto',true); raise notice 'ERRO'; exception when unique_violation then raise notice 'ok, recusado'; end $$;
select (pickup_address_for('30000000-0000-0000-0000-000000000001')).label forn, (pickup_address_for(null)).label loja, (pickup_address_for(gen_random_uuid())).label outro;
-- encomenda enviada
insert into products (id, handle, title, status, vat_rate) values ('40000000-0000-0000-0000-000000000001','b','B','active',23);
insert into variants (id, product_id, option_value, price_cents) values ('40000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','38',5000);
update settings set value='{"mbway":true,"multibanco":true,"transfer":true,"iban":"PT50000201231234567890154"}' where key='public.payments';
update settings set value=value||'{"zones":[{"region":"Continente","price_cents":450,"free_from_cents":0}]}' where key='public.shipping';
reset test.uid;
select place_order('{"email":"x@y.pt","accept_terms":true,"payment_method":"transfer","shipping_address":{"name":"X","line1":"R","zip":"4590-000","city":"P","region":"Continente"},"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":1}]}'::jsonb) as o \gset
\echo '-- devolução antes de enviada falha:'
do $$ begin perform request_return(1001, (select public_token from orders where number=1001), '{"items":[]}'); raise notice 'ERRO'; exception when others then raise notice 'ok: %', sqlerrm; end $$;
update orders set status='shipped';
insert into shipments (order_id, status, shipped_at, pickup_address_id) select id, 'in_transit', now(), '50000000-0000-0000-0000-000000000001' from orders;
select request_return(1001, (select public_token from orders where number=1001),
  jsonb_build_object('reason','tamanho','kind','troca','items', jsonb_build_array(jsonb_build_object('order_item_id',(select id from order_items limit 1),'quantity',1))));
select r.number, r.status, r.kind, a.label morada_devolucao from returns r left join pickup_addresses a on a.id = r.return_address_id;
\echo '-- token errado e pedido duplicado falham:'
do $$ begin perform request_return(1001, gen_random_uuid(), '{"items":[{}]}'); raise notice 'ERRO'; exception when others then raise notice 'ok: %', sqlerrm; end $$;
do $$ begin perform request_return(1001, (select public_token from orders where number=1001), jsonb_build_object('items', jsonb_build_array(jsonb_build_object('order_item_id',(select id from order_items limit 1))))); raise notice 'ERRO'; exception when others then raise notice 'ok: %', sqlerrm; end $$;
do $$ begin perform set_return_address('50000000-0000-0000-0000-000000000002'); raise notice 'ERRO'; exception when others then raise notice 'ok anon: %', sqlerrm; end $$;
