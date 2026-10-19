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
const first = (n: unknown) => String(n ?? "").trim().split(/\s+/)[0] ?? "";

// ---------- modelo base ----------
let LEGAL: Row = {};
const phone = (p: unknown) => String(p ?? "").replace(/\D/g, "").replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
function layout(title: string, inner: string, site: string) {
  const L = { legal_name: "Artur Silva", nif: "226720462", address: "Praça 20 de Maio", zip: "4590-182", city: "Paços de Ferreira", email: "info@inurse.pt", phone: "918889008", ...Object.fromEntries(Object.entries(LEGAL).filter(([, v]) => v)) };
  return `<!doctype html><html lang="${LANG}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f2f5f7;font-family:Arial,Helvetica,sans-serif;color:#1c2a4a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="padding:22px 28px;border-bottom:1px solid #e3e9ee"><a href="${site}" style="text-decoration:none;font:700 24px Arial,sans-serif;letter-spacing:2px;color:#2EB3EA"><span style="color:#E8323C">&#10084;</span>iNURSE</a></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.55">${inner}</td></tr>
<tr><td style="padding:18px 28px;background:#1c2a4a;color:#cfd8e3;font-size:12px;line-height:1.5">
iNurse · ${tx("foot")} · <a href="mailto:${esc(L.email)}" style="color:#fff">${esc(L.email)}</a> · ${esc(phone(L.phone))}<br>
${esc(L.legal_name)}, NIF ${esc(L.nif)}, ${esc(L.address)}, ${esc(L.zip)} ${esc(L.city)}</td></tr>
</table></td></tr></table></body></html>`;
}
const button = (href: string, label: string) =>
  `<p style="margin:22px 0"><a href="${href}" style="display:inline-block;background:#0f6e63;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:12px">${esc(label)}</a></p>`;


