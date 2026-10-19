// Estado das chaves (segredos das Edge Functions): diz se cada chave existe e se o serviço a aceita.
// Nunca devolve o valor das chaves. Só administradores (backoffice) ou o agendador (x-cron-secret).
const SB = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const env = (k: string) => (Deno.env.get(k) ?? "").trim();

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const setting = async (k: string) => ((await (await fetch(`${SB}/rest/v1/settings?key=eq.${k}&select=value`, { headers: svc })).json())?.[0]?.value ?? {}) as Row;
type Check = { key: string; servico: string; estado: "ok" | "falta" | "erro" | "aviso"; detalhe: string };

async function anthropic(): Promise<Check> {
  const base = { key: "ANTHROPIC_API_KEY", servico: "Assistente, tradutor e agentes (Anthropic)" };
  const k = env("ANTHROPIC_API_KEY");
  if (!k) return { ...base, estado: "falta", detalhe: "Ainda não foi guardada no Supabase." };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": k, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 1, messages: [{ role: "user", content: "ok" }] }),
  });
  if (r.ok) return { ...base, estado: "ok", detalhe: "Chave aceite e com saldo." };
  const m = String((await r.json().catch(() => ({})))?.error?.message ?? r.status);
  if (r.status === 401) return { ...base, estado: "erro", detalhe: "A Anthropic recusou a chave (copiada incompleta, apagada ou com espaços)." };
  if (/credit|balance|billing/i.test(m)) return { ...base, estado: "erro", detalhe: "Chave certa, mas a conta não tem saldo: junta créditos em console.anthropic.com → Billing." };
  return { ...base, estado: "aviso", detalhe: `Resposta da Anthropic: ${m}` };
}

async function resend(): Promise<Check> {
  const base = { key: "RESEND_API_KEY", servico: "Emails aos clientes (Resend)" };
  const k = env("RESEND_API_KEY");
  if (!k) return { ...base, estado: "falta", detalhe: "Ainda não foi guardada no Supabase." };
  const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${k}` } });
  const b = await r.json().catch(() => ({}));
  if (r.ok) {
    const d = ((b?.data ?? []) as Row[]).find((x) => String(x.name).toLowerCase().endsWith("inurse.pt"));
    if (!d) return { ...base, estado: "aviso", detalhe: "Chave aceite, mas o domínio inurse.pt ainda não foi adicionado no Resend (Domains → Add Domain)." };
    if (d.status !== "verified") return { ...base, estado: "aviso", detalhe: `Chave aceite; o domínio ${d.name} está “${d.status}”: falta pôr os registos DNS ou esperar pela verificação.` };
    const e = await setting("email");
    return { ...base, estado: "ok", detalhe: `Chave aceite e domínio ${d.name} verificado.${e.enabled ? "" : " Falta ligar o envio em Configurações → Emails."}` };
  }
  if (r.status === 401 && /restricted/i.test(JSON.stringify(b))) return { ...base, estado: "ok", detalhe: "Chave aceite (só envio; não deixa ver o estado do domínio). Usa “Enviar exemplos” em Configurações → Emails para confirmar." };
  return { ...base, estado: "erro", detalhe: r.status === 401 || r.status === 403 ? "O Resend recusou a chave." : `Resposta do Resend: ${b?.message ?? r.status}` };
}

async function invoicexpress(): Promise<Check> {
  const base = { key: "INVOICEXPRESS_API_KEY", servico: "Faturas (InvoiceXpress)" };
  const k = env("INVOICEXPRESS_API_KEY");
  if (!k) return { ...base, estado: "falta", detalhe: "Ainda não foi guardada no Supabase." };
  const account = String((await setting("invoicing")).account ?? "").trim().replace(/^https?:\/\//, "").replace(/\.app\.invoicexpress\.com.*$/, "");
  if (!account) return { ...base, estado: "aviso", detalhe: "Chave guardada; falta o “Nome da conta” em Configurações → Faturação." };
  const r = await fetch(`https://${account}.app.invoicexpress.com/sequences.json?api_key=${encodeURIComponent(k)}`, { headers: { accept: "application/json" } });
  if (r.ok) return { ...base, estado: "ok", detalhe: `Chave aceite pela conta ${account}.` };
  return { ...base, estado: "erro", detalhe: r.status === 401 ? `A conta ${account} recusou a chave (confirma a chave e o nome da conta).` : r.status === 404 ? `Não existe a conta “${account}” no InvoiceXpress.` : `Resposta do InvoiceXpress: ${r.status}` };
}

function ctt(): Check[] {
  return ["CTT_USER_ID", "CTT_AUTH_ID"].map((k) => ({ key: k, servico: "Etiquetas e recolhas CTT", estado: env(k) ? "ok" : "falta",
    detalhe: env(k) ? "Guardada (é testada ao criar o primeiro envio)." : "Ainda não foi guardada (dada pelos CTT com o contrato de API)." }) as Check);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const given = req.headers.get("x-cron-secret") ?? "";
    let ok = false;
    if (given) ok = given === (await setting("cron")).secret;
    if (!ok) {
      const chk = await fetch(`${SB}/rest/v1/rpc/is_admin`, { method: "POST", headers: { apikey: ANON, Authorization: req.headers.get("Authorization") ?? "", "Content-Type": "application/json" }, body: "{}" });
      if (!chk.ok || (await chk.json()) !== true) return json({ error: "sem permissão" }, 401);
    }
    const safe = (f: () => Promise<Check>, key: string, servico: string) => f().catch((e) => ({ key, servico, estado: "erro", detalhe: `Não foi possível testar: ${(e as Error).message}` }) as Check);
    const checks = [
      ...(await Promise.all([
        safe(anthropic, "ANTHROPIC_API_KEY", "Anthropic"), safe(resend, "RESEND_API_KEY", "Resend"), safe(invoicexpress, "INVOICEXPRESS_API_KEY", "InvoiceXpress"),
      ])),
      ...ctt(),
    ];
    return json({ checks, at: new Date().toISOString() });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
