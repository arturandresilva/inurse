// Tradutor: traduz para inglês, espanhol e francês os conteúdos da loja que ainda não têm tradução ou cujo original mudou
// (produtos: resumo, descrição, SEO e cor; categorias: nome; páginas: título, texto e SEO; campanhas da página inicial: textos). Usa a API Anthropic.
//  POST {}  — agendador (agente "tradutor", de madrugada) ou backoffice ("Traduzir agora")
// Cada execução trabalha até ~110 s; o que faltar fica para a seguinte.
const SB = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = "claude-sonnet-5-5";
const LANGS = ["en", "es", "fr"] as const;
const NAMES = { en: "inglês (Reino Unido)", es: "espanhol (Espanha)", fr: "francês (França)" };

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
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

// impressão digital do original: quando muda, a tradução volta a ser feita
export async function hash(o: Row) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(JSON.stringify(o)));
  return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Job = { table: "products" | "categories" | "pages" | "home_slides"; id: string; src: Row; h: string; current: Row };
const FIELDS = { products: ["excerpt", "description_html", "seo_title", "seo_description", "color"], categories: ["name"], pages: ["title", "body_html", "seo_title", "seo_description"], home_slides: ["eyebrow", "title", "body", "cta_label"] };

async function pending(limit: number): Promise<Job[]> {
  const jobs: Job[] = [];
  const add = async (table: Job["table"], rows: Row[]) => {
    for (const r of rows) {
      const src = Object.fromEntries(FIELDS[table].filter((f) => r[f]).map((f) => [f, r[f]]));
      if (!Object.keys(src).length) continue;
      const h = await hash(src);
      const tr = r.translations ?? {};
      if (LANGS.every((l) => tr[l]?._src === h)) continue;
      jobs.push({ table, id: r.id, src, h, current: tr });
      if (jobs.length >= limit) return;
    }
  };
  await add("categories", ((await rest("categories?select=id,name,translations")) ?? []) as Row[]);
  if (jobs.length < limit) await add("home_slides", ((await rest("home_slides?select=id,eyebrow,title,body,cta_label,translations")) ?? []) as Row[]);
  if (jobs.length < limit) await add("pages", ((await rest("pages?published=eq.true&select=id,title,body_html,seo_title,seo_description,translations")) ?? []) as Row[]);
  if (jobs.length < limit) await add("products", ((await rest("products?status=in.(active,out_of_stock)&select=id,excerpt,description_html,seo_title,seo_description,color,translations&order=featured.desc,position&limit=2000")) ?? []) as Row[]);
  return jobs;
}

const TOOL = {
  name: "guardar_traducoes",
  description: "Guarda as traduções de todos os itens pedidos.",
  input_schema: { type: "object", properties: { itens: { type: "array", items: { type: "object", properties: {
    id: { type: "string" }, en: { type: "object" }, es: { type: "object" }, fr: { type: "object" } }, required: ["id", "en", "es", "fr"] } } }, required: ["itens"] },
};

async function translateBatch(batch: Job[], instructions: string) {
  const input = batch.map((j) => ({ id: j.id, tipo: j.table, campos: j.src }));
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 16000, system: `${instructions}\n\nEntrega sempre as traduções chamando a ferramenta ${TOOL.name}.`, tools: [TOOL], tool_choice: { type: "auto" },
      messages: [{ role: "user", content: `Traduz cada item para ${LANGS.map((l) => `${l} = ${NAMES[l]}`).join(", ")}. Devolve, para cada id, os mesmos campos traduzidos (mesmos nomes de campo). Itens:\n${JSON.stringify(input)}` }] }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(r.status === 401 ? "A chave da API Anthropic não é válida." : `IA: ${data?.error?.message ?? r.status}`);
  const out = (data.content ?? []).find((c: Row) => c.type === "tool_use")?.input?.itens ?? [];
  return { out: out as Row[], tin: data.usage?.input_tokens ?? 0, tout: data.usage?.output_tokens ?? 0 };
}

