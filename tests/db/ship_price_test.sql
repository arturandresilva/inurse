\set ON_ERROR_STOP 1
\pset pager off
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000001','artur.impact@gmail.com');
set test.uid = '00000000-0000-0000-0000-000000000001';
insert into suppliers (id, name, conditions) values ('30000000-0000-0000-0000-000000000001','Nursing Care','{"shipping_tiers":[{"up_to_cents":4999,"cost_cents":500}],"charges_dropship_shipping":false}');
insert into products (id, handle, title, status, vat_rate, supplier_id, weight_g) values
 ('40000000-0000-0000-0000-000000000001','berlim','BERLIM Azul','active',23,'30000000-0000-0000-0000-000000000001', 650),
 ('40000000-0000-0000-0000-000000000003','meia','Meia Descanso','active',6,'30000000-0000-0000-0000-000000000001', 100);
insert into variants (id, product_id, option_value, price_cents, cost_cents, rrp_cents) values
 ('40000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','38',0,3270,6190),
 ('40000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000003','2',0,745,990);
\echo '== regra global margem 40% vs regra PVPR na meia'
insert into pricing_rules (name, scope, method, pct, rounding) values ('Margem 40%','global','margin',40,'0.90');
insert into pricing_rules (name, scope, scope_id, base, rrp_adjust_pct, pct, rounding) values ('Meias a PVPR','product','40000000-0000-0000-0000-000000000003','rrp',0,0,'none');
select product_title, cost_cents, old_cents, new_cents, rule_name from apply_pricing(null, false);
\echo '== PVPR -5% com lucro mínimo'
update pricing_rules set rrp_adjust_pct = -5, min_profit_cents = 100, rounding = '0.90' where name = 'Meias a PVPR';
select product_title, old_cents, new_cents from apply_pricing(null, false);
\echo '== portes por peso'
update settings set value = value || '{"zones":[{"region":"Continente","price_cents":450,"free_from_cents":0},{"region":"Açores","price_cents":900,"free_from_cents":0},{"region":"Madeira","price_cents":900,"free_from_cents":0}]}' where key='public.shipping';
update shipping_rates set cost_cents = 380 where zone='Continente' and max_weight_g=2000;
reset test.uid;
select (q->>'weight_g') w, q->>'shipping_cents' portes from (select quote_cart('{"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":1}],"region":"Continente"}') q) x;
select (q->>'weight_g') w, q->>'shipping_cents' portes from (select quote_cart('{"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":4}],"region":"Continente"}') q) x;
select (q->>'weight_g') w, q->>'shipping_cents' portes from (select quote_cart('{"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":2}],"region":"Açores"}') q) x;
-- volume: caixa grande 35x25x15 = 13125 cm3 -> 2188 g volumétrico
update products set length_cm=35, width_cm=25, height_cm=15 where handle='berlim';
select (q->>'weight_g') w_vol, q->>'shipping_cents' portes from (select quote_cart('{"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":1}],"region":"Continente"}') q) x;
update products set length_cm=null, width_cm=null, height_cm=null where handle='berlim';
select (q->>'problems') prob from (select quote_cart('{"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":20}],"region":"Continente"}') q) x;
\echo '== encomenda pequena (1 meia): custos'
update settings set value='{"mbway":true,"multibanco":true,"transfer":true,"iban":"PT50000201231234567890154"}' where key='public.payments';
begin;
select place_order('{"email":"x@y.pt","phone":"912345678","accept_terms":true,"payment_method":"mbway","shipping_address":{"name":"X","line1":"R","zip":"4590-000","city":"P","region":"Continente","phone":"912345678"},"items":[{"variant_id":"40000000-0000-0000-0000-000000000004","qty":1}]}'::jsonb) - 'token' - 'order_id' r;
commit;
select total_cents, shipping_cents, weight_g, cost_supplier_shipping_cents forn, cost_carrier_cents ctt, cost_payment_fee_cents fee from orders;
update orders set status='paid';
set test.uid = '00000000-0000-0000-0000-000000000001';
select profit_and_loss(current_date - 1, current_date) - 'periodo' - 'despesas_por_categoria_eur' r;
