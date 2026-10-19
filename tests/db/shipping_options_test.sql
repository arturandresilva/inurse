\set ON_ERROR_STOP 1
\pset pager off
-- várias transportadoras: opções no carrinho, escolha do cliente, portes grátis e custo da escolhida
insert into products (id, handle, title, status, weight_g) values ('40000000-0000-0000-0000-000000000001','b','Soca B','active', 800);
insert into variants (id, product_id, option_value, price_cents) values ('40000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','38',3000);
update settings set value='{"mbway":true,"multibanco":true,"transfer":true,"iban":"PT50000201231234567890154"}' where key='public.payments';
delete from shipping_rates;
insert into shipping_rates (zone, carrier, service, label, delivery, eta, max_weight_g, price_cents, cost_cents) values
 ('Continente','CTT Expresso','48h','CTT — entrega em casa','domicilio','2 dias úteis', 2000, 450, 330),
 ('Continente','CTT Expresso','24h','CTT — amanhã','domicilio','1 dia útil', 2000, 650, 480),
 ('Continente','DPD','Pickup','DPD — ponto Pickup','ponto','2–3 dias úteis', 2000, 390, 290),
 ('Continente','DPD','Pickup','DPD — ponto Pickup','ponto','2–3 dias úteis', 1000, 350, 260);
select jsonb_path_query_array(quote_cart('{"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":1}],"region":"Continente"}')->'shipping_options', '$[*].key') as opcoes;
do $$ declare q jsonb := quote_cart('{"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":1}],"region":"Continente"}'); begin
  -- 800 g + 100 g embalagem = 900 g: DPD usa o escalão de 1 kg (3,50 €) e é a mais barata, logo a escolhida por defeito
  if q->>'shipping_option' <> 'DPD|Pickup' or (q->>'shipping_cents')::int <> 350 then raise notice 'ERRO opção por defeito %', q->>'shipping_option'; end if;
  q := quote_cart('{"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":1}],"region":"Continente","shipping_option":"CTT Expresso|24h"}');
  if (q->>'shipping_cents')::int <> 650 then raise notice 'ERRO escolha do cliente ignorada'; end if;
  q := quote_cart('{"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":1}],"region":"Continente","shipping_option":"inventada"}');
  if q->>'shipping_option' <> 'DPD|Pickup' then raise notice 'ERRO opção inválida devia voltar à mais barata'; end if;
end $$;
\echo '-- portes grátis a partir de 50 €: a mais barata fica a 0 e as outras pagam a diferença'
update settings set value = jsonb_set(value, '{zones}', '[{"region":"Continente","price_cents":0,"free_from_cents":5000}]') where key = 'public.shipping';
select x->>'key' k, x->>'price_cents' preco, x->>'was_cents' antes from jsonb_array_elements(quote_cart('{"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":2}],"region":"Continente"}')->'shipping_options') x;
do $$ declare q jsonb := quote_cart('{"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":2}],"region":"Continente","shipping_option":"CTT Expresso|48h"}'); begin
  if (q->>'shipping_cents')::int <> 450 - 390 then raise notice 'ERRO diferença com portes grátis: %', q->>'shipping_cents'; end if;
end $$;
\echo '-- encomenda guarda a transportadora escolhida e o custo usa essa tarifa'
select place_order('{"email":"x@y.pt","accept_terms":true,"payment_method":"transfer","shipping_option":"CTT Expresso|24h","shipping_address":{"name":"X","line1":"R","zip":"4590-000","city":"P","region":"Continente"},"items":[{"variant_id":"40000000-0000-0000-0000-000000000002","qty":1}]}'::jsonb) is not null;
select shipping_cents, shipping_method->>'label' as metodo, cost_carrier_cents, weight_g from orders;
do $$ begin
  if (select cost_carrier_cents from orders) <> 480 then raise notice 'ERRO custo devia ser o da CTT 24h'; end if;
  if (select shipping_method->>'carrier' from orders) <> 'CTT Expresso' then raise notice 'ERRO transportadora não guardada'; end if;
end $$;
