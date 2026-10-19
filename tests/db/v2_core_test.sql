\set ON_ERROR_STOP 1
\pset pager off
-- admin
insert into auth.users(id, email) values ('00000000-0000-0000-0000-000000000001', 'artur.impact@gmail.com');
set test.uid = '00000000-0000-0000-0000-000000000001';
select import_catalog(:'catalog'::jsonb) is not null as cat0;
select import_customers(:'customers'::jsonb) is not null as cus0;

\echo '== arredondamentos'
select round_price(5703, '0.90') a, round_price(5791, '0.90') b, round_price(5700, '0.99') c, round_price(5701, '1.00') d, round_price(5700, '1.00') e, round_price(5730,'0.50') f;

\echo '== fornecedor + regras de margem'
insert into suppliers (id, name) values ('10000000-0000-0000-0000-000000000001', 'Wock Ibérica');
update products set supplier_id = '10000000-0000-0000-0000-000000000001', supplier_ref = 'EASYLITE-' || upper(split_part(title, ' ', 2)) where title like 'EASYLITE %';
update variants set cost_cents = 2500 where product_id in (select id from products where title like 'EASYLITE %');
insert into pricing_rules (name, scope, method, pct, rounding) values ('Base 80%', 'global', 'markup', 80, '0.90');
insert into pricing_rules (name, scope, scope_id, method, pct, rounding, min_profit_cents)
  values ('Wock margem 45%', 'supplier', '10000000-0000-0000-0000-000000000001', 'margin', 45, '0.90', 1500);
-- 2500/(1-0.45)=4545.45 -> lucro 2045 >= 1500 ; *1.23 = 5590.9 -> ceil 5591 -> .90 => 56,90
select variant_id is not null ok, product_title, option_value, cost_cents, old_cents, new_cents, rule_name from apply_pricing(null, true) limit 3;
select count(*) as alteracoes_simuladas from apply_pricing(null, true);
select count(*) as aplicadas from apply_pricing(null, false);
select distinct price_cents from variants v join products p on p.id = v.product_id where p.title like 'EASYLITE %';
-- preço bloqueado não muda
update variants set price_locked = true, price_cents = 6000 where id = (select v.id from variants v join products p on p.id=v.product_id where p.title='EASYLITE WHITE' and v.option_value='38');
update variants set cost_cents = 3000 where product_id in (select id from products where title like 'EASYLITE %');
select count(*) as reajustes_apos_custo from apply_pricing(null, false);
select v.option_value, v.price_cents, v.price_locked from variants v join products p on p.id=v.product_id where p.title='EASYLITE WHITE' and v.option_value in ('37','38');
select count(*) as historico from price_history;

\echo '== importação de folha de fornecedor'
insert into import_jobs (id, supplier_id, file_name, options) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'tabela_wock_2026.xlsx', '{"new_status":"draft"}');
insert into import_rows (job_id, row_index, raw, model_ref, title, brand, color, size, supplier_sku, ean, cost_cents, category_path) values
 ('20000000-0000-0000-0000-000000000001', 1, '{}', 'EASYLITE-WHITE', 'EASYLITE WHITE', 'Wock', 'Branco', '38', 'EL-W-38', '8400000000038', 2800, null),   -- atualiza (modelo+tamanho)
 ('20000000-0000-0000-0000-000000000001', 2, '{}', 'EASYLITE-WHITE', 'EASYLITE WHITE', 'Wock', 'Branco', '48', 'EL-W-48', '8400000000048', 2800, null),   -- tamanho novo em produto existente
 ('20000000-0000-0000-0000-000000000001', 3, '{}', 'NUBE-02', 'Nube 02 Azul', 'Wock', 'Azul', '37', 'NB-02-37', '8400000000237', 3100, 'CALÇADO>SOCAS'),
 ('20000000-0000-0000-0000-000000000001', 4, '{}', 'NUBE-02', 'Nube 02 Azul', 'Wock', 'Azul', '38', 'NB-02-38', '8400000000238', 3100, 'CALÇADO>SOCAS'),
 ('20000000-0000-0000-0000-000000000001', 5, '{}', 'X-1', null, null, null, '40', 'X1-40', null, null, null);                                       -- ignorada
select match_import_job('20000000-0000-0000-0000-000000000001');
select row_index, action, issues, match_variant_id is not null mv, match_product_id is not null mp from import_rows order by row_index;
select apply_import_job('20000000-0000-0000-0000-000000000001');
select p.title, p.status, p.handle, v.option_value, v.cost_cents, v.price_cents, v.supplier_sku from products p join variants v on v.product_id=p.id
 where p.supplier_ref in ('NUBE-02') or (p.title='EASYLITE WHITE' and v.option_value in ('38','48')) order by 1,4;
