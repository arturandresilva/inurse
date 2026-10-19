-- =====================================================================
-- iNurse v2 — finanças: custos da loja, custo por encomenda, resultado
-- (ganho/perda) e agente Contabilista
-- Todos os valores de resultado são SEM IVA (o IVA cobrado é do Estado).
-- =====================================================================

-- ---------- Condições comerciais do fornecedor ----------
-- ex. Nursing Care: {"shipping_tiers":[{"up_to_cents":4999,"cost_cents":500},{"up_to_cents":7499,"cost_cents":300}],
--                    "shipping_vat":23, "payment_discount_pct":5, "payment_terms":"pronto pagamento"}
alter table suppliers add column conditions jsonb not null default '{}';

-- custo dos portes cobrados pelo fornecedor por uma compra de X cêntimos (s/IVA)
create or replace function public.supplier_shipping_cents(p_supplier uuid, p_purchase_cents int) returns int
language sql stable set search_path = public as $$
  select coalesce((
    select (t->>'cost_cents')::int from suppliers s, jsonb_array_elements(s.conditions->'shipping_tiers') t
     where s.id = p_supplier and p_purchase_cents <= (t->>'up_to_cents')::int
     order by (t->>'up_to_cents')::int limit 1), 0);
$$;

-- ---------- Custo registado em cada venda ----------
alter table order_items add column unit_cost_cents int;           -- custo s/IVA no momento da venda
alter table order_items add column supplier_id uuid references suppliers(id) on delete set null;
alter table orders add column cost_supplier_shipping_cents int not null default 0;  -- portes pagos ao fornecedor (s/IVA)
alter table orders add column cost_payment_fee_cents int not null default 0;        -- comissão do pagamento
alter table orders add column cost_carrier_cents int not null default 0;            -- envio pago por ti à transportadora (s/IVA)
alter table orders add column cost_packaging_cents int not null default 0;
alter table orders add column costs_confirmed boolean not null default false;       -- true quando corriges com a fatura real

-- preenche custos estimados ao criar a linha da encomenda
create or replace function public.order_item_cost_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.variant_id is not null and new.unit_cost_cents is null then
    select v.cost_cents, p.supplier_id into new.unit_cost_cents, new.supplier_id
      from variants v join products p on p.id = v.product_id where v.id = new.variant_id;
  end if;
  return new;
end $$;
create trigger trg_order_item_cost before insert on order_items for each row execute function order_item_cost_snapshot();

