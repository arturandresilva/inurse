// Emails ao cliente (fila email_outbox): um por cada estado da encomenda e o pedido de avaliação depois da entrega.
//  POST {mode:"due"}            — agendador (x-cron-secret): envia o que está na fila e já passou da hora
//  POST {mode:"test", to}       — backoffice (administrador): envia um exemplo de cada email para "to"
// Envio pelo Resend (resend.com): segredo RESEND_API_KEY nas Edge Functions; domínio inurse.pt verificado no Resend.
const SB = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";

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
const one = async (path: string) => (((await rest(path)) ?? []) as Row[])[0] ?? null;

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const euro = (c: number) => (c / 100).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const first = (n: unknown) => String(n ?? "").trim().split(/\s+/)[0] ?? "";

// ---------- modelo base ----------
let LEGAL: Row = {};
const phone = (p: unknown) => String(p ?? "").replace(/\D/g, "").replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
function layout(title: string, inner: string, site: string) {
  const L = { legal_name: "Artur Silva", nif: "226720462", address: "Praça 20 de Maio", zip: "4590-182", city: "Paços de Ferreira", email: "info@inurse.pt", phone: "918889008", ...Object.fromEntries(Object.entries(LEGAL).filter(([, v]) => v)) };
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f2f5f7;font-family:Arial,Helvetica,sans-serif;color:#1c2a4a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="padding:22px 28px;border-bottom:1px solid #e3e9ee"><a href="${site}" style="text-decoration:none;font:700 24px Arial,sans-serif;letter-spacing:2px;color:#2EB3EA"><span style="color:#E8323C">&#10084;</span>iNURSE</a></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.55">${inner}</td></tr>
<tr><td style="padding:18px 28px;background:#1c2a4a;color:#cfd8e3;font-size:12px;line-height:1.5">
iNurse · calçado profissional e meias de descanso · <a href="mailto:${esc(L.email)}" style="color:#fff">${esc(L.email)}</a> · ${esc(phone(L.phone))}<br>
${esc(L.legal_name)}, NIF ${esc(L.nif)}, ${esc(L.address)}, ${esc(L.zip)} ${esc(L.city)}</td></tr>
</table></td></tr></table></body></html>`;
}
const button = (href: string, label: string) =>
  `<p style="margin:22px 0"><a href="${href}" style="display:inline-block;background:#0f6e63;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:12px">${esc(label)}</a></p>`;

function itemsTable(items: Row[]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e3e9ee;margin:14px 0">${items.map((i) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #e3e9ee">${esc(i.title)}<br><span style="color:#5b6780;font-size:13px">Tamanho ${esc(i.option_value)} · ${i.quantity} un.</span></td>
     <td align="right" style="padding:10px 0;border-bottom:1px solid #e3e9ee;white-space:nowrap">${euro(i.unit_price_cents * i.quantity)}</td></tr>`).join("")}</table>`;
}

// ---------- os três emails ----------
async function render(kind: string, o: Row, cfg: Row): Promise<{ subject: string; html: string }> {
  const site = String(cfg.site_url || "https://www.inurse.pt").replace(/\/$/, "");
  const orderUrl = `${site}/encomenda/${o.number}?t=${o.public_token}`;
  const name = first(o.shipping_address?.name);
  const hi = `<p style="margin:0 0 14px">Olá${name ? " " + esc(name) : ""},</p>`;
  if (kind === "encomenda_recebida") {
    const items = ((await rest(`order_items?order_id=eq.${o.id}&select=title,option_value,quantity,unit_price_cents&order=title`)) ?? []) as Row[];
    const pay = await one("settings?key=eq.public.payments&select=value");
    const transfer = o.payment_method === "transfer"
      ? `<div style="background:#e4f2ec;border-radius:12px;padding:14px 16px;margin:16px 0"><strong>Pagamento por transferência bancária</strong><br>
         IBAN: <strong>${esc(pay?.value?.iban ?? "")}</strong><br>Valor: <strong>${euro(o.total_cents)}</strong><br>
         Indique a referência <strong>#${o.number}</strong> no descritivo. A encomenda segue assim que o pagamento for confirmado.</div>`
      : `<p>Siga as instruções de pagamento na página da encomenda. A encomenda segue assim que o pagamento for confirmado.</p>`;
    return { subject: `Encomenda #${o.number} recebida`, html: layout(`Encomenda #${o.number}`, `${hi}
      <p>Obrigado pela sua encomenda na iNurse. Recebemos a encomenda <strong>#${o.number}</strong>:</p>
      ${itemsTable(items)}
      <p style="text-align:right;margin:0">Portes: ${euro(o.shipping_cents)}${o.discount_cents ? ` · Desconto: −${euro(o.discount_cents)}` : ""}<br><strong style="font-size:17px">Total: ${euro(o.total_cents)}</strong></p>
      ${transfer}${button(orderUrl, "Ver a encomenda")}
      <p style="color:#5b6780;font-size:13px">Tem ${LEGAL.return_days ?? 15} dias depois de receber para trocar ou devolver. A fatura é enviada por email assim que o pagamento for confirmado.</p>`, site) };
  }
  if (kind === "encomenda_enviada") {
    const s = await one(`shipments?order_id=eq.${o.id}&select=carrier,tracking_code&order=shipped_at.desc&limit=1`);
    const code = s?.tracking_code;
    const track = code ? `https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=${encodeURIComponent(code)}` : orderUrl;
    return { subject: `A encomenda #${o.number} está a caminho`, html: layout("Encomenda enviada", `${hi}
      <p>Boas notícias: a sua encomenda <strong>#${o.number}</strong> já saiu do armazém${s?.carrier ? ` com ${esc(s.carrier)}` : ""}.</p>
      ${code ? `<p>Código de seguimento: <strong>${esc(code)}</strong></p>` : ""}
      ${button(track, code ? "Seguir a encomenda" : "Ver a encomenda")}
      <p style="color:#5b6780;font-size:13px">Se o tamanho não servir, pode pedir a troca na <a href="${orderUrl}" style="color:#0f6e63">página da encomenda</a>.</p>`, site) };
  }
  const simple: Record<string, [string, string, string]> = {
    encomenda_paga: [`Pagamento da encomenda #${o.number} confirmado`, "Pagamento confirmado",
      `Confirmámos o pagamento da sua encomenda <strong>#${o.number}</strong> (${euro(o.total_cents)}). Vamos prepará-la e avisamos assim que sair do armazém. A fatura segue num email à parte.`],
    encomenda_preparacao: [`Encomenda #${o.number} em preparação`, "Em preparação",
      `A sua encomenda <strong>#${o.number}</strong> está a ser preparada no armazém. Avisamos com o código de seguimento assim que for enviada.`],
    encomenda_entregue: [`Encomenda #${o.number} entregue`, "Entregue",
      `A sua encomenda <strong>#${o.number}</strong> foi entregue. Se o tamanho não servir, tem ${LEGAL.return_days ?? 15} dias para pedir a troca ou a devolução na página da encomenda.`],
    encomenda_cancelada: [`Encomenda #${o.number} cancelada`, "Cancelada",
      `A sua encomenda <strong>#${o.number}</strong> foi cancelada. Se já tinha pago, o reembolso é feito pelo mesmo meio de pagamento. Se não pediu este cancelamento, responda a este email.`],
    encomenda_reembolsada: [`Reembolso da encomenda #${o.number}`, "Reembolsada",
      `Processámos o reembolso da sua encomenda <strong>#${o.number}</strong>. Pode demorar alguns dias úteis a aparecer na sua conta, conforme o banco.`],
  };
  if (simple[kind]) {
    const [subject, title, text] = simple[kind];
    return { subject, html: layout(title, `${hi}<p>${text}</p>${button(orderUrl, "Ver a encomenda")}`, site) };
  }
  // avaliacao
  const rate = (n: number) => `${site}/avaliar/${o.number}?t=${o.public_token}&nota=${n}`;
  const stars = [1, 2, 3, 4, 5].map((n) =>
    `<a href="${rate(n)}" style="display:inline-block;text-decoration:none;font-size:30px;color:#f5a623;padding:0 3px" title="${n} estrela${n > 1 ? "s" : ""}">&#9733;</a>`).join("");
  return { subject: `Como correu a sua encomenda #${o.number}?`, html: layout("Como correu?", `${hi}
    <p>A sua encomenda <strong>#${o.number}</strong> foi entregue. Esperamos que esteja tudo a seu gosto!</p>
    <p><strong>Como foi a experiência de compra?</strong> Toque nas estrelas:</p>
    <p style="margin:10px 0 18px">${stars}</p>
    <p>Tem alguma sugestão para melhorarmos? Pode deixá-la na mesma página, juntamente com a sua opinião sobre os produtos. Leva menos de um minuto e ajuda outros profissionais de saúde a escolher.</p>
    ${button(rate(0).replace("&nota=0", ""), "Dar a minha opinião")}
    <p style="color:#5b6780;font-size:13px">Se algo não correu bem, responda a este email: lemos todas as mensagens.</p>`, site) };
}