// ---------- textos dos emails, por língua (a encomenda guarda a língua do cliente) ----------
type Lang = "pt" | "en" | "es" | "fr";
const TX: Record<Lang, Record<string, string>> = {
  pt: {
    hi: "Olá{n},", view: "Ver a encomenda", size: "Tamanho", units: "un.", shipping: "Portes", discount: "Desconto", total: "Total",
    rec_s: "Encomenda #{o} recebida", rec_t: "Obrigado pela sua encomenda na iNurse. Recebemos a encomenda <strong>#{o}</strong>:",
    tr_h: "Pagamento por transferência bancária", tr_b: "Indique a referência <strong>#{o}</strong> no descritivo. A encomenda segue assim que o pagamento for confirmado.",
    pay_other: "Siga as instruções de pagamento na página da encomenda. A encomenda segue assim que o pagamento for confirmado.",
    rec_f: "Tem {d} dias depois de receber para trocar ou devolver. A fatura é enviada por email assim que o pagamento for confirmado.",
    sh_s: "A encomenda #{o} está a caminho", sh_t: "Boas notícias: a sua encomenda <strong>#{o}</strong> já saiu do armazém{c}.", with: " com {c}",
    track_code: "Código de seguimento", track: "Seguir a encomenda", sh_f: "Se o tamanho não servir, pode pedir a troca na página da encomenda.",
    paid_s: "Pagamento da encomenda #{o} confirmado", paid_t: "Confirmámos o pagamento da sua encomenda <strong>#{o}</strong> ({v}). Vamos prepará-la e avisamos assim que sair do armazém. A fatura segue num email à parte.",
    prep_s: "Encomenda #{o} em preparação", prep_t: "A sua encomenda <strong>#{o}</strong> está a ser preparada no armazém. Avisamos com o código de seguimento assim que for enviada.",
    del_s: "Encomenda #{o} entregue", del_t: "A sua encomenda <strong>#{o}</strong> foi entregue. Se o tamanho não servir, tem {d} dias para pedir a troca ou a devolução na página da encomenda.",
    can_s: "Encomenda #{o} cancelada", can_t: "A sua encomenda <strong>#{o}</strong> foi cancelada. Se já tinha pago, o reembolso é feito pelo mesmo meio de pagamento. Se não pediu este cancelamento, responda a este email.",
    ref_s: "Reembolso da encomenda #{o}", ref_t: "Processámos o reembolso da sua encomenda <strong>#{o}</strong>. Pode demorar alguns dias úteis a aparecer na sua conta, conforme o banco.",
    rv_s: "Como correu a sua encomenda #{o}?", rv_t: "A sua encomenda <strong>#{o}</strong> foi entregue. Esperamos que esteja tudo a seu gosto!",
    rv_q: "Como foi a experiência de compra? Toque nas estrelas:", rv_sug: "Tem alguma sugestão para melhorarmos? Pode deixá-la na mesma página, juntamente com a sua opinião sobre os produtos. Leva menos de um minuto e ajuda outros profissionais de saúde a escolher.",
    rv_btn: "Dar a minha opinião", rv_f: "Se algo não correu bem, responda a este email: lemos todas as mensagens.",
    foot: "calçado profissional e meias de descanso",
  },
  en: {
    hi: "Hello{n},", view: "View your order", size: "Size", units: "pcs", shipping: "Shipping", discount: "Discount", total: "Total",
    rec_s: "Order #{o} received", rec_t: "Thank you for shopping at iNurse. We have received order <strong>#{o}</strong>:",
    tr_h: "Payment by bank transfer", tr_b: "Please quote reference <strong>#{o}</strong> in the transfer description. We ship as soon as the payment is confirmed.",
    pay_other: "Please follow the payment instructions on your order page. We ship as soon as the payment is confirmed.",
    rec_f: "You have {d} days after delivery to exchange or return. The invoice is emailed once the payment is confirmed.",
    sh_s: "Order #{o} is on its way", sh_t: "Good news: your order <strong>#{o}</strong> has left the warehouse{c}.", with: " with {c}",
    track_code: "Tracking code", track: "Track your order", sh_f: "If the size isn't right, you can request an exchange on your order page.",
    paid_s: "Payment for order #{o} confirmed", paid_t: "We have confirmed the payment for your order <strong>#{o}</strong> ({v}). We will prepare it and let you know as soon as it ships. The invoice follows in a separate email.",
    prep_s: "Order #{o} is being prepared", prep_t: "Your order <strong>#{o}</strong> is being prepared at the warehouse. We will send you the tracking code as soon as it ships.",
    del_s: "Order #{o} delivered", del_t: "Your order <strong>#{o}</strong> has been delivered. If the size isn't right, you have {d} days to request an exchange or return on your order page.",
    can_s: "Order #{o} cancelled", can_t: "Your order <strong>#{o}</strong> has been cancelled. If you had already paid, the refund is made to the same payment method. If you did not request this, please reply to this email.",
    ref_s: "Refund for order #{o}", ref_t: "We have processed the refund for your order <strong>#{o}</strong>. It may take a few working days to appear in your account, depending on your bank.",
    rv_s: "How did your order #{o} go?", rv_t: "Your order <strong>#{o}</strong> has been delivered. We hope you are happy with it!",
    rv_q: "How was your shopping experience? Tap the stars:", rv_sug: "Any suggestions for us? You can leave them on the same page, together with your opinion of the products. It takes less than a minute and helps other healthcare professionals choose.",
    rv_btn: "Give my feedback", rv_f: "If something went wrong, just reply to this email: we read every message.",
    foot: "professional footwear and rest socks",
  },
  es: {
    hi: "Hola{n}:", view: "Ver el pedido", size: "Talla", units: "ud.", shipping: "Envío", discount: "Descuento", total: "Total",
    rec_s: "Pedido #{o} recibido", rec_t: "Gracias por tu compra en iNurse. Hemos recibido el pedido <strong>#{o}</strong>:",
    tr_h: "Pago por transferencia bancaria", tr_b: "Indica la referencia <strong>#{o}</strong> en el concepto. Enviamos el pedido en cuanto se confirme el pago.",
    pay_other: "Sigue las instrucciones de pago en la página del pedido. Enviamos el pedido en cuanto se confirme el pago.",
    rec_f: "Tienes {d} días desde la recepción para cambiar o devolver. La factura se envía por email cuando se confirma el pago.",
    sh_s: "Tu pedido #{o} está en camino", sh_t: "Buenas noticias: tu pedido <strong>#{o}</strong> ya ha salido del almacén{c}.", with: " con {c}",
    track_code: "Código de seguimiento", track: "Seguir el pedido", sh_f: "Si la talla no te sirve, puedes pedir el cambio en la página del pedido.",
    paid_s: "Pago del pedido #{o} confirmado", paid_t: "Hemos confirmado el pago de tu pedido <strong>#{o}</strong> ({v}). Lo preparamos y te avisamos en cuanto salga del almacén. La factura llega en un email aparte.",
    prep_s: "Pedido #{o} en preparación", prep_t: "Tu pedido <strong>#{o}</strong> se está preparando en el almacén. Te enviaremos el código de seguimiento en cuanto salga.",
    del_s: "Pedido #{o} entregado", del_t: "Tu pedido <strong>#{o}</strong> ha sido entregado. Si la talla no te sirve, tienes {d} días para pedir el cambio o la devolución en la página del pedido.",
    can_s: "Pedido #{o} cancelado", can_t: "Tu pedido <strong>#{o}</strong> ha sido cancelado. Si ya habías pagado, el reembolso se hace por el mismo medio de pago. Si no lo has pedido tú, responde a este email.",
    ref_s: "Reembolso del pedido #{o}", ref_t: "Hemos procesado el reembolso de tu pedido <strong>#{o}</strong>. Puede tardar unos días hábiles en aparecer en tu cuenta, según el banco.",
    rv_s: "¿Qué tal tu pedido #{o}?", rv_t: "Tu pedido <strong>#{o}</strong> ha sido entregado. ¡Esperamos que te guste!",
    rv_q: "¿Cómo fue tu experiencia de compra? Toca las estrellas:", rv_sug: "¿Tienes alguna sugerencia? Puedes dejarla en la misma página, junto con tu opinión sobre los productos. Lleva menos de un minuto y ayuda a otros profesionales sanitarios a elegir.",
    rv_btn: "Dar mi opinión", rv_f: "Si algo no ha ido bien, responde a este email: leemos todos los mensajes.",
    foot: "calzado profesional y medias de descanso",
  },
  fr: {
    hi: "Bonjour{n},", view: "Voir la commande", size: "Pointure", units: "pce", shipping: "Livraison", discount: "Remise", total: "Total",
    rec_s: "Commande #{o} reçue", rec_t: "Merci pour votre commande chez iNurse. Nous avons bien reçu la commande <strong>#{o}</strong> :",
    tr_h: "Paiement par virement bancaire", tr_b: "Indiquez la référence <strong>#{o}</strong> dans le libellé. Nous expédions dès que le paiement est confirmé.",
    pay_other: "Suivez les instructions de paiement sur la page de la commande. Nous expédions dès que le paiement est confirmé.",
    rec_f: "Vous disposez de {d} jours après réception pour échanger ou retourner. La facture est envoyée par email dès confirmation du paiement.",
    sh_s: "La commande #{o} est en route", sh_t: "Bonne nouvelle : votre commande <strong>#{o}</strong> a quitté l’entrepôt{c}.", with: " avec {c}",
    track_code: "Numéro de suivi", track: "Suivre la commande", sh_f: "Si la pointure ne convient pas, vous pouvez demander un échange sur la page de la commande.",
    paid_s: "Paiement de la commande #{o} confirmé", paid_t: "Nous avons confirmé le paiement de votre commande <strong>#{o}</strong> ({v}). Nous la préparons et vous prévenons dès son expédition. La facture suit dans un email séparé.",
    prep_s: "Commande #{o} en préparation", prep_t: "Votre commande <strong>#{o}</strong> est en préparation à l’entrepôt. Nous vous enverrons le numéro de suivi dès l’expédition.",
    del_s: "Commande #{o} livrée", del_t: "Votre commande <strong>#{o}</strong> a été livrée. Si la pointure ne convient pas, vous avez {d} jours pour demander un échange ou un retour sur la page de la commande.",
    can_s: "Commande #{o} annulée", can_t: "Votre commande <strong>#{o}</strong> a été annulée. Si vous aviez déjà payé, le remboursement est effectué par le même moyen de paiement. Si vous n’avez pas demandé cette annulation, répondez à cet email.",
    ref_s: "Remboursement de la commande #{o}", ref_t: "Nous avons effectué le remboursement de votre commande <strong>#{o}</strong>. Il peut apparaître sur votre compte sous quelques jours ouvrés, selon votre banque.",
    rv_s: "Comment s’est passée votre commande #{o} ?", rv_t: "Votre commande <strong>#{o}</strong> a été livrée. Nous espérons qu’elle vous plaît !",
    rv_q: "Comment s’est passée votre expérience d’achat ? Touchez les étoiles :", rv_sug: "Une suggestion pour nous améliorer ? Vous pouvez la laisser sur la même page, avec votre avis sur les produits. Cela prend moins d’une minute et aide d’autres professionnels de santé à choisir.",
    rv_btn: "Donner mon avis", rv_f: "Si quelque chose ne s’est pas bien passé, répondez à cet email : nous lisons tous les messages.",
    foot: "chaussures professionnelles et chaussettes de repos",
  },
};
let LANG: Lang = "pt";
const tx = (k: string, v: Record<string, string | number> = {}) =>
  Object.entries(v).reduce((s, [a, b]) => s.split(`{${a}}`).join(String(b)), TX[LANG][k] ?? TX.pt[k] ?? k);
