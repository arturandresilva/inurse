-- Dados de teste: administrador, catálogo, clientes, fornecedor, encomendas, proposta, despesas
insert into auth.users(id, email, encrypted_password) values ('00000000-0000-0000-0000-000000000001', 'artur.impact@gmail.com', md5('teste12345'));
insert into auth.users(id, email, encrypted_password) values ('00000000-0000-0000-0000-000000000002', 'outro@exemplo.pt', md5('teste12345'));
set test.uid = '00000000-0000-0000-0000-000000000001';
select import_catalog(:'catalog'::jsonb);
select import_customers(:'customers'::jsonb);
insert into suppliers (id, name, email, lead_time_days) values ('30000000-0000-0000-0000-000000000001', 'Nursing Care', 'encomendas@exemplo.pt', 3);
update products set supplier_id = '30000000-0000-0000-0000-000000000001', supplier_ref = upper(split_part(title, ' ', 1)) where title ilike '%meia%' or title ilike 'easylite%';
update variants set cost_cents = round(price_cents / 1.23 * 0.55) where product_id in (select id from products where supplier_id is not null);
insert into pricing_rules (name, scope, method, pct, rounding) values ('Margem base 45%', 'global', 'margin', 45, '0.90');
insert into pickup_addresses (label, supplier_id, contact_name, line1, zip, city, is_default_pickup) values
  ('Armazém Nursing Care', '30000000-0000-0000-0000-000000000001', 'Armazém', 'Rua Exemplo 1', '4000-001', 'Porto', true),
  ('Casa (iNurse)', null, 'Artur Silva', 'Rua Exemplo 2', '4590-001', 'Paços de Ferreira', true);
select set_return_address((select id from pickup_addresses where label = 'Casa (iNurse)'));
update settings set value = value || '{"iban":"PT50000201231234567890154"}' where key = 'public.payments';
insert into shipping_rates (zone, max_weight_g, price_cents, cost_cents) values
  ('Continente', 1000, 450, 330), ('Continente', 2000, 490, 360), ('Continente', 5000, 590, 420),
  ('Açores', 2000, 990, 750), ('Madeira', 2000, 990, 750) on conflict do nothing;
reset test.uid;
-- encomendas (como cliente anónimo)
select place_order(jsonb_build_object('email','ana@exemplo.pt','accept_terms',true,'payment_method','transfer',
  'shipping_address', jsonb_build_object('name','Ana Costa','line1','Rua A 1','zip','4000-100','city','Porto','region','Continente','phone','912345678'),
  'items', jsonb_build_array(jsonb_build_object('variant_id',(select v.id from variants v join products p on p.id=v.product_id where p.status='active' order by p.title, v.position limit 1),'qty',1))));
select place_order(jsonb_build_object('email','rui@exemplo.pt','accept_terms',true,'payment_method','transfer','nif','123456789',
  'shipping_address', jsonb_build_object('name','Rui Lopes','line1','Rua B 2','zip','1000-200','city','Lisboa','region','Continente'),
  'items', jsonb_build_array(jsonb_build_object('variant_id',(select v.id from variants v join products p on p.id=v.product_id where p.status='active' order by p.title desc, v.position limit 1),'qty',2))));
select place_order(jsonb_build_object('email','eva@exemplo.pt','accept_terms',true,'payment_method','transfer',
  'shipping_address', jsonb_build_object('name','Eva Mota','line1','Rua C 3','zip','3000-300','city','Coimbra','region','Continente'),
  'items', jsonb_build_array(jsonb_build_object('variant_id',(select v.id from variants v join products p on p.id=v.product_id where p.supplier_id is not null order by p.title, v.position limit 1),'qty',1))));
set test.uid = '00000000-0000-0000-0000-000000000001';
select set_order_status((select id from orders where number = 1001), 'paid', 'transferência recebida');
select set_order_status((select id from orders where number = 1002), 'paid', null);
select add_shipment((select id from orders where number = 1002), '{"tracking_code":"EA123456789PT"}');
insert into proposals (agent_key, kind, title, summary, rationale, expected_impact, priority, payload) values
  ('marketing', 'promotion.create', 'Campanha Dia do Enfermeiro: 10% em socas', 'Código ENFERMEIRO10 com 10% em todo o calçado durante 5 dias.',
   'As socas são 70% das vendas; o Dia Internacional do Enfermeiro é a data com mais procura.', '+8 a 12 encomendas', 'alta',
   '{"name":"Dia do Enfermeiro","code":"ENFERMEIRO10","kind":"percent","value":10}'),
  ('contabilista', 'insight', 'Margem das meias abaixo do objetivo', 'As meias de compressão estão com margem média de 31%.', 'Custo subiu 6% na tabela 2026.', null, 'media', '{}');
insert into reports (agent_key, title, body_md) values ('contabilista', 'Resumo do mês', E'## Resultado\n\nA loja está **positiva** este mês.\n\n- Vendas: 3 encomendas\n- Custos fixos cobertos');
insert into expenses (category, description, amount_cents, recurrence, vendor) values
  ('plataforma', 'Alojamento e base de dados', 0, 'monthly', 'Supabase/Vercel'), ('dominio', 'Domínio inurse.pt', 1500, 'yearly', 'PTisp'),
  ('faturacao', 'InvoiceXpress', 990, 'monthly', 'InvoiceXpress');
-- fatura emitida na 1002 (para ver o cartão "Fatura")
insert into invoices (order_id, status, number, total_cents, pdf_url, permalink, sent_to, external_id)
select id, 'final', 'FR 2026/12', total_cents, 'https://exemplo.pt/fatura.pdf', 'https://exemplo.app.invoicexpress.com/p/1', email, '77' from orders where number = 1002;
