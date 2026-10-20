\set ON_ERROR_STOP 1
\pset pager off
-- encomendas novas por ver no backoffice + aviso à loja; levantamento num ponto CTT (tabela simples)
insert into products (id, handle, title, status, weight_g) values ('40000000-0000-0000-0000-000000000001','b','Soca B','active', 800);
insert into variants (id, product_id, option_value, price_cents) values ('40000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','38',3000);
update settings set value='{"mbway":true,"multibanco":true,"transfer":true,"iban":"PT50000201231234567890154"}' where key='public.payments';
update settings set value = value || '{"simple":{"enabled":true,"zones":{"Continente":{"weight_up_cents":490,"weight_limit_g":5000,"weight_over_cents":790,"eta":"1-2 dias úteis"}},"pickup":{"enabled":true,"discount_cents":100,"label":"Ponto CTT"}}}' where key = 'public.shipping';
insert into pickup_points (code, name, kind, address, zip, city) values ('P1','Loja CTT Paços de Ferreira','loja','Rua A','4590-509','Paços de Ferreira'),('P2','Papelaria X','ponto','Rua B','4590-100','Paços'),('P3','Loja CTT Lisboa','loja','Rua C','1000-001','Lisboa');
do $$ declare q jsonb; n int; e text; begin
  q := quote_cart('{"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":1}],"region":"Continente"}');
  if jsonb_array_length(q->'shipping_options') <> 2 then raise notice 'ERRO opções: %', q->'shipping_options'; end if;
  if q->>'shipping_option' <> 'CTT Expresso|simples' then raise notice 'ERRO por defeito devia ser a morada: %', q->>'shipping_option'; end if;
  q := quote_cart('{"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":1}],"region":"Continente","shipping_option":"CTT Expresso|ponto"}');
  if (q->>'shipping_cents')::int <> 390 then raise notice 'ERRO preço do ponto: %', q->>'shipping_cents'; end if;
  select count(*) into n from pickup_points_near('4590-500');
  if n <> 2 then raise notice 'ERRO pontos perto: %', n; end if;
  if (select code from pickup_points_near('4590-500') limit 1) <> 'P1' then raise notice 'ERRO ordem dos pontos'; end if;
  begin
    perform place_order_l('{"email":"x@y.pt","accept_terms":true,"payment_method":"transfer","shipping_option":"CTT Expresso|ponto","shipping_address":{"name":"X","line1":"R","zip":"4590-000","city":"P","region":"Continente"},"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":1}]}');
    raise notice 'ERRO aceitou ponto sem escolher';
  exception when others then if sqlerrm not like '%ponto CTT%' then raise notice 'ERRO: %', sqlerrm; end if; end;
end $$;
select place_order_l('{"email":"x@y.pt","accept_terms":true,"payment_method":"transfer","shipping_option":"CTT Expresso|ponto","pickup_point":{"code":"P1","name":"Loja CTT Paços de Ferreira","zip":"4590-509","city":"Paços de Ferreira"},"shipping_address":{"name":"X","line1":"R","zip":"4590-000","city":"P","region":"Continente"},"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":1}]}'::jsonb) is not null as feita;
do $$ declare o orders; begin
  select * into o from orders limit 1;
  if o.shipping_method->'point'->>'code' <> 'P1' or o.shipping_method->>'delivery' <> 'ponto' then raise notice 'ERRO ponto não guardado: %', o.shipping_method; end if;
  if o.shipping_cents <> 390 then raise notice 'ERRO portes %', o.shipping_cents; end if;
  if o.admin_seen_at is not null then raise notice 'ERRO encomenda nova devia estar por ver'; end if;
  if not exists (select 1 from email_outbox where order_id = o.id and kind = 'loja_nova_encomenda') then raise notice 'ERRO sem aviso à loja'; end if;
end $$;