const money = (c: number) => (c / 100).toLocaleString({ pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" }[LANG], { style: "currency", currency: "EUR" });

async function render(kind: string, o: Row, cfg: Row): Promise<{ subject: string; html: string }> {
  LANG = (["pt", "en", "es", "fr"].includes(o.locale) ? o.locale : "pt") as Lang;
  const site = String(cfg.site_url || "https://www.inurse.pt").replace(/\/$/, "");
  const q = LANG === "pt" ? "" : `&lang=${LANG}`;
  const orderUrl = `${site}/encomenda/${o.number}?t=${o.public_token}${q}`;
  const name = first(o.shipping_address?.name);
  const days = LEGAL.return_days ?? 15;
  const hi = `<p style="margin:0 0 14px">${tx("hi", { n: name ? " " + esc(name) : "" })}</p>`;
  const N = { o: o.number };
  if (kind === "encomenda_recebida") {
    const items = ((await rest(`order_items?order_id=eq.${o.id}&select=title,option_value,quantity,unit_price_cents&order=title`)) ?? []) as Row[];
    const pay = await one("settings?key=eq.public.payments&select=value");
    const transfer = o.payment_method === "transfer"
      ? `<div style="background:#e4f2ec;border-radius:12px;padding:14px 16px;margin:16px 0"><strong>${tx("tr_h")}</strong><br>
         IBAN: <strong>${esc(pay?.value?.iban ?? "")}</strong><br>${tx("total")}: <strong>${money(o.total_cents)}</strong><br>${tx("tr_b", N)}</div>`
      : `<p>${tx("pay_other")}</p>`;
    const rows = items.map((i) =>
      `<tr><td style="padding:10px 0;border-bottom:1px solid #e3e9ee">${esc(i.title)}<br><span style="color:#5b6780;font-size:13px">${tx("size")} ${esc(i.option_value)} · ${i.quantity} ${tx("units")}</span></td>
       <td align="right" style="padding:10px 0;border-bottom:1px solid #e3e9ee;white-space:nowrap">${money(i.unit_price_cents * i.quantity)}</td></tr>`).join("");
    return { subject: tx("rec_s", N), html: layout(tx("rec_s", N), `${hi}
      <p>${tx("rec_t", N)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e3e9ee;margin:14px 0">${rows}</table>
      <p style="text-align:right;margin:0">${tx("shipping")}: ${money(o.shipping_cents)}${o.discount_cents ? ` · ${tx("discount")}: −${money(o.discount_cents)}` : ""}<br><strong style="font-size:17px">${tx("total")}: ${money(o.total_cents)}</strong></p>
      ${transfer}${button(orderUrl, tx("view"))}
      <p style="color:#5b6780;font-size:13px">${tx("rec_f", { d: days })}</p>`, site) };
  }
  if (kind === "encomenda_enviada") {
    const s = await one(`shipments?order_id=eq.${o.id}&select=carrier,tracking_code&order=shipped_at.desc&limit=1`);
    const code = s?.tracking_code;
    const track = code ? `https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=${encodeURIComponent(code)}` : orderUrl;
    return { subject: tx("sh_s", N), html: layout(tx("sh_s", N), `${hi}
      <p>${tx("sh_t", { ...N, c: s?.carrier ? tx("with", { c: esc(s.carrier) }) : "" })}</p>
      ${code ? `<p>${tx("track_code")}: <strong>${esc(code)}</strong></p>` : ""}
      ${button(track, code ? tx("track") : tx("view"))}
      <p style="color:#5b6780;font-size:13px"><a href="${orderUrl}" style="color:#0f6e63">${tx("sh_f")}</a></p>`, site) };
  }
  const simple: Record<string, [string, string]> = {
    encomenda_paga: ["paid_s", "paid_t"], encomenda_preparacao: ["prep_s", "prep_t"], encomenda_entregue: ["del_s", "del_t"],
    encomenda_cancelada: ["can_s", "can_t"], encomenda_reembolsada: ["ref_s", "ref_t"],
  };
  if (simple[kind]) {
    const [sk, bk] = simple[kind];
    return { subject: tx(sk, N), html: layout(tx(sk, N), `${hi}<p>${tx(bk, { ...N, v: money(o.total_cents), d: days })}</p>${button(orderUrl, tx("view"))}`, site) };
  }
  // avaliacao
  const rate = (n: number) => `${site}/avaliar/${o.number}?t=${o.public_token}${n ? `&nota=${n}` : ""}${q}`;
  const stars = [1, 2, 3, 4, 5].map((n) =>
    `<a href="${rate(n)}" style="display:inline-block;text-decoration:none;font-size:30px;color:#f5a623;padding:0 3px" title="${n}/5">&#9733;</a>`).join("");
  return { subject: tx("rv_s", N), html: layout(tx("rv_s", N), `${hi}
    <p>${tx("rv_t", N)}</p>
    <p><strong>${tx("rv_q")}</strong></p>
    <p style="margin:10px 0 18px">${stars}</p>
    <p>${tx("rv_sug")}</p>
    ${button(rate(0), tx("rv_btn"))}
    <p style="color:#5b6780;font-size:13px">${tx("rv_f")}</p>`, site) };
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