async function send(to: string, subject: string, html: string, cfg: Row) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: cfg.from || "iNurse <info@inurse.pt>", to: [to], reply_to: cfg.reply_to || "info@inurse.pt", subject, html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

async function due(cfg: Row) {
  const now = new Date().toISOString();
  const rows = ((await rest(`email_outbox?status=eq.pending&send_after=lte.${now}&select=*&order=send_after&limit=20`)) ?? []) as Row[];
  const since = cfg.active_since ? new Date(cfg.active_since).getTime() : Infinity;
  const out = [];
  for (const e of rows) {
    const patch = (p: Row) => rest(`email_outbox?id=eq.${e.id}`, { method: "PATCH", body: JSON.stringify(p) });
    // emails anteriores à ativação, ou de tipos desligados, não são enviados
    if (new Date(e.created_at).getTime() < since || cfg.kinds?.[e.kind] === false) { await patch({ status: "skipped" }); continue; }
    try {
      const o = await one(`orders?id=eq.${e.order_id}&select=*`);
      if (!o) { await patch({ status: "skipped", error: "encomenda apagada" }); continue; }
      if (e.kind === "avaliacao" && o.status !== "delivered") { await patch({ status: "skipped", error: "encomenda já não está entregue" }); continue; }
      const m = await render(e.kind, o, cfg);
      await send(e.to_email, m.subject, m.html, cfg);
      await patch({ status: "sent", sent_at: new Date().toISOString(), attempts: (e.attempts ?? 0) + 1, error: null });
      await rest("order_events", { method: "POST", body: JSON.stringify({ order_id: o.id, kind: "nota", message: `Email enviado ao cliente: ${m.subject}` }) }).catch(() => null);
      out.push({ id: e.id, sent: true });
    } catch (err) {
      const attempts = (e.attempts ?? 0) + 1;
      await patch({ attempts, error: String((err as Error).message).slice(0, 400), status: attempts >= 3 ? "error" : "pending",
                    send_after: new Date(Date.now() + attempts * 30 * 60e3).toISOString() });
      out.push({ id: e.id, error: String((err as Error).message) });
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const given = req.headers.get("x-cron-secret") ?? "";
    let cron = false;
    if (given) {
      const c = await one("settings?key=eq.cron&select=value");
      cron = !!c?.value?.secret && given === c.value.secret;
    }
    if (!cron) {
      const chk = await fetch(`${SB}/rest/v1/rpc/is_admin`, { method: "POST", headers: { apikey: ANON, Authorization: req.headers.get("Authorization") ?? "", "Content-Type": "application/json" }, body: "{}" });
      if (!chk.ok || (await chk.json()) !== true) return json({ error: "sem permissão" }, 401);
    }
    const cfg = ((await one("settings?key=eq.email&select=value"))?.value ?? {}) as Row;
    LEGAL = ((await one("settings?key=eq.public.store&select=value"))?.value ?? {}) as Row;
    if (!RESEND) return json(cron ? { skipped: true } : { error: "Falta a chave RESEND_API_KEY nos segredos das Edge Functions do Supabase." }, cron ? 200 : 400);
    if (body.mode === "due") {
      if (!cfg.enabled) return json({ skipped: true });
      return json({ done: await due(cfg) });
    }
    if (body.mode === "test") {
      const to = String(body.to ?? "").trim();
      if (!/^\S+@\S+\.\S+$/.test(to)) return json({ error: "Indique um email válido." }, 400);
      const o = await one("orders?select=*&order=created_at.desc&limit=1");
      if (!o) return json({ error: "Ainda não há encomendas para usar como exemplo." }, 400);
      const kinds = ["encomenda_recebida", "encomenda_paga", "encomenda_preparacao", "encomenda_enviada", "encomenda_entregue", "encomenda_cancelada", "encomenda_reembolsada", "avaliacao"];
      for (const k of (body.kind ? [String(body.kind)] : kinds)) {
        const m = await render(k, o, cfg);
        await send(to, `[Exemplo] ${m.subject}`, m.html, cfg);
      }
      return json({ sent: body.kind ? 1 : kinds.length });
    }
    return json({ error: "pedido inválido" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