select (select count(*) from product_categories pc join products p on p.id=pc.product_id where p.supplier_ref='NUBE-02') as cats_nube;

\echo '== pesquisa'
select title from products where search @@ websearch_to_tsquery('portuguese', immutable_unaccent('meias compressao')) limit 3;
select title from products where search @@ websearch_to_tsquery('portuguese', immutable_unaccent('socas')) limit 3;

\echo '== checkout (como visitante)'
update settings set value = '{"zones":[{"region":"Continente","price_cents":450,"free_from_cents":6000},{"region":"Açores","price_cents":900,"free_from_cents":0},{"region":"Madeira","price_cents":900,"free_from_cents":0}]}' where key='public.shipping';
update settings set value = '{"mbway":true,"multibanco":true,"transfer":true,"iban":"PT50000201231234567890154"}' where key='public.payments';
insert into promotions (name, code, kind, value, min_order_cents) values ('Boas-vindas', 'BEMVINDA10', 'percent', 10, 0);
reset test.uid;
-- variante com stock controlado (2 unidades)
update variants set stock = 2 where id = (select v.id from variants v join products p on p.id=v.product_id where p.title='EASYLITE GREEN' and v.option_value='40');
select v.id as vgreen from variants v join products p on p.id=v.product_id where p.title='EASYLITE GREEN' and v.option_value='40' \gset
select v.id as vblack from variants v join products p on p.id=v.product_id where p.title='EASYLITE BLACK' and v.option_value='41' \gset
select save_cart(null, jsonb_build_array(jsonb_build_object('variant_id', :'vgreen', 'qty', 1)), 'cliente@teste.pt') as cart \gset
select quote_cart(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('variant_id', :'vgreen','qty',1), jsonb_build_object('variant_id', :'vblack','qty',1)), 'promo_code','bemvinda10','region','Continente')) - 'lines' as quote;
select place_order(jsonb_build_object(
  'email','Cliente@Teste.pt','phone','912345678','accept_terms',true,'newsletter',true,'payment_method','mbway','promo_code','BEMVINDA10','cart_token', :'cart',
  'shipping_address', jsonb_build_object('name','Ana Teste','line1','Rua A 1','zip','4590-000','city','Paços de Ferreira','region','Continente','phone','912345678'),
  'items', jsonb_build_array(jsonb_build_object('variant_id', :'vgreen','qty',2), jsonb_build_object('variant_id', :'vblack','qty',1)))) as encomenda \gset
select :'encomenda'::jsonb - 'token' - 'order_id' as encomenda;
select stock from variants where id = :'vgreen';
select status from products where title = 'EASYLITE GREEN';
\echo '-- vender a mais tem de falhar:'
do $$ begin
  perform place_order(jsonb_build_object('email','b@b.pt','accept_terms',true,'payment_method','transfer',
    'shipping_address', jsonb_build_object('name','B','line1','R','zip','1000-001','city','Lisboa','region','Continente'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', (select v.id from variants v join products p on p.id=v.product_id where p.title='EASYLITE GREEN' and v.option_value='40'),'qty',1))));
  raise notice 'ERRO: deixou vender sem stock';
exception when others then raise notice 'ok, recusou: %', sqlerrm; end $$;
\echo '-- código postal inválido tem de falhar:'
do $$ begin
  perform place_order(jsonb_build_object('email','c@c.pt','accept_terms',true,'payment_method','transfer',
    'shipping_address', jsonb_build_object('name','C','line1','R','zip','1000','city','Lisboa','region','Continente'),
    'items', '[]'::jsonb || jsonb_build_object('variant_id', (select v.id from variants v join products p on p.id=v.product_id where p.title='EASYLITE BLACK' and v.option_value='41'),'qty',1)));
  raise notice 'ERRO: aceitou CP inválido';
exception when others then raise notice 'ok, recusou: %', sqlerrm; end $$;
select (get_order_public((:'encomenda'::jsonb->>'number')::int, (:'encomenda'::jsonb->>'token')::uuid)) - 'items' - 'shipping_address' as publico;
select get_order_public((:'encomenda'::jsonb->>'number')::int, gen_random_uuid()) as token_errado;
select status, email from carts;
select uses from promotions where code='BEMVINDA10';
select email, newsletter, newsletter_consent_at is not null consent from customers where email='cliente@teste.pt';
\echo '-- visitante não pode aplicar preços:'
do $$ begin perform apply_pricing(null, true); raise notice 'ERRO'; exception when others then raise notice 'ok: %', sqlerrm; end $$;
