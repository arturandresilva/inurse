\set ON_ERROR_STOP 1
\pset pager off
set test.uid = '00000000-0000-0000-0000-000000000001';
insert into suppliers (id, name, conditions) values ('30000000-0000-0000-0000-000000000001', 'Nursing Care',
 '{"shipping_tiers":[{"up_to_cents":4999,"cost_cents":500},{"up_to_cents":7499,"cost_cents":300}],"shipping_vat":23,"payment_discount_pct":5}');
select supplier_shipping_cents('30000000-0000-0000-0000-000000000001', 3270) a, supplier_shipping_cents('30000000-0000-0000-0000-000000000001', 6540) b, supplier_shipping_cents('30000000-0000-0000-0000-000000000001', 9810) c;
-- produto Nursing Care: Berlim custo 32,70, PVP 61,90
insert into products (id, handle, title, status, vat_rate, supplier_id, supplier_ref) values ('40000000-0000-0000-0000-000000000001','berlim-azul','BERLIM Azul Escuro','active',23,'30000000-0000-0000-0000-000000000001','WG4A.03');
insert into variants (id, product_id, option_value, price_cents, cost_cents) values ('40000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','38',6190,3270);
update settings set value='{"zones":[{"region":"Continente","price_cents":450,"free_from_cents":6000}]}' where key='public.shipping';
update settings set value='{"mbway":true,"multibanco":true,"transfer":true,"iban":"PT50000201231234567890154"}' where key='public.payments';
reset test.uid;
begin;
select place_order('{"email":"x@y.pt","phone":"912345678","accept_terms":true,"payment_method":"mbway","shipping_address":{"name":"X","line1":"R","zip":"4590-000","city":"P","region":"Continente","phone":"912345678"},"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":1}]}'::jsonb)->>'number' as n1;
commit;
begin;
select place_order('{"email":"z@y.pt","phone":"912345678","accept_terms":true,"payment_method":"transfer","shipping_address":{"name":"Z","line1":"R","zip":"4590-000","city":"P","region":"Continente"},"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":3}]}'::jsonb)->>'number' as n2;
commit;
select number, total_cents, cost_supplier_shipping_cents, cost_payment_fee_cents from orders order by number;
select title, unit_cost_cents, supplier_id is not null as fornecedor from order_items;
update orders set status = 'paid';
set test.uid = '00000000-0000-0000-0000-000000000001';
insert into expenses (category, description, amount_cents, recurrence, starts_on) values ('publicidade','Anúncios Instagram', 3000, 'once', current_date);
select jsonb_pretty(profit_and_loss(date_trunc('month', now())::date, current_date));
select jsonb_array_length(profit_by_month(6)) as meses;
reset test.uid;
do $$ begin perform profit_and_loss(current_date, current_date); raise notice 'ERRO'; exception when others then raise notice 'ok anon: %', sqlerrm; end $$;
