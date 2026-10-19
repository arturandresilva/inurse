\set ON_ERROR_STOP 1
\pset pager off
-- operações do backoffice: estados, stock reposto ao cancelar, envios, notas, custos
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000001','artur.impact@gmail.com');
insert into suppliers (id, name) values ('30000000-0000-0000-0000-000000000001','Nursing Care');
insert into pickup_addresses (id, label, supplier_id, contact_name, line1, zip, city, is_default_pickup) values
 ('50000000-0000-0000-0000-000000000001','Armazém Nursing Care','30000000-0000-0000-0000-000000000001','Armazém','Rua X 1','4000-001','Porto', true);
insert into products (id, handle, title, status, vat_rate) values ('40000000-0000-0000-0000-000000000001','b','B','active',23);
insert into variants (id, product_id, option_value, price_cents, stock) values
 ('40000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','38',5000, 3),
 ('40000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','39',5000, null);
update settings set value='{"mbway":true,"multibanco":true,"transfer":true,"iban":"PT50000201231234567890154"}' where key='public.payments';
select place_order('{"email":"x@y.pt","accept_terms":true,"payment_method":"transfer","shipping_address":{"name":"X","line1":"R","zip":"4590-000","city":"P","region":"Continente"},"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":2},{"variant_id":"40000000-0000-0000-0000-000000000003","qty":1}]}'::jsonb) is not null as criada;
select place_order('{"email":"z@y.pt","accept_terms":true,"payment_method":"transfer","shipping_address":{"name":"Z","line1":"R","zip":"4590-000","city":"P","region":"Continente"},"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":1}]}'::jsonb) is not null as criada2;
do $$ begin
  if (select stock from variants where id='40000000-0000-0000-0000-000000000002') <> 0 then raise notice 'ERRO stock depois das vendas'; end if;
  if (select status from products where id='40000000-0000-0000-0000-000000000001') <> 'active' then raise notice 'ERRO produto deve continuar ativo (tamanho 39 sem stock controlado)'; end if;
end $$;

\echo '-- sem sessão de administrador falha:'
do $$ begin perform set_order_status((select id from orders where number=1001), 'paid'); raise notice 'ERRO'; exception when others then raise notice 'ok: %', sqlerrm; end $$;
set test.uid = '00000000-0000-0000-0000-000000000001';

\echo '-- envio antes de paga falha:'
do $$ begin perform add_shipment((select id from orders where number=1001), '{}'); raise notice 'ERRO'; exception when others then raise notice 'ok: %', sqlerrm; end $$;
\echo '-- reembolsar sem pagamento falha:'
do $$ begin perform set_order_status((select id from orders where number=1001), 'refunded'); raise notice 'ERRO'; exception when others then raise notice 'ok: %', sqlerrm; end $$;

select set_order_status((select id from orders where number=1001), 'paid', 'transferência recebida');
select paid_at is not null as tem_data_pagamento, status from orders where number=1001;
select add_shipment((select id from orders where number=1001), '{"tracking_code":" EA123456789PT ","pickup_address_id":"50000000-0000-0000-0000-000000000001"}') is not null as envio;
select o.status, s.tracking_code, s.pickup_address->>'label' recolha, s.supplier_id is not null tem_fornecedor from orders o join shipments s on s.order_id=o.id where o.number=1001;
select add_order_note((select id from orders where number=1001), 'Cliente pediu entrega à tarde');
select set_order_costs((select id from orders where number=1001), '{"carrier":"390","supplier_shipping":"0"}');
select cost_carrier_cents, costs_confirmed from orders where number=1001;
select kind, message from order_events where order_id=(select id from orders where number=1001) order by created_at, kind;

\echo '-- cancelar a segunda repõe 1 unidade:'
select set_order_status((select id from orders where number=1002), 'cancelled', 'cliente desistiu');
select stock from variants where id='40000000-0000-0000-0000-000000000002';
do $$ begin
  if (select stock from variants where id='40000000-0000-0000-0000-000000000002') <> 1 then raise notice 'ERRO stock não foi reposto'; end if;
  perform set_order_status((select id from orders where number=1002), 'paid');
  raise notice 'ERRO cancelada mudou de estado';
exception when others then raise notice 'ok: %', sqlerrm; end $$;

\echo '-- reembolso da primeira repõe as 2 unidades controladas (o 39 não é controlado):'
select set_order_status((select id from orders where number=1001), 'refunded');
select option_value, stock from variants where product_id='40000000-0000-0000-0000-000000000001' order by 1;
do $$ begin if (select stock from variants where id='40000000-0000-0000-0000-000000000002') <> 3 then raise notice 'ERRO reembolso não repôs stock'; end if; end $$;

select email, total_orders, total_spent_cents from customer_overview order by email;
