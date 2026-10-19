// Preços da concorrência: pesquisa na web (ferramenta de pesquisa do Claude) o preço de cada modelo noutras lojas,
// guarda o que encontrou e propõe acompanhar o preço mais barato — nunca abaixo da margem mínima.
//  POST {}                 — todos os modelos (agendador via agente "concorrencia" ou backoffice)
//  POST {model_key: "..."} — só um modelo
const SB = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = "claude-sonnet-5-5";
const PRICE_IN = 2, PRICE_OUT = 10, PRICE_SEARCH = 0.01; // USD

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
async function rest(path: string, init: RequestInit = {}): Promise<Row[] | Row | null> {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...svc, Prefer: "return=representation", ...(init.headers ?? {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split("?")[0]}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
const one = async (p: string) => (((await rest(p)) ?? []) as Row[])[0] ?? null;
const euro = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " €";

type Group = { key: string; label: string; brand: string | null; lead: Row; products: Row[]; our: number };

export function groupProducts(products: Row[]): Group[] {
  const map = new Map<string, Group>();
  for (const p of products) {
    const vs = (p.variants ?? []).filter((v: Row) => v.active && v.price_cents > 0);
    if (!vs.length) continue;
    const key = p.model ? `${(p.brand ?? "").toLowerCase()}|${String(p.model).toLowerCase()}` : `p:${p.id}`;
    let g = map.get(key);
    if (!g) { g = { key, label: [p.brand, p.model ?? p.title].filter(Boolean).join(" "), brand: p.brand, lead: p, products: [], our: Infinity }; map.set(key, g); }
    g.products.push({ ...p, variants: vs });
    g.our = Math.min(g.our, ...vs.map((v: Row) => v.price_cents));
  }
  return [...map.values()];
}

// preço sugerido: o mais barato (menos a margem de "undercut"), em xx,90 sem passar acima; nunca abaixo do mínimo pela margem
export function suggest(cheapest: number, undercut: number, minByMargin: number) {
  const top = cheapest - undercut;
  const s = Math.floor((top - 90) / 100) * 100 + 90;
  return Math.max(s, minByMargin);
}

const RECORD_TOOL = {
  name: "registar_precos",
  description: "Regista os preços encontrados noutras lojas para os modelos pedidos. Chama uma única vez no fim, com todas as ofertas.",
  input_schema: {
    type: "object",
    properties: {
      ofertas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            modelo: { type: "string", description: "o identificador do modelo, exatamente como foi dado (campo id)" },
            loja: { type: "string" }, url: { type: "string" },
            preco_eur: { type: "number", description: "preço atual com IVA, em euros (o mais baixo para um tamanho normal)" },
            portes_eur: { type: ["number", "null"], description: "envio para Portugal, se indicado" },
            em_stock: { type: ["boolean", "null"] }, nota: { type: "string" },
          },
          required: ["modelo", "loja", "url", "preco_eur"],
        },
      },
    },
    required: ["ofertas"],
  },
};

async function askClaude(batch: Group[], instructions: string, cfg: Row) {
  const list = batch.map((g) => ({ id: g.key, modelo: g.label, marca: g.brand, cores: g.products.map((p) => p.color).filter(Boolean).slice(0, 8), o_nosso_preco_eur: g.our / 100 }));
  const tools = [
    { type: "web_search_20250305", name: "web_search", max_uses: Math.max(2, batch.length * (cfg.max_searches_per_model ?? 3)),
      blocked_domains: cfg.blocked_domains ?? ["inurse.pt"], user_location: { type: "approximate", city: "Lisboa", country: "PT", timezone: "Europe/Lisbon" } },
    RECORD_TOOL,
  ];
  const messages: Row[] = [{ role: "user", content: `Modelos a pesquisar (JSON):\n${JSON.stringify(list)}\n\nPesquisa os preços e, no fim, chama registar_precos com todas as ofertas fiáveis que encontraste (pode ser uma lista vazia).` }];
  let tin = 0, tout = 0, searches = 0;
  for (let i = 0; i < 6; i++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 6000, system: instructions, tools, messages }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(r.status === 401 ? "A chave da API Anthropic não é válida." : `IA: ${data?.error?.message ?? r.status}`);
    tin += data.usage?.input_tokens ?? 0; tout += data.usage?.output_tokens ?? 0; searches += data.usage?.server_tool_use?.web_search_requests ?? 0;
    const rec = (data.content ?? []).find((c: Row) => c.type === "tool_use" && c.name === "registar_precos");
    if (rec) return { offers: (rec.input?.ofertas ?? []) as Row[], tin, tout, searches };
    if (data.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: data.content }); continue; }
    // terminou sem registar: pede para registar o que encontrou
    messages.push({ role: "assistant", content: data.content }, { role: "user", content: "Chama agora registar_precos com o que encontraste." });
  }
  return { offers: [], tin, tout, searches };
}

