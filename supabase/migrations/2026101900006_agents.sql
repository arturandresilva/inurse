-- =====================================================================
-- iNurse v2 — equipa de agentes de marketing e vendas
-- Os agentes NUNCA alteram a loja diretamente: criam propostas tipadas.
-- Só apply_proposal (chamada quando o administrador aprova) executa.
-- =====================================================================

create table agents (
  key           text primary key,
  name          text not null,
  role          text not null,                 -- resumo para o backoffice
  instructions  text not null,                 -- instruções de trabalho (prompt de sistema)
  allowed_kinds text[] not null,               -- tipos de proposta que este agente pode criar
  schedule      text not null,                 -- cron (hora de Lisboa)
  enabled       boolean not null default true,
  model         text not null default 'claude-sonnet-5-5',
  max_proposals int not null default 5,
  last_run_at   timestamptz,
  position      int not null default 0
);

create table agent_runs (
  id           uuid primary key default gen_random_uuid(),
  agent_key    text not null references agents(key) on delete cascade,
  trigger      text not null default 'agendado' check (trigger in ('agendado','manual')),
  status       text not null default 'running' check (status in ('running','done','failed','skipped')),
  summary      text,
  tokens_in    int,
  tokens_out   int,
  cost_usd     numeric(10,4),
  error        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index on agent_runs(agent_key, started_at desc);

create table proposals (
  id           uuid primary key default gen_random_uuid(),
  agent_key    text not null references agents(key) on delete cascade,
  run_id       uuid references agent_runs(id) on delete set null,
  kind         text not null check (kind in ('promotion.create','product.content','product.prices','product.featured',
                                              'pricing_rule.upsert','campaign.create','page.upsert','insight')),
  title        text not null,
  summary      text not null,                  -- o que muda, em linguagem simples
  rationale    text,                           -- porquê (dados que suportam)
  expected_impact text,
  priority     text not null default 'media' check (priority in ('alta','media','baixa')),
  payload      jsonb not null default '{}',
  status       text not null default 'pending' check (status in ('pending','approved','rejected','applied','failed','expired')),
  decision_note text,
  decided_by   uuid,
  decided_at   timestamptz,
  applied_at   timestamptz,
  result       jsonb,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '14 days'
);
create index on proposals(status, created_at desc);

create table campaigns (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid references proposals(id) on delete set null,
  channel      text not null check (channel in ('email','instagram','facebook','google_ads','blog','sms')),
  title        text not null,
  content      jsonb not null default '{}',     -- {subject, preheader, body_html} / {caption, hashtags, image_brief} / ...
  segment      jsonb not null default '{}',     -- {type:'newsletter'|'inactive_180d'|'abandoned_carts'|'all_buyers', ...}
  status       text not null default 'draft' check (status in ('draft','scheduled','sent','cancelled')),
  scheduled_at timestamptz,
  sent_at      timestamptz,
  stats        jsonb not null default '{}',
  created_at   timestamptz not null default now()
);

create table reports (
  id          uuid primary key default gen_random_uuid(),
  agent_key   text references agents(key) on delete set null,
  run_id      uuid references agent_runs(id) on delete set null,
  title       text not null,
  body_md     text not null,
  metrics     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

alter table agents     enable row level security;
alter table agent_runs enable row level security;
alter table proposals  enable row level security;
alter table campaigns  enable row level security;
alter table reports    enable row level security;
do $$
declare t text;
begin
  foreach t in array array['agents','agent_runs','proposals','campaigns','reports'] loop
    execute format('create policy "admin gere tudo" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

insert into settings (key, value) values
 ('agents', '{"monthly_budget_usd": 15, "brand_voice": "Próxima, profissional e empática com profissionais de saúde. Português de Portugal. Sem exageros nem promessas médicas.", "max_discount_pct": 20, "min_margin_pct": 25}')
on conflict (key) do nothing;

-- ---------- Equipa ----------
insert into agents (key, name, role, instructions, allowed_kinds, schedule, position) values
('diretor', 'Diretor Comercial',
 'Coordena a equipa, define as prioridades da semana e resume o que importa.',
 'És o diretor comercial da iNurse, loja online portuguesa de calçado profissional (socas hospitalares, sapatos de trabalho) e meias de descanso e compressão, para enfermeiros, médicos, auxiliares, cozinhas e hotelaria. Envio direto do fornecedor. Analisa os dados da loja e as propostas pendentes dos outros agentes. Escreve um relatório semanal curto (o que correu bem, o que preocupa, 3 prioridades) e, quando faz sentido, propõe no máximo 2 ações de maior impacto. Não repitas propostas já pendentes.',
 array['insight','promotion.create','campaign.create'], '0 8 * * 1', 1),
('marketing', 'Marketing',
 'Campanhas de email, redes sociais e datas comerciais (Dia do Enfermeiro, regresso às aulas de saúde, Black Friday, Natal).',
 'És o responsável de marketing da iNurse. Propõe campanhas concretas e prontas a usar: emails para a newsletter (assunto, pré-cabeçalho, corpo em HTML simples), publicações para Instagram/Facebook (texto, hashtags, descrição da imagem a criar) e ideias de anúncios. Usa o calendário: 12 de maio Dia Internacional do Enfermeiro, setembro início de estágios e cursos de enfermagem, Black Friday, Natal. Cada campanha tem um objetivo mensurável e um segmento de clientes. Respeita o RGPD: emails só para quem aceitou newsletter.',
 array['campaign.create','promotion.create','insight'], '0 9 * * 2,5', 2),
('seo', 'SEO e Conteúdos',
 'Melhora títulos, descrições e textos dos produtos e cria páginas que trazem visitas do Google.',
 'És o especialista de SEO e conteúdos da iNurse. Encontra produtos com descrição pobre, sem título/descrição SEO ou com nomes pouco claros e propõe textos melhores: título SEO até 60 caracteres, meta descrição até 155, descrição do produto em HTML simples com benefícios, materiais, utilização profissional e cuidados. Propõe também páginas-guia (ex.: "Como escolher socas para enfermagem", "Meias de compressão: que classe escolher") com o tipo page.upsert. Não inventes características técnicas que não estejam nos dados; quando faltar informação, diz o que falta.',
 array['product.content','page.upsert','insight'], '0 10 * * 3', 3),
('precos', 'Preços e Promoções',
 'Vigia margens, preços e promoções; propõe ajustes e regras de margem.',
 'És o responsável de preços e promoções da iNurse. Com base no custo, margem atual, vendas e regras de margem, propõe: ajustes de regras de margem (pricing_rule.upsert), promoções com prazo (promotion.create), destaques (product.featured) e, raramente, alterações pontuais de preço (product.prices). Nunca proponhas preços abaixo da margem mínima configurada nem descontos acima do máximo configurado. Explica sempre o efeito na margem em euros.',
 array['pricing_rule.upsert','promotion.create','product.featured','product.prices','insight'], '0 9 * * 4', 4),
('retencao', 'Clientes e Retenção',
 'Traz clientes de volta: carrinhos abandonados, clientes inativos, segunda compra.',
 'És o responsável de clientes e retenção da iNurse. Usa os segmentos (carrinhos abandonados, clientes que compraram há mais de 6 meses, clientes com 1 só compra, subscritores da newsletter) para propor campanhas de reativação e cupões personalizados. Socas e meias têm recompra natural (desgaste em 6–12 meses): aproveita isso. Respeita o RGPD.',
 array['campaign.create','promotion.create','insight'], '0 11 * * 1,4', 5),
('analista', 'Analista',
 'Relatório semanal com números: vendas, conversão, produtos, clientes e margens.',
 'És o analista de dados da iNurse. Produz um relatório semanal claro, com números e comparação com a semana anterior: vendas, encomendas, ticket médio, produtos mais vendidos, produtos sem vendas, margem média, clientes novos vs recorrentes, cupões usados, carrinhos abandonados. Termina com 3 observações acionáveis. Usa o tipo insight para alertas importantes.',
 array['insight'], '0 7 * * 1', 6);

-- ---------- Dados que os agentes recebem (só leitura, resumidos) ----------
create or replace function public.agent_context() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  -- só o servidor (service_role, usado pela função dos agentes) ou um administrador
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' and not is_admin() then
    raise exception 'sem permissão';
  end if;
  return jsonb_build_object(
    'hoje', now()::date,
    'loja', (select value from settings where key = 'public.store'),
    'politica', (select value - 'monthly_budget_usd' from settings where key = 'agents'),
    'portes', (select value from settings where key = 'public.shipping'),
    'vendas', jsonb_build_object(
       'ultimos_7d',  (select jsonb_build_object('encomendas', count(*), 'total_eur', coalesce(sum(total_cents),0)/100.0) from orders where status in ('paid','processing','shipped','delivered') and created_at >= now() - interval '7 days'),
       'anteriores_7d', (select jsonb_build_object('encomendas', count(*), 'total_eur', coalesce(sum(total_cents),0)/100.0) from orders where status in ('paid','processing','shipped','delivered') and created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'),
       'ultimos_30d', (select jsonb_build_object('encomendas', count(*), 'total_eur', coalesce(sum(total_cents),0)/100.0) from orders where status in ('paid','processing','shipped','delivered') and created_at >= now() - interval '30 days'),
       'por_pagar', (select count(*) from orders where status = 'pending_payment')),
    'mais_vendidos_90d', (select coalesce(jsonb_agg(x), '[]') from (
        select i.title, sum(i.quantity) as unidades, sum(i.quantity * i.unit_price_cents)/100.0 as eur
          from order_items i join orders o on o.id = i.order_id
         where o.status in ('paid','processing','shipped','delivered') and o.created_at >= now() - interval '90 days'
         group by i.title order by unidades desc limit 10) x),
    'catalogo', jsonb_build_object(
       'ativos', (select count(*) from products where status = 'active'),
       'esgotados', (select count(*) from products where status = 'out_of_stock'),
       'rascunho', (select count(*) from products where status = 'draft'),
       'sem_seo', (select count(*) from products where status = 'active' and (seo_description is null or seo_title is null)),
       'descricao_curta', (select count(*) from products where status = 'active' and length(coalesce(description_html,'')) < 200)),
    'produtos', (select coalesce(jsonb_agg(x), '[]') from (
        select p.id, p.title, p.brand, p.status, p.featured, length(coalesce(p.description_html,'')) as desc_len,
               p.seo_title is not null as tem_seo,
               (select string_agg(c.name, ', ') from product_categories pc join categories c on c.id = pc.category_id where pc.product_id = p.id) as categorias,
               (select min(price_cents)/100.0 from variants where product_id = p.id and active) as preco_min_eur,
               (select min(cost_cents)/100.0 from variants where product_id = p.id and active) as custo_min_eur,
               (select round(avg((price_cents / (1 + p.vat_rate/100.0) - cost_cents) * 100.0 / nullif(price_cents / (1 + p.vat_rate/100.0), 0)), 1)
                  from variants where product_id = p.id and active and cost_cents is not null) as margem_pct,
               (select coalesce(sum(i.quantity),0) from order_items i join variants v on v.id = i.variant_id where v.product_id = p.id) as unidades_vendidas
          from products p where p.status in ('active','out_of_stock') order by p.position limit 200) x),
    'regras_margem', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', name, 'ambito', scope, 'metodo', method, 'pct', pct, 'arredondamento', rounding)), '[]') from pricing_rules where active),
    'promocoes_ativas', (select coalesce(jsonb_agg(jsonb_build_object('nome', name, 'codigo', code, 'tipo', kind, 'valor', value, 'fim', ends_at, 'usos', uses)), '[]')
                           from promotions where active and (ends_at is null or ends_at > now())),
    'clientes', jsonb_build_object(
       'total', (select count(*) from customers),
       'newsletter', (select count(*) from customers where newsletter),
       'compraram_1_vez', (select count(*) from customers where legacy_total_orders = 1),
       'recorrentes', (select count(*) from customers where legacy_total_orders > 1),
       'novos_30d', (select count(*) from customers where created_at >= now() - interval '30 days')),
    'carrinhos_abandonados_7d', (select count(*) from carts where status = 'open' and email is not null and jsonb_array_length(items) > 0
                                   and updated_at < now() - interval '2 hours' and updated_at >= now() - interval '7 days'),
    'propostas_pendentes', (select coalesce(jsonb_agg(jsonb_build_object('agente', agent_key, 'tipo', kind, 'titulo', title, 'criada', created_at::date)), '[]')
                              from proposals where status = 'pending'),
    'decisoes_recentes', (select coalesce(jsonb_agg(jsonb_build_object('agente', agent_key, 'titulo', title, 'decisao', status, 'nota', decision_note)), '[]')
                            from (select * from proposals where status in ('applied','rejected') order by decided_at desc limit 15) d)
  );
end $$;

-- ---------- Decidir e executar uma proposta ----------
create or replace function public.decide_proposal(p_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare pr proposals; res jsonb := '{}'; x jsonb; pol jsonb; nid uuid; cur int; vat numeric; cost int;
begin
  if not is_admin() then raise exception 'sem permissão'; end if;
  select * into pr from proposals where id = p_id for update;
  if pr.id is null then raise exception 'proposta não encontrada'; end if;
  if pr.status <> 'pending' then raise exception 'esta proposta já foi decidida (%)', pr.status; end if;

  if not p_approve then
    update proposals set status = 'rejected', decision_note = p_note, decided_by = auth.uid(), decided_at = now() where id = p_id;
    return jsonb_build_object('status', 'rejected');
  end if;

  select value into pol from settings where key = 'agents';
  update proposals set status = 'approved', decision_note = p_note, decided_by = auth.uid(), decided_at = now() where id = p_id;

  begin
    case pr.kind
    when 'insight' then
      res := jsonb_build_object('lido', true);

    when 'promotion.create' then
      x := pr.payload;
      if x->>'kind' = 'percent' and (x->>'value')::numeric > coalesce((pol->>'max_discount_pct')::numeric, 100) then
        raise exception 'desconto acima do máximo configurado (% %%)', pol->>'max_discount_pct';
      end if;
      insert into promotions (name, code, kind, value, min_order_cents, starts_at, ends_at, max_uses, active)
      values (x->>'name', upper(nullif(x->>'code','')), x->>'kind', coalesce((x->>'value')::numeric, 0),
              coalesce((x->>'min_order_cents')::int, 0), nullif(x->>'starts_at','')::timestamptz, nullif(x->>'ends_at','')::timestamptz,
              nullif(x->>'max_uses','')::int, true)
      returning id into nid;
      res := jsonb_build_object('promotion_id', nid);

    when 'product.content' then
      x := pr.payload;
      update products set
        title            = coalesce(nullif(x->>'title',''), title),
        excerpt          = coalesce(nullif(x->>'excerpt',''), excerpt),
        description_html = coalesce(nullif(x->>'description_html',''), description_html),
        seo_title        = coalesce(nullif(x->>'seo_title',''), seo_title),
        seo_description  = coalesce(nullif(x->>'seo_description',''), seo_description),
        updated_at = now()
      where id = (x->>'product_id')::uuid;
      if not found then raise exception 'produto não encontrado'; end if;
      res := jsonb_build_object('product_id', x->>'product_id');

    when 'product.featured' then
      update products set featured = coalesce((pr.payload->>'featured')::boolean, true), updated_at = now()
       where id in (select jsonb_array_elements_text(pr.payload->'product_ids')::uuid);
      res := jsonb_build_object('produtos', jsonb_array_length(pr.payload->'product_ids'));

    when 'product.prices' then
      for x in select * from jsonb_array_elements(pr.payload->'changes') loop
        select v.price_cents, p.vat_rate, v.cost_cents into cur, vat, cost from variants v join products p on p.id = v.product_id where v.id = (x->>'variant_id')::uuid;
        if cur is null then raise exception 'tamanho não encontrado'; end if;
        if cost is not null and ((x->>'price_cents')::int / (1 + vat/100.0) - cost) * 100.0 / ((x->>'price_cents')::int / (1 + vat/100.0))
                                < coalesce((pol->>'min_margin_pct')::numeric, 0) then
          raise exception 'preço abaixo da margem mínima configurada';
        end if;
        update variants set price_cents = (x->>'price_cents')::int, compare_at_cents = nullif(x->>'compare_at_cents','')::int, price_locked = true
         where id = (x->>'variant_id')::uuid;
        insert into price_history (variant_id, old_cents, new_cents, reason) values ((x->>'variant_id')::uuid, cur, (x->>'price_cents')::int, 'agente');
      end loop;
      res := jsonb_build_object('alterados', jsonb_array_length(pr.payload->'changes'));

    when 'pricing_rule.upsert' then
      x := pr.payload;
      if (x->>'method') = 'margin' and (x->>'pct')::numeric < coalesce((pol->>'min_margin_pct')::numeric, 0) then
        raise exception 'margem abaixo do mínimo configurado';
      end if;
      if x ? 'id' and x->>'id' <> '' then
        update pricing_rules set name = x->>'name', method = x->>'method', pct = (x->>'pct')::numeric,
               rounding = coalesce(x->>'rounding', rounding), min_profit_cents = coalesce((x->>'min_profit_cents')::int, min_profit_cents)
         where id = (x->>'id')::uuid returning id into nid;
      else
        insert into pricing_rules (name, scope, scope_id, method, pct, rounding, min_profit_cents)
        values (x->>'name', x->>'scope', nullif(x->>'scope_id','')::uuid, coalesce(x->>'method','markup'), (x->>'pct')::numeric,
                coalesce(x->>'rounding','0.90'), coalesce((x->>'min_profit_cents')::int, 0))
        returning id into nid;
      end if;
      res := jsonb_build_object('rule_id', nid, 'precos_alterados', (select count(*) from apply_pricing(null, false)));

    when 'campaign.create' then
      x := pr.payload;
      insert into campaigns (proposal_id, channel, title, content, segment, scheduled_at)
      values (pr.id, x->>'channel', x->>'title', coalesce(x->'content', '{}'), coalesce(x->'segment', '{}'), nullif(x->>'scheduled_at','')::timestamptz)
      returning id into nid;
      res := jsonb_build_object('campaign_id', nid);

    when 'page.upsert' then
      x := pr.payload;
      insert into pages (slug, title, body_html, seo_title, seo_description, published)
      values (x->>'slug', x->>'title', x->>'body_html', x->>'seo_title', x->>'seo_description', true)
      on conflict (slug) do update set title = excluded.title, body_html = excluded.body_html,
        seo_title = excluded.seo_title, seo_description = excluded.seo_description, updated_at = now();
      res := jsonb_build_object('slug', x->>'slug');
    end case;

    update proposals set status = 'applied', applied_at = now(), result = res where id = p_id;
    return jsonb_build_object('status', 'applied', 'result', res);
  exception when others then
    update proposals set status = 'failed', result = jsonb_build_object('erro', sqlerrm) where id = p_id;
    return jsonb_build_object('status', 'failed', 'erro', sqlerrm);
  end;
end $$;
grant execute on function public.decide_proposal(uuid, boolean, text) to authenticated;