async function run(trigger: string) {
  if (!KEY) return { skipped: true, reason: "Falta a chave da API Anthropic (ANTHROPIC_API_KEY) nos segredos das Edge Functions do Supabase." };
  const agent = await one("agents?key=eq.tradutor&select=*");
  const policy = (await one("settings?key=eq.agents&select=value"))?.value ?? {};
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const spent = (((await rest(`agent_runs?select=cost_usd&started_at=gte.${monthStart}`)) ?? []) as Row[]).reduce((a, r) => a + Number(r.cost_usd ?? 0), 0);
  if (spent >= Number(policy.monthly_budget_usd ?? 15)) return { skipped: true, reason: `Orçamento mensal da IA atingido (${spent.toFixed(2)} USD).` };
  const jobs = await pending(60);
  if (!jobs.length) return { ok: true, resumo: "Está tudo traduzido." };
  const [runRow] = (await rest("agent_runs", { method: "POST", body: JSON.stringify({ agent_key: "tradutor", trigger }) })) as Row[];
  const start = Date.now(); let tin = 0, tout = 0, done = 0;
  try {
    // páginas (textos longos) uma a uma; o resto em grupos
    let i = 0;
    while (i < jobs.length && Date.now() - start < 110e3) {
      const size = jobs[i].table === "pages" || String(jobs[i].src.description_html ?? "").length > 1500 ? 1 : 6;
      const batch = jobs.slice(i, i + size); i += size;
      const r = await translateBatch(batch, agent?.instructions ?? "");
      tin += r.tin; tout += r.tout;
      for (const j of batch) {
        const t = r.out.find((x) => x.id === j.id);
        if (!t) continue;
        const tr: Row = { ...j.current };
        for (const l of LANGS) {
          const v = t[l] ?? {};
          tr[l] = { ...Object.fromEntries(FIELDS[j.table].filter((f) => typeof v[f] === "string" && v[f].trim()).map((f) => [f, v[f]])), _src: j.h };
        }
        await rest(`${j.table}?id=eq.${j.id}`, { method: "PATCH", body: JSON.stringify({ translations: tr }) });
        done++;
      }
    }
    const left = jobs.length - done;
    const cost = (tin * 2 + tout * 10) / 1e6;
    const resumo = `${done} conteúdo(s) traduzidos${left > 0 ? `, faltam ${left}${jobs.length >= 60 ? "+" : ""} (continua na próxima execução)` : ""}`;
    await rest(`agent_runs?id=eq.${runRow.id}`, { method: "PATCH", body: JSON.stringify({ status: "done", summary: resumo, tokens_in: tin, tokens_out: tout, cost_usd: cost, finished_at: new Date().toISOString() }) });
    await rest("agents?key=eq.tradutor", { method: "PATCH", body: JSON.stringify({ last_run_at: new Date().toISOString() }) });
    return { ok: true, resumo, left };
  } catch (e) {
    await rest(`agent_runs?id=eq.${runRow.id}`, { method: "PATCH", body: JSON.stringify({ status: "failed", error: String((e as Error).message).slice(0, 500), tokens_in: tin, tokens_out: tout, cost_usd: (tin * 2 + tout * 10) / 1e6, finished_at: new Date().toISOString() }) }).catch(() => null);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const given = req.headers.get("x-cron-secret") ?? "";
    let cron = false;
    if (given) cron = given === (await one("settings?key=eq.cron&select=value"))?.value?.secret;
    if (!cron) {
      const chk = await fetch(`${SB}/rest/v1/rpc/is_admin`, { method: "POST", headers: { apikey: ANON, Authorization: req.headers.get("Authorization") ?? "", "Content-Type": "application/json" }, body: "{}" });
      if (!chk.ok || (await chk.json()) !== true) return json({ error: "sem permissão" }, 401);
    }
    return json(await run(cron ? "agendado" : "manual"));
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
