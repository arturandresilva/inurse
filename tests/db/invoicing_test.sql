\set ON_ERROR_STOP 1
\pset pager off
-- faturação: linhas sem IVA, desconto, portes repartidos pelas taxas, cliente com/sem NIF, só encomendas pagas
insert into products (id, handle, title, status, weight_g, vat_rate) values
 ('50000000-0000-0000-0000-000000000001','soca','Soca Teste','active', 800, 23),
 ('50000000-0000-0000-0000-000000000003','meia','Meia Compressão','active', 100, 6);
insert into variants (id, product_id, option_value, price_cents, sku) values
 ('50000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','38',2990,'SOC-38'),
 ('50000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000003','M',1500,null);
update settings set value='{"mbway":true,"multibanco":true,"transfer":true,"iban":"PT50000201231234567890154"}' where key='public.payments';
update settings set value = jsonb_set(value, '{zones}', '[{"region":"Continente","price_cents":450,"free_from_cents":0}]') where key = 'public.shipping';
delete from shipping_rates;
select place_order('{"email":"Ana@Exemplo.pt","accept_terms":true,"payment_method":"mbway","phone":"912345678","shipping_address":{"name":"Ana Costa","line1":"Rua 1","zip":"4000-100","city":"Porto","region":"Continente"},"items":[{"variant_id":"50000000-0000-0000-0000-000000000002","qty":2},{"variant_id":"50000000-0000-0000-0000-000000000004","qty":1}]}'::jsonb) is not null as encomenda;
select number, subtotal_cents, shipping_cents, total_cents from orders;

do $$ declare oid uuid := (select id from orders limit 1); begin
  begin perform invoice_payload(oid); raise notice 'ERRO faturou uma encomenda por pagar';
  exception when others then if sqlerrm not like 'só se fatura%' then raise notice 'ERRO mensagem: %', sqlerrm; end if; end;
end $$;
update orders set status = 'paid', paid_at = now();

select x->>'name' nome, x->>'unit_price' preco_sem_iva, x->>'quantity' qtd, x->'tax'->>'name' iva, x->>'description' descricao
  from jsonb_array_elements(invoice_payload((select id from orders limit 1))->'items') x;

do $$ declare p jsonb := invoice_payload((select id from orders limit 1)); t numeric := 0; x jsonb; begin
  -- total reconstruído como o InvoiceXpress faz (linha arredondada + IVA arredondado) tem de bater com o que o cliente pagou
  for x in select * from jsonb_array_elements(p->'items') loop
    t := t + round((x->>'unit_price')::numeric * (x->>'quantity')::numeric * (1 - (x->>'discount')::numeric / 100), 2)
           + round(round((x->>'unit_price')::numeric * (x->>'quantity')::numeric * (1 - (x->>'discount')::numeric / 100), 2) * substr(x->'tax'->>'name', 4)::numeric / 100, 2);
  end loop;
  if abs(t * 100 - (p->>'expected_total_cents')::int) > 1 then raise notice 'ERRO total % ≠ %', t, p->>'expected_total_cents'; end if;
  if p->'client'->>'code' not like 'CF-%' or p->'client' ? 'fiscal_id' then raise notice 'ERRO consumidor final: %', p->'client'; end if;
  if p->'client'->>'name' <> 'Ana Costa' or p->'client'->>'country' <> 'Portugal' then raise notice 'ERRO cliente: %', p->'client'; end if;
  -- portes 4,50 € repartidos: 59,80 a 23 % e 15,00 a 6 %
  if (select count(*) from jsonb_array_elements(p->'items') j where j->>'name' = 'PORTES') <> 2 then raise notice 'ERRO portes não repartidos'; end if;
  if (select j->'tax'->>'name' from jsonb_array_elements(p->'items') j where j->>'description' like 'Meia%') <> 'IVA6' then raise notice 'ERRO IVA das meias'; end if;
  if p->>'reference' <> 'Encomenda #1001' then raise notice 'ERRO referência'; end if;
end $$;

\echo '-- com NIF e cupão de 10 %'
insert into promotions (name, code, kind, value, active) values ('dez', 'DEZ', 'percent', 10, true);
select place_order('{"email":"clinica@x.pt","nif":"508 000 000","accept_terms":true,"payment_method":"transfer","promo_code":"DEZ","shipping_address":{"name":"Clínica X","line1":"Av 2","zip":"1000-001","city":"Lisboa","region":"Continente"},"items":[{"variant_id":"50000000-0000-0000-0000-000000000002","qty":3}]}'::jsonb) is not null as encomenda2;
update orders set status = 'paid', paid_at = now() where email = 'clinica@x.pt';
do $$ declare p jsonb := invoice_payload((select id from orders where email = 'clinica@x.pt')); t numeric := 0; x jsonb; begin
  for x in select * from jsonb_array_elements(p->'items') loop
    t := t + round((x->>'unit_price')::numeric * (x->>'quantity')::numeric * (1 - (x->>'discount')::numeric / 100), 2)
           + round(round((x->>'unit_price')::numeric * (x->>'quantity')::numeric * (1 - (x->>'discount')::numeric / 100), 2) * substr(x->'tax'->>'name', 4)::numeric / 100, 2);
  end loop;
  if abs(t * 100 - (p->>'expected_total_cents')::int) > 1 then raise notice 'ERRO total com desconto % ≠ %', t, p->>'expected_total_cents'; end if;
  if p->'client'->>'fiscal_id' <> '508000000' or p->'client'->>'code' <> 'NIF508000000' then raise notice 'ERRO NIF: %', p->'client'; end if;
  if (p->'items'->0->>'discount')::numeric <> 10 then raise notice 'ERRO desconto: %', p->'items'->0; end if;
end $$;

\echo '-- agendador: só fatura sozinho depois de ligado, e uma vez'
do $$ begin
  if (select count(*) from orders_to_invoice()) <> 0 then raise notice 'ERRO faturou antes de ligar'; end if;
  update settings set value = value || '{"account":"inurse","auto_invoice":true}' where key = 'invoicing';
  if (select value->>'active_since' from settings where key = 'invoicing') is null then raise notice 'ERRO sem data de ativação'; end if;
  update orders set paid_at = now() + interval '1 second';
  if (select count(*) from orders_to_invoice()) <> 2 then raise notice 'ERRO devia haver 2 por faturar'; end if;
  insert into invoices (order_id, status, number) select id, 'final', 'FR 1/A' from orders where email = 'clinica@x.pt';
  if (select count(*) from orders_to_invoice()) <> 1 then raise notice 'ERRO fatura emitida continua por faturar'; end if;
  begin insert into invoices (order_id, status) select id, 'pending' from orders where email = 'clinica@x.pt'; raise notice 'ERRO duas faturas';
  exception when unique_violation then null; end;
end $$;
select 'ok' as fim;
