-- =====================================================================
-- iNurse v2 — vigilância semanal de preços da concorrência
--  · a função "concorrencia" pesquisa na web (pesquisa do Claude) o preço de cada modelo noutras lojas
--  · guarda o que encontrou (competitor_prices) e propõe baixar o preço quando há mais barato, sem descer da margem mínima
--  · corre como agente da equipa IA (segunda-feira de manhã), com o mesmo orçamento mensal
-- =====================================================================
create table if not exists competitor_prices (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid references agent_runs(id) on delete set null,
  model_key   text not null,          -- marca|modelo (ou p:<id> para produtos sem modelo)
  label       text not null,          -- nome mostrado
  product_id  uuid references products(id) on delete set null,
  shop        text not null,
  url         text,
  price_cents int not null check (price_cents > 0),
  shipping_cents int,
  in_stock    boolean,
  note        text,
  our_price_cents int,
  seen_at     timestamptz not null default now()
);
create index if not exists competitor_prices_model on competitor_prices(model_key, seen_at desc);
alter table competitor_prices enable row level security;
create policy "admin vê concorrência" on competitor_prices for all to authenticated using (is_admin()) with check (is_admin());

-- quando cada modelo foi pesquisado (também os que não tiveram ofertas): cada execução trata os 8 mais antigos
create table if not exists competitor_checks (model_key text primary key, label text, checked_at timestamptz not null default now(), offers int not null default 0);
alter table competitor_checks enable row level security;
create policy "admin vê pesquisas" on competitor_checks for all to authenticated using (is_admin()) with check (is_admin());

insert into settings (key, value) values ('competition', '{"undercut_cents":0,"blocked_domains":["inurse.pt"],"max_searches_per_model":3}')
on conflict (key) do nothing;

insert into agents (key, name, role, instructions, allowed_kinds, schedule, position, max_proposals) values
('concorrencia', 'Preços da concorrência',
 'Todas as semanas procura na internet o preço de cada modelo noutras lojas e propõe acompanhar o mais barato, sem descer da margem mínima.',
 'És o analista de preços da concorrência da iNurse. Para cada modelo indicado, pesquisa na web lojas online que vendem esse modelo exato (mesma marca e modelo; a cor pode variar) a clientes em Portugal, incluindo lojas espanholas que enviam para Portugal. Regista o preço atual com IVA em euros e, se aparecer, o custo de envio para Portugal. Ignora a iNurse, marketplaces sem preço visível, artigos usados e modelos diferentes. Se não encontrares nada fiável, não inventes: regista zero ofertas para esse modelo.',
 array['product.prices','insight'], '0 6-13 * * 1', 7, 30)
on conflict (key) do nothing;