-- estima portes do fornecedor e comissão de pagamento de uma encomenda (chamada no checkout e quando muda)
create or replace function public.estimate_order_costs(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; fees jsonb; ship int := 0; s record; fee int := 0; f jsonb;
begin
  select * into o from orders where id = p_order;
  if o.id is null or o.costs_confirmed then return; end if;
  -- uma compra ao fornecedor por encomenda (envio direto)
  for s in select supplier_id, sum(coalesce(unit_cost_cents, 0) * quantity)::int as purchase
             from order_items where order_id = p_order and supplier_id is not null group by supplier_id loop
    ship := ship + supplier_shipping_cents(s.supplier_id, s.purchase);
  end loop;
  select value into fees from settings where key = 'finance';
  f := fees->'payment_fees'->(o.payment_method);
  if f is not null then fee := round(o.total_cents * coalesce((f->>'pct')::numeric, 0) / 100.0 + coalesce((f->>'fixed_cents')::int, 0)); end if;
  update orders set cost_supplier_shipping_cents = ship, cost_payment_fee_cents = fee,
         cost_carrier_cents = coalesce((fees->>'carrier_cents_per_order')::int, 0),
         cost_packaging_cents = coalesce((fees->>'packaging_cents_per_order')::int, 0)
   where id = p_order;
end $$;

create or replace function public.trg_estimate_costs() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform estimate_order_costs(new.id); return null; end $$;
-- corre no fim da transação do checkout, quando as linhas já existem
create constraint trigger trg_orders_costs after insert on orders deferrable initially deferred
  for each row execute function trg_estimate_costs();

insert into settings (key, value) values ('finance', '{
  "vat_registered": true,
  "payment_fees": {
    "mbway":      {"pct": 0.7, "fixed_cents": 7},
    "multibanco": {"pct": 0.7, "fixed_cents": 7},
    "transfer":   {"pct": 0,   "fixed_cents": 0}
  },
  "carrier_cents_per_order": 0,
  "packaging_cents_per_order": 0,
  "note": "Comissões indicativas; ajustar ao contrato do gateway (ifthenpay/Eupago)."
}') on conflict (key) do nothing;

-- ---------- Despesas da loja (fixas e pontuais) ----------
create table expenses (
  id            uuid primary key default gen_random_uuid(),
  category      text not null check (category in ('plataforma','dominio','pagamentos','faturacao','contabilidade','marketing',
                                                  'publicidade','transportes','embalagens','ia','fornecedor','impostos','outros')),
  description   text not null,
  amount_cents  int not null check (amount_cents >= 0),   -- SEM IVA
  vat_rate      numeric(4,2) not null default 23,
  recurrence    text not null default 'once' check (recurrence in ('once','monthly','yearly')),
  starts_on     date not null default current_date,
  ends_on       date,
  vendor        text,
  notes         text,
  created_at    timestamptz not null default now()
);
alter table expenses enable row level security;
create policy "admin gere tudo" on expenses for all to authenticated using (is_admin()) with check (is_admin());

-- despesas atuais conhecidas (o Artur ajusta no backoffice)
insert into expenses (category, description, amount_cents, vat_rate, recurrence, vendor, notes) values
 ('plataforma', 'Loja Online CTT (até à migração)', 2276, 23, 'monthly', 'CTT', '28 €/mês com IVA; terminar quando a loja nova entrar em produção'),
 ('plataforma', 'Alojamento (Vercel + Supabase, plano gratuito)', 0, 23, 'monthly', 'Vercel/Supabase', 'Gratuito enquanto o volume for pequeno');

-- valor de uma despesa num intervalo de datas (rateio de mensais/anuais por dia)
create or replace function public.expense_in_period(e expenses, p_from date, p_to date) returns int
language plpgsql immutable as $$
declare a date := greatest(e.starts_on, p_from); b date := least(coalesce(e.ends_on, p_to), p_to); days int;
begin
  if b < a then return 0; end if;
  if e.recurrence = 'once' then return case when e.starts_on between p_from and p_to then e.amount_cents else 0 end; end if;
  days := b - a + 1;
  return round(e.amount_cents * days / case e.recurrence when 'monthly' then 30.4375 else 365.25 end);
end $$;

-- ---------- Conta de resultados ----------
create or replace function public.profit_and_loss(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  rev_gross int; rev_net int; cogs int; missing_cost int; sup_ship int; fees int; carrier int; pack int;
  exp_total int; exp_by jsonb; ai_usd numeric; n_orders int; refunds int; gross_profit int; net_profit int;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' and not is_admin() then
    raise exception 'sem permissão';
  end if;

  with o as (select * from orders where status in ('paid','processing','shipped','delivered')
               and created_at >= p_from and created_at < p_to + 1)
  select count(*),
         coalesce(sum(total_cents), 0),
         coalesce(sum(cost_supplier_shipping_cents), 0), coalesce(sum(cost_payment_fee_cents), 0),
         coalesce(sum(cost_carrier_cents), 0), coalesce(sum(cost_packaging_cents), 0)
    into n_orders, rev_gross, sup_ship, fees, carrier, pack from o;

  -- receita sem IVA: artigos ao IVA de cada linha (descontos repartidos), portes ao IVA normal
  select coalesce(round(sum(
           (i.unit_price_cents * i.quantity * (1 - o.discount_cents::numeric / nullif(o.subtotal_cents, 0))) / (1 + i.vat_rate / 100.0))), 0)
         + coalesce((select round(sum(shipping_cents / 1.23)) from orders o2 where o2.status in ('paid','processing','shipped','delivered')
                       and o2.created_at >= p_from and o2.created_at < p_to + 1), 0),
         coalesce(sum(coalesce(i.unit_cost_cents, 0) * i.quantity), 0),
         coalesce(sum(i.quantity) filter (where i.unit_cost_cents is null), 0)
    into rev_net, cogs, missing_cost
    from order_items i join orders o on o.id = i.order_id
   where o.status in ('paid','processing','shipped','delivered') and o.created_at >= p_from and o.created_at < p_to + 1;

  select coalesce(sum(total_cents), 0) into refunds from orders where status = 'refunded' and created_at >= p_from and created_at < p_to + 1;

  select coalesce(sum(v), 0), coalesce(jsonb_object_agg(cat, v) filter (where v > 0), '{}')
    into exp_total, exp_by
    from (select category as cat, sum(expense_in_period(e, p_from, p_to)) as v from expenses e group by category) x;
  select coalesce(sum(cost_usd), 0) into ai_usd from agent_runs where started_at >= p_from and started_at < p_to + 1;

  gross_profit := rev_net - cogs - sup_ship - fees - carrier - pack;
  net_profit := gross_profit - exp_total - round(ai_usd * 0.93 * 100)::int;   -- câmbio aproximado USD→EUR

  return jsonb_build_object(
    'periodo', jsonb_build_object('de', p_from, 'ate', p_to),
    'encomendas', n_orders,
    'vendas_com_iva_eur', round(rev_gross / 100.0, 2),
    'vendas_sem_iva_eur', round(rev_net / 100.0, 2),
    'custo_mercadoria_eur', round(cogs / 100.0, 2),
    'portes_fornecedor_eur', round(sup_ship / 100.0, 2),
    'comissoes_pagamento_eur', round(fees / 100.0, 2),
    'envios_transportadora_eur', round(carrier / 100.0, 2),
    'embalagens_eur', round(pack / 100.0, 2),
    'margem_bruta_eur', round(gross_profit / 100.0, 2),
    'margem_bruta_pct', case when rev_net > 0 then round(gross_profit * 100.0 / rev_net, 1) end,
    'despesas_fixas_eur', round(exp_total / 100.0, 2),
    'despesas_por_categoria_eur', (select jsonb_object_agg(k, round((v::text)::numeric / 100.0, 2)) from jsonb_each(exp_by) as x(k, v)),
    'custo_ia_eur', round(ai_usd * 0.93, 2),
    'resultado_eur', round(net_profit / 100.0, 2),
    'reembolsos_com_iva_eur', round(refunds / 100.0, 2),
    'unidades_sem_custo_registado', missing_cost,
    'ponto_equilibrio_encomendas_mes', case when n_orders > 0 and gross_profit > 0
        then ceil((select coalesce(sum(expense_in_period(e, (date_trunc('month', p_to::timestamp))::date,
                                  (date_trunc('month', p_to::timestamp) + interval '1 month - 1 day')::date)), 0) from expenses e)
                  / (gross_profit::numeric / n_orders)) end
  );
end $$;
grant execute on function public.profit_and_loss(date, date) to authenticated;

-- resultado por mês (últimos N meses) — para gráfico no backoffice e para o agente
create or replace function public.profit_by_month(p_months int default 6) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m date; out jsonb := '[]';
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' and not is_admin() then
    raise exception 'sem permissão';
  end if;
  for m in select generate_series(date_trunc('month', now()) - make_interval(months => p_months - 1), date_trunc('month', now()), interval '1 month')::date loop
    out := out || jsonb_build_object('mes', to_char(m, 'YYYY-MM'),
      'r', profit_and_loss(m, (m + interval '1 month - 1 day')::date));
  end loop;
  return out;
end $$;
grant execute on function public.profit_by_month(int) to authenticated;

-- ---------- Agente Contabilista ----------
insert into agents (key, name, role, instructions, allowed_kinds, schedule, position) values
('contabilista', 'Contabilista',
 'Diz-te quanto custa a loja, se estás a ganhar ou a perder dinheiro e porquê.',
 'És o contabilista (controller financeiro) da iNurse. Recebes a conta de resultados do mês corrente, do mês anterior e dos últimos 6 meses, as despesas registadas, as condições dos fornecedores e as margens por produto. Todos os valores de resultado são SEM IVA. Produz um relatório claro em português de Portugal: 1) Estou a ganhar ou a perder? (resultado do mês e acumulado, em euros), 2) Para onde vai o dinheiro (custo da mercadoria, portes do fornecedor, comissões, despesas fixas, publicidade, IA), 3) Ponto de equilíbrio (quantas encomendas/mês cobrem as despesas fixas), 4) Riscos (produtos com margem baixa depois de portes do fornecedor, encomendas pequenas que dão prejuízo, custos sem registo), 5) 3 recomendações concretas (ex.: valor mínimo para portes grátis, agrupar compras ao fornecedor para chegar aos 75 € sem portes, ajustar margens). Usa "insight" para alertas (prioridade alta se o mês estiver em prejuízo) e "pricing_rule.upsert" só quando a margem real não cobre os custos. Não és contabilista certificado: lembra que as obrigações fiscais (IVA, IRS/IRC) devem ser confirmadas com o contabilista certificado.',
 array['insight','pricing_rule.upsert'], '0 8 1,15 * *', 7)
on conflict (key) do nothing;
