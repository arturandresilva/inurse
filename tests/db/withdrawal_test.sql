\set ON_ERROR_STOP 1
\pset pager off
-- livre resolução: encontrar pela encomenda+email, declarar, não repetir, prazo
insert into products (id, handle, title, status) values ('60000000-0000-0000-0000-000000000001','s','Soca','active');
insert into variants (id, product_id, option_value, price_cents) values ('60000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001','38',3000);
update settings set value='{"mbway":true,"multibanco":true,"transfer":true,"iban":"PT50000201231234567890154"}' where key='public.payments';
update settings set value = value || '{"return_days":15}' where key = 'public.store';
select place_order('{"email":"Rita@x.pt","accept_terms":true,"payment_method":"transfer","shipping_address":{"name":"Rita Sousa","line1":"Rua 3","zip":"4590-100","city":"Paços","region":"Continente"},"items":[{"variant_id":"60000000-0000-0000-0000-000000000002","qty":2}]}'::jsonb) is not null;
do $$ declare r jsonb; n int := (select number from orders limit 1); begin
  begin perform withdrawal_lookup(n, 'outra@x.pt'); raise notice 'ERRO email errado aceite'; exception when others then null; end;
  r := withdrawal_lookup(n, ' rita@X.pt ');
  if jsonb_array_length(r->'items') <> 1 or r->>'name' <> 'Rita Sousa' then raise notice 'ERRO lookup %', r; end if;
  -- antes de enviada também pode desistir
  r := withdrawal_submit(n, 'rita@x.pt', '{"name":"Rita Sousa","received_on":"","iban":"pt50 0002 0123 1234 5678 9015 4"}');
  if (select reason from returns) <> 'livre_resolucao' then raise notice 'ERRO motivo'; end if;
  if (select withdrawal->>'iban' from returns) <> 'PT50000201231234567890154' then raise notice 'ERRO iban %', (select withdrawal from returns); end if;
  if jsonb_array_length((select items from returns)) <> 1 or ((select items from returns)->0->>'quantity')::int <> 2 then raise notice 'ERRO sem artigos = encomenda toda'; end if;
  if not exists (select 1 from order_events where kind = 'devolucao') then raise notice 'ERRO evento'; end if;
  begin perform withdrawal_submit(n, 'rita@x.pt', '{"name":"Rita"}'); raise notice 'ERRO pedido repetido'; exception when others then null; end;
  -- fora de prazo
  update returns set status = 'cancelled';
  insert into shipments (order_id, shipped_at) select id, now() - interval '30 days' from orders;
  begin perform withdrawal_lookup(n, 'rita@x.pt'); raise notice 'ERRO fora de prazo aceite'; exception when others then
    if sqlerrm not like '%prazo%' then raise notice 'ERRO mensagem %', sqlerrm; end if; end;
end $$;
