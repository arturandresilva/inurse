\set ON_ERROR_STOP 1
\pset pager off
-- área de cliente: ligação pela conta, só os próprios dados, favoritos, moradas
insert into products (id, handle, title, status) values ('40000000-0000-0000-0000-000000000001','b','Soca B','active');
insert into variants (id, product_id, option_value, price_cents) values ('40000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','38',5000);
update settings set value='{"mbway":true,"multibanco":true,"transfer":true,"iban":"PT50000201231234567890154"}' where key='public.payments';
select place_order('{"email":"Ana@Exemplo.pt","accept_terms":true,"payment_method":"transfer","shipping_address":{"name":"Ana","line1":"R","zip":"4590-000","city":"P","region":"Continente"},"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":1}]}'::jsonb) is not null;
select place_order('{"email":"rui@exemplo.pt","accept_terms":true,"payment_method":"transfer","shipping_address":{"name":"Rui","line1":"R","zip":"4590-000","city":"P","region":"Continente"},"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":2}]}'::jsonb) is not null;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a1','ana@exemplo.pt'), ('00000000-0000-0000-0000-0000000000b2','nova@exemplo.pt');

\echo '-- sem sessão falha:'
do $$ begin perform customer_me(); raise notice 'ERRO'; exception when others then raise notice 'ok: %', sqlerrm; end $$;

set test.uid = '00000000-0000-0000-0000-0000000000a1';
select jsonb_array_length(customer_me()->'orders') as encomendas_da_ana, customer_me()->'orders'->0->>'number' as numero;
do $$ begin
  if jsonb_array_length(customer_me()->'orders') <> 1 then raise notice 'ERRO a Ana devia ver só a sua encomenda'; end if;
  if (select auth_user_id from customers where lower(email)='ana@exemplo.pt') is null then raise notice 'ERRO conta não ligada'; end if;
end $$;
select customer_update('{"name":"Ana Costa","nif":"123456789","newsletter":true}');
do $$ begin perform customer_update('{"nif":"12"}'); raise notice 'ERRO'; exception when others then raise notice 'ok: %', sqlerrm; end $$;
select customer_address_save('{"name":"Ana","line1":"Rua 1","zip":"4000-001","city":"Porto"}') is not null;
select customer_address_save('{"name":"Ana","line1":"Rua 2","zip":"4000-002","city":"Porto"}') is not null;
select count(*) filter (where is_default) as por_defeito, count(*) as total from addresses where customer_id = my_customer_id();
select favorite_toggle('40000000-0000-0000-0000-000000000001') as fav1, favorite_toggle('40000000-0000-0000-0000-000000000001') as fav2, favorite_toggle('40000000-0000-0000-0000-000000000001') as fav3;
select my_favorite_ids() as favs, customer_me()->'favorites'->0->>'title' as titulo, customer_me()->'profile'->>'name' as nome;

\echo '-- outra conta (nova, sem encomendas): ficha criada, não vê nada da Ana'
set test.uid = '00000000-0000-0000-0000-0000000000b2';
select jsonb_array_length(customer_me()->'orders') as encomendas, jsonb_array_length(customer_me()->'favorites') as favoritos;
do $$ declare n int := (select count(*) from addresses); begin
  if jsonb_array_length(customer_me()->'orders') <> 0 or jsonb_array_length(customer_me()->'addresses') <> 0 then raise notice 'ERRO fuga de dados entre clientes'; end if;
  perform customer_address_delete((select id from addresses limit 1));
  if (select count(*) from addresses) <> n then raise notice 'ERRO apagou morada de outra pessoa'; end if;
end $$;
