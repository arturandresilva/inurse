// Equipa IA da loja: cada agente lê o estado da loja, escreve um relatório e propõe ações.
// As propostas ficam "por decidir" no backoffice; só são aplicadas quando o Artur aprova.
// Chamado pelo backoffice ("Pedir agora", com sessão de administrador) ou de hora a hora pelo agendador
// (cabeçalho x-cron-secret), que corre os agentes cuja hora chegou.
const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const PRICE: Record<string, [number, number]> = { "claude-sonnet-5-5": [2, 10], "claude-opus-5-5": [4, 20], "claude-haiku-5-5": [0.1, 0.5], "claude-fable-5-1": [4, 20] };

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
  const r = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...svc, Prefer: "return=representation", ...(init.headers ?? {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split("?")[0]}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
const rpc = (fn: string, args: Row = {}) => rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

const PAYLOADS: Record<string, string> = {
  "promotion.create": `{"name": "nome interno", "code": "CODIGO" (obrigatório, maiúsculas, sem espaços), "kind": "percent"|"fixed"|"free_shipping", "value": número (% ou euros), "min_order_cents": int, "starts_at": "AAAA-MM-DDTHH:MM:00+01:00", "ends_at": "...", "max_uses": int|null}`,
  "product.content": `{"product_id": "uuid do produto (da lista 'produtos')", "title"?, "excerpt"? (1-2 frases), "description_html"? (HTML simples com <p>, <ul><li>, <strong>), "seo_title"? (≤ 60 caracteres), "seo_description"? (≤ 155)}`,
  "product.featured": `{"product_ids": ["uuid", ...], "featured": true|false}`,
  "product.prices": `{"changes": [{"variant_id": "uuid", "price_cents": int, "compare_at_cents": int|null}]} — só se tiveres os ids dos tamanhos; prefere pricing_rule.upsert`,
  "pricing_rule.upsert": `{"id"?: "uuid se for alterar uma regra existente", "name": "...", "scope": "global"|"supplier"|"brand"|"category"|"product", "scope_id": "uuid ou null se global", "method": "margin"|"markup", "pct": número, "rounding": "0.90"|"0.99"|"0.50"|"1.00", "min_profit_cents": int}`,
  "campaign.create": `{"channel": "email"|"instagram"|"facebook"|"google_ads"|"blog"|"sms", "title": "...", "content": {email: {"subject","preheader","body_html"}; redes: {"caption","hashtags":[...],"image_brief"}; anúncios: {"headlines":[...],"descriptions":[...],"keywords":[...]}}, "segment": {"type": "newsletter"|"inactive_180d"|"abandoned_carts"|"all_buyers"}, "scheduled_at": "..."|null}`,
  "page.upsert": `{"slug": "endereco-da-pagina", "title": "...", "body_html": "...", "seo_title": "...", "seo_description": "..."}`,
  insight: `{} (só análise; o texto vai no resumo e na justificação)`,
};

function cronDue(expr: string, d: Date): boolean {
  // d já em hora de Lisboa (campos UTC usados como "relógio local")
  const [mi, h, dom, mon, dow] = expr.trim().split(/\s+/);
  const match = (f: string | undefined, v: number) => !f || f === "*" || f.split(",").some((p) => {
    if (p.includes("/")) { const [b, step] = p.split("/"); const start = b === "*" ? 0 : Number(b); return v >= start && (v - start) % Number(step) === 0; }
    if (p.includes("-")) { const [a, b] = p.split("-").map(Number); return v >= a && v <= b; }
    return Number(p) === v;
  });
  void mi;
  return match(h, d.getUTCHours()) && match(dom, d.getUTCDate()) && match(mon, d.getUTCMonth() + 1) && match(dow, d.getUTCDay());
}
function lisbonNow() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute")));
}