async function run(onlyKey: string | undefined, trigger: string) {
  if (!KEY) return { skipped: true, reason: "Falta a chave da API Anthropic (ANTHROPIC_API_KEY) nos segredos das Edge Functions do Supabase." };
  const agent = await one("agents?key=eq.concorrencia&select=*");
  const policy = (await one("settings?key=eq.agents&select=value"))?.value ?? {};
  const cfg = (await one("settings?key=eq.competition&select=value"))?.value ?? {};
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const spent = (((await rest(`agent_runs?select=cost_usd&started_at=gte.${monthStart}`)) ?? []) as Row[]).reduce((a, r) => a + Number(r.cost_usd ?? 0), 0);
  if (spent >= Number(policy.monthly_budget_usd ?? 15)) return { skipped: true, reason: `Orçamento mensal da IA atingido (${spent.toFixed(2)} USD).` };

  const products = ((await rest("products?status=eq.active&select=id,handle,title,brand,model,color,variants(id,price_cents,cost_cents,active)&limit=2000")) ?? []) as Row[];
  let groups = groupProducts(products);
  if (onlyKey) groups = groups.filter((g) => g.key === onlyKey);
  else {
    // cada execução trata os modelos pesquisados há mais tempo (no máximo 8), para caber no tempo de uma função
    const checks = ((await rest("competitor_checks?select=model_key,checked_at")) ?? []) as Row[];
    const last = new Map(checks.map((c) => [c.model_key, new Date(c.checked_at).getTime()]));
    const week = Date.now() - 6 * 86400e3;
    groups = groups.filter((g) => (last.get(g.key) ?? 0) < week).sort((a, b) => (last.get(a.key) ?? 0) - (last.get(b.key) ?? 0)).slice(0, 8);
  }
  if (!groups.length) return { skipped: true, reason: "Todos os modelos já foram pesquisados esta semana." };

  const [runRow] = (await rest("agent_runs", { method: "POST", body: JSON.stringify({ agent_key: "concorrencia", trigger }) })) as Row[];
  let tin = 0, tout = 0, searches = 0, saved = 0;
  const minMargin = Number(policy.min_margin_pct ?? 25) / 100;
  const undercut = Number(cfg.undercut_cents ?? 0);
  const proposals: Row[] = [];
  const lines: string[] = [];
  try {
    for (let i = 0; i < groups.length; i += 4) {
      const batch = groups.slice(i, i + 4);
      const r = await askClaude(batch, agent?.instructions ?? "", cfg);
      tin += r.tin; tout += r.tout; searches += r.searches;
      for (const g of batch) {
        const offers = r.offers.filter((o) => o.modelo === g.key && Number(o.preco_eur) > 0 && /^https?:\/\//.test(String(o.url ?? "")));
        if (offers.length) {
          await rest("competitor_prices", { method: "POST", body: JSON.stringify(offers.map((o) => ({
            run_id: runRow.id, model_key: g.key, label: g.label, product_id: g.lead.id, shop: String(o.loja).slice(0, 120), url: String(o.url).slice(0, 500),
            price_cents: Math.round(Number(o.preco_eur) * 100), shipping_cents: o.portes_eur != null ? Math.round(Number(o.portes_eur) * 100) : null,
            in_stock: o.em_stock ?? null, note: o.nota ? String(o.nota).slice(0, 300) : null, our_price_cents: g.our }))) });
          saved += offers.length;
        }
        await rest("competitor_checks?on_conflict=model_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ model_key: g.key, label: g.label, checked_at: new Date().toISOString(), offers: offers.length }) });
        const valid = offers.filter((o) => o.em_stock !== false);
        if (!valid.length) { lines.push(`- **${g.label}**: sem ofertas encontradas (nosso preço ${euro(g.our)})`); continue; }
        const best = valid.reduce((a, b) => (Number(a.preco_eur) <= Number(b.preco_eur) ? a : b));
        const cheapest = Math.round(Number(best.preco_eur) * 100);
        lines.push(`- **${g.label}**: nosso ${euro(g.our)} · mais barato ${euro(cheapest)} em [${best.loja}](${best.url}) · ${valid.length} oferta(s)`);
        if (cheapest >= g.our) continue;
        // margem mínima: preço com IVA que mantém a margem sobre o custo (quando há custo)
        const changes: Row[] = []; let blocked = 0, target = 0;
        for (const p of g.products) for (const v of p.variants) {
          const minP = v.cost_cents ? Math.ceil(v.cost_cents * 1.23 / (1 - minMargin)) : 0;
          const s = suggest(cheapest, undercut, minP);
          target = Math.max(target, s);
          if (s < v.price_cents) changes.push({ variant_id: v.id, price_cents: s, compare_at_cents: null });
          else if (minP > cheapest) blocked++;
        }
        if (changes.length) {
          proposals.push({ kind: "product.prices", title: `${g.label}: baixar para ${euro(target)} (há a ${euro(cheapest)} em ${best.loja})`,
            summary: `Acompanhar o preço mais baixo encontrado. ${changes.length} tamanho(s)/cor(es) passam de até ${euro(g.our)} para ${euro(target)}.`,
            rationale: `Ofertas encontradas: ${valid.map((o) => `${o.loja} ${euro(Math.round(o.preco_eur * 100))}`).join("; ")}. Margem mínima de ${Math.round(minMargin * 100)}% respeitada.${blocked ? ` ${blocked} tamanho(s) não descem tanto por causa da margem mínima.` : ""}`,
            expected_impact: "Preço igual ou abaixo do mais barato do mercado.", priority: g.our - cheapest > 500 ? "alta" : "media", payload: { changes } });
        } else if (blocked) {
          proposals.push({ kind: "insight", title: `${g.label}: concorrência a ${euro(cheapest)}, abaixo da tua margem mínima`,
            summary: `${best.loja} vende a ${euro(cheapest)}; o nosso é ${euro(g.our)}. Descer tanto ficaria abaixo da margem mínima de ${Math.round(minMargin * 100)}%.`,
            rationale: `Vale a pena negociar o custo com o fornecedor ou destacar outra vantagem (envio, troca fácil).`, priority: "baixa", payload: {} });
        }
      }
    }
    const props = proposals.slice(0, agent?.max_proposals ?? 30);
    if (props.length) await rest("proposals", { method: "POST", body: JSON.stringify(props.map((p) => ({ agent_key: "concorrencia", run_id: runRow.id, ...p }))) });
    const cost = (tin * PRICE_IN + tout * PRICE_OUT) / 1e6 + searches * PRICE_SEARCH;
    const resumo = `${groups.length} modelo(s) pesquisados, ${saved} preço(s) encontrados, ${props.length} proposta(s)`;
    await rest("reports", { method: "POST", body: JSON.stringify({ agent_key: "concorrencia", run_id: runRow.id, title: `Preços da concorrência: ${resumo}`,
      body_md: `## Preços encontrados\n\n${lines.join("\n")}\n\n_${searches} pesquisas na web · custo ≈ ${cost.toFixed(2)} USD_` }) });
    await rest(`agent_runs?id=eq.${runRow.id}`, { method: "PATCH", body: JSON.stringify({ status: "done", summary: resumo, tokens_in: tin, tokens_out: tout, cost_usd: cost, finished_at: new Date().toISOString() }) });
    await rest("agents?key=eq.concorrencia", { method: "PATCH", body: JSON.stringify({ last_run_at: new Date().toISOString() }) });
    return { ok: true, resumo, proposals: props.length };
  } catch (e) {
    await rest(`agent_runs?id=eq.${runRow.id}`, { method: "PATCH", body: JSON.stringify({ status: "failed", error: String((e as Error).message).slice(0, 500), tokens_in: tin, tokens_out: tout,
      cost_usd: (tin * PRICE_IN + tout * PRICE_OUT) / 1e6 + searches * PRICE_SEARCH, finished_at: new Date().toISOString() }) }).catch(() => null);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const given = req.headers.get("x-cron-secret") ?? "";
    let cron = false;
    if (given) cron = given === (await one("settings?key=eq.cron&select=value"))?.value?.secret;
    if (!cron) {
      const chk = await fetch(`${SB}/rest/v1/rpc/is_admin`, { method: "POST", headers: { apikey: ANON, Authorization: req.headers.get("Authorization") ?? "", "Content-Type": "application/json" }, body: "{}" });
      if (!chk.ok || (await chk.json()) !== true) return json({ error: "sem permissão" }, 401);
    }
    return json(await run(body.model_key ? String(body.model_key) : undefined, cron ? "agendado" : "manual"));
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
