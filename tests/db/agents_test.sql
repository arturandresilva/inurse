\set ON_ERROR_STOP 1
\pset pager off
set test.uid = '00000000-0000-0000-0000-000000000001';
select key, name, schedule from agents order by position;
select length(agent_context()::text) as contexto_bytes, agent_context()->'catalogo' as catalogo, agent_context()->'clientes' as clientes;
select id as pid from products where title='EASYLITE BLACK' \gset
select v.id as vid from variants v join products p on p.id=v.product_id where p.title='EASYLITE BLACK' and v.option_value='41' \gset
insert into proposals (agent_key, kind, title, summary, payload) values
 ('marketing','promotion.create','Dia do Enfermeiro','10% em socas', '{"name":"Dia do Enfermeiro","code":"enf12","kind":"percent","value":10}'),
 ('marketing','promotion.create','Desconto exagerado','40%', '{"name":"Mega","code":"MEGA40","kind":"percent","value":40}'),
 ('seo','product.content','SEO Easylite Black','novo título SEO', jsonb_build_object('product_id', :'pid', 'seo_title','Socas Easylite Preto | iNurse','seo_description','Socas leves e antiderrapantes.')),
 ('precos','product.prices','Preço abaixo da margem','teste', jsonb_build_object('changes', jsonb_build_array(jsonb_build_object('variant_id', :'vid', 'price_cents', 3000)))),
 ('precos','product.prices','Preço ok','teste', jsonb_build_object('changes', jsonb_build_array(jsonb_build_object('variant_id', :'vid', 'price_cents', 7490, 'compare_at_cents', 7990)))),
 ('precos','pricing_rule.upsert','Regra meias','margem 50% meias', '{"name":"Meias 50%","scope":"global","method":"margin","pct":50,"rounding":"0.99"}'),
 ('retencao','campaign.create','Reativar inativos','email', '{"channel":"email","title":"Voltámos a pensar em ti","content":{"subject":"As tuas socas já pedem reforma?"},"segment":{"type":"inactive_180d"}}'),
 ('seo','page.upsert','Guia socas','página', '{"slug":"guia-socas-enfermagem","title":"Como escolher socas para enfermagem","body_html":"<p>...</p>"}'),
 ('analista','insight','Alerta','sem vendas', '{}');
select title, (decide_proposal(id, true, 'teste'))->>'status' as resultado, (select result from proposals p2 where p2.id = proposals.id) as detalhe
  from proposals order by created_at, title;
select title, status from proposals order by title;
select code, value from promotions where code='ENF12';
select seo_title from products where id = :'pid';
select price_cents, compare_at_cents, price_locked from variants where id = :'vid';
select channel, title, status from campaigns;
select slug from pages;
-- decidir duas vezes falha
do $$ begin perform decide_proposal((select id from proposals where title='Alerta'), true); raise notice 'ERRO'; exception when others then raise notice 'ok: %', sqlerrm; end $$;
reset test.uid;
do $$ begin perform decide_proposal((select id from proposals limit 1), true); raise notice 'ERRO'; exception when others then raise notice 'ok anon: %', sqlerrm; end $$;