async function runAgent(key: string, trigger: "manual" | "agendado") {
  // preços da concorrência (pesquisa na web) e tradutor têm funções próprias
  if (key === "concorrencia" || key === "tradutor") {
    const [c] = ((await rest("settings?key=eq.cron&select=value")) ?? []) as Row[];
    const r = await fetch(`${URL}/functions/v1/${key === "tradutor" ? "traduzir" : "concorrencia"}`, { method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": c?.value?.secret ?? "" }, body: "{}" });
    const out = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    if (out.error) throw new Error(out.error);
    return out;
  }
  const [agent] = (await rest(`agents?key=eq.${encodeURIComponent(key)}&select=*`)) as Row[];
  if (!agent) throw new Error("agente desconhecido");
  if (!KEY) return { skipped: true, reason: "Falta a chave da API Anthropic: guarda-a nos segredos das Edge Functions do Supabase com o nome ANTHROPIC_API_KEY." };
  const [pol] = (await rest(`settings?key=eq.agents&select=value`)) as Row[];
  const policy = pol?.value ?? {};
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const runs = (await rest(`agent_runs?select=cost_usd&started_at=gte.${monthStart}`)) as Row[];
  const spent = runs.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0);
  if (spent >= Number(policy.monthly_budget_usd ?? 15)) {
    await rest("agent_runs", { method: "POST", body: JSON.stringify({ agent_key: key, trigger, status: "skipped", summary: "orçamento mensal atingido", finished_at: new Date().toISOString() }) });
    return { skipped: true, reason: `Orçamento mensal da IA atingido (${spent.toFixed(2)} USD). Aumenta-o nas configurações ou espera pelo próximo mês.` };
  }

  const [run] = (await rest("agent_runs", { method: "POST", body: JSON.stringify({ agent_key: key, trigger }) })) as Row[];
  try {
    const ctx = (await rpc("agent_context")) as Row;
    if (key === "contabilista") {
      const now = new Date(); const y = now.getUTCFullYear(), m = now.getUTCMonth();
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      ctx.contas = {
        este_mes: await rpc("profit_and_loss", { p_from: iso(new Date(Date.UTC(y, m, 1))), p_to: iso(now) }),
        mes_passado: await rpc("profit_and_loss", { p_from: iso(new Date(Date.UTC(y, m - 1, 1))), p_to: iso(new Date(Date.UTC(y, m, 0))) }),
        ultimos_6_meses: await rpc("profit_by_month", { p_months: 6 }),
        despesas: await rest("expenses?select=category,description,amount_cents,recurrence,starts_on,ends_on,vendor"),
      };
    }
    const kinds: string[] = agent.allowed_kinds ?? ["insight"];
    const tool = {
      name: "entregar_trabalho",
      description: "Entrega o relatório e as propostas desta análise.",
      input_schema: {
        type: "object",
        properties: {
          resumo: { type: "string", description: "Uma frase sobre o que encontraste" },
          relatorio_md: { type: "string", description: "Relatório curto em Markdown (opcional), em português de Portugal" },
          propostas: {
            type: "array", maxItems: agent.max_proposals ?? 5,
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: kinds },
                title: { type: "string", description: "Título curto e concreto" },
                summary: { type: "string", description: "O que muda, em linguagem simples" },
                rationale: { type: "string", description: "Porquê, com os números do contexto" },
                expected_impact: { type: "string" },
                priority: { type: "string", enum: ["alta", "media", "baixa"] },
                payload: { type: "object" },
              },
              required: ["kind", "title", "summary", "priority", "payload"],
            },
          },
        },
        required: ["resumo", "propostas"],
      },
    };
    const system = `${agent.instructions}

Política da loja: tom de voz "${policy.brand_voice ?? ""}"; desconto máximo ${policy.max_discount_pct ?? 20}%; margem mínima ${policy.min_margin_pct ?? 25}%.
Trabalhas numa equipa: o Artur (dono) aprova ou rejeita cada proposta. Aprende com "decisoes_recentes" e não repitas propostas pendentes ("propostas_pendentes").
Propõe só o que os dados justificam, no máximo ${agent.max_proposals ?? 5}; se nada se justifica, devolve zero propostas e explica no resumo.
Formato do campo payload para cada tipo permitido:
${kinds.map((k) => `- ${k}: ${PAYLOADS[k] ?? "{}"}`).join("\n")}
Usa só ids que existam no contexto. Valores em cêntimos quando o campo termina em _cents. Datas no fuso de Lisboa.`;
    const model = agent.model || "claude-sonnet-5-5";
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 8000, system, tools: [tool], tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: `Contexto atual da loja (JSON):\n${JSON.stringify(ctx)}\n\nFaz a tua análise de ${agent.name.toLowerCase()} e entrega o trabalho.` }] }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(r.status === 401 ? "A chave da API Anthropic não é válida." : `IA: ${data?.error?.message ?? r.status}`);
    const tin = data.usage?.input_tokens ?? 0, tout = data.usage?.output_tokens ?? 0;
    const [pi, po] = PRICE[model] ?? [2, 10];
    const out = (data.content ?? []).find((c: Row) => c.type === "tool_use")?.input ?? { resumo: "sem resposta", propostas: [] };
    const props = (out.propostas ?? []).filter((p: Row) => kinds.includes(p.kind)).slice(0, agent.max_proposals ?? 5);
    if (props.length) {
      await rest("proposals", { method: "POST", body: JSON.stringify(props.map((p: Row) => ({
        agent_key: key, run_id: run.id, kind: p.kind, title: String(p.title).slice(0, 200), summary: String(p.summary ?? ""), rationale: p.rationale ?? null,
        expected_impact: p.expected_impact ?? null, priority: ["alta", "media", "baixa"].includes(p.priority) ? p.priority : "media", payload: p.payload ?? {},
      }))) });
    }
    if (out.relatorio_md) {
      await rest("reports", { method: "POST", body: JSON.stringify({ agent_key: key, run_id: run.id, title: `${agent.name}: ${String(out.resumo ?? "análise").slice(0, 120)}`, body_md: out.relatorio_md }) });
    }
    await rest(`agent_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "done", summary: out.resumo ?? null, tokens_in: tin, tokens_out: tout, cost_usd: (tin * pi + tout * po) / 1e6, finished_at: new Date().toISOString() }) });
    await rest(`agents?key=eq.${encodeURIComponent(key)}`, { method: "PATCH", body: JSON.stringify({ last_run_at: new Date().toISOString() }) });
    return { ok: true, proposals: props.length, report: !!out.relatorio_md, resumo: out.resumo };
  } catch (e) {
    await rest(`agent_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "failed", error: (e as Error).message.slice(0, 500), finished_at: new Date().toISOString() }) }).catch(() => null);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // o agendador (pg_cron) envia o segredo guardado na base de dados (settings "cron", só visível ao servidor e administradores)
    const given = req.headers.get("x-cron-secret") ?? "";
    let cron = false;
    if (given) {
      const [c] = ((await rest("settings?key=eq.cron&select=value")) ?? []) as Row[];
      cron = !!c?.value?.secret && given === c.value.secret;
    }
    if (!cron) {
      const chk = await fetch(`${URL}/rest/v1/rpc/is_admin`, { method: "POST", headers: { apikey: ANON, Authorization: req.headers.get("Authorization") ?? "", "Content-Type": "application/json" }, body: "{}" });
      if (!chk.ok || (await chk.json()) !== true) return json({ error: "sem permissão" }, 403);
    }
    const body = await req.json().catch(() => ({}));
    if (body.agent) return json(await runAgent(String(body.agent), cron ? "agendado" : "manual"));

    if (body.mode === "due") {
      // propostas antigas por decidir expiram
      await rest(`proposals?status=eq.pending&expires_at=lt.${new Date().toISOString()}`, { method: "PATCH", body: JSON.stringify({ status: "expired" }) });
      const now = lisbonNow();
      const agents = (await rest("agents?enabled=eq.true&select=key,schedule,last_run_at&order=position")) as Row[];
      const due = agents.filter((a) => cronDue(a.schedule, now) && (!a.last_run_at || Date.now() - new Date(a.last_run_at).getTime() > 50 * 60e3)).slice(0, 2);
      const results: Row = {};
      for (const a of due) {
        try { results[a.key] = await runAgent(a.key, "agendado"); } catch (e) { results[a.key] = { error: (e as Error).message }; }
      }
      return json({ hora_lisboa: now.toISOString().slice(0, 16), corridos: results });
    }
    return json({ error: "indica o agente ou mode=due" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
