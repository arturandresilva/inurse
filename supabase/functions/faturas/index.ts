// Faturação no InvoiceXpress: cria a fatura-recibo da encomenda paga, finaliza-a, guarda o PDF e envia-a ao cliente.
//  POST {order_id}         — backoffice (sessão de administrador): emite agora (ou repete se falhou)
//  POST {order_id, email}  — backoffice: volta a enviar a fatura ao cliente
//  POST {mode:"due"}       — agendador (cabeçalho x-cron-secret): fatura as encomendas pagas que ainda não têm fatura
//  GET  ?f=<id>&t=<chave>  — abre o PDF (link usado na área de cliente; a chave é única por fatura)
// A chave da API fica nos segredos das Edge Functions: INVOICEXPRESS_API_KEY.
const SB = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const IX_KEY = Deno.env.get("INVOICEXPRESS_API_KEY") ?? "";
const PUBLIC_URL = Deno.env.get("FATURAS_PUBLIC_URL") ?? `${SB}/functions/v1/faturas`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
async function rest(path: string, init: RequestInit = {}): Promise<Row[] | Row | null> {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...svc, Prefer: "return=representation", ...(init.headers ?? {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path.split("?")[0]}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
const rpc = (fn: string, args: Row = {}) => rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
const event = (order_id: string, message: string) =>
  rest("order_events", { method: "POST", body: JSON.stringify({ order_id, kind: "fatura", message }) }).catch(() => null);
const patchInvoice = (id: string, p: Row) =>
  rest(`invoices?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ...p, updated_at: new Date().toISOString() }) });

async function settings(): Promise<Row> {
  const [s] = ((await rest("settings?key=eq.invoicing&select=value")) ?? []) as Row[];
  return s?.value ?? {};
}

// ---------- InvoiceXpress ----------
const normAccount = (a: unknown) => String(a ?? "").trim().replace(/^https?:\/\//, "").replace(/\.app\.invoicexpress\.com.*$/, "");
function ix(account: string) {
  const base = `https://${account}.app.invoicexpress.com`;
  const call = async (method: string, path: string, body?: unknown, okEmpty = false) => {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`${base}${path}${sep}api_key=${encodeURIComponent(IX_KEY)}`, {
      method, headers: { accept: "application/json", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    });
    const t = await r.text();
    if (r.status === 401) throw new Error("O InvoiceXpress recusou a chave da API (confirma INVOICEXPRESS_API_KEY e o nome da conta).");
    if (r.status === 404) throw new Error(`O InvoiceXpress não encontrou ${path.split("?")[0]} (confirma o nome da conta).`);
    if (!r.ok) throw new Error(`InvoiceXpress ${r.status}: ${t.slice(0, 400) || "parâmetros inválidos"}`);
    return { status: r.status, body: t ? JSON.parse(t) : (okEmpty ? {} : null) };
  };
  // as respostas vêm dentro de "invoice" ou "invoice_receipt" consoante o tipo; aceitamos as duas
  const doc = (b: Row | null): Row => (b?.invoice ?? b?.invoice_receipt ?? (b ? Object.values(b)[0] : null) ?? {}) as Row;
  return { call, doc };
}

async function emit(orderId: string, opts: { force?: boolean } = {}): Promise<Row> {
  const cfg = await settings();
  if (!IX_KEY) return { skipped: true, reason: "Falta a chave da API do InvoiceXpress: guarda-a nos segredos das Edge Functions do Supabase com o nome INVOICEXPRESS_API_KEY." };
  const account = normAccount(cfg.account);
  if (!account) return { skipped: true, reason: "Falta o nome da conta InvoiceXpress em Configurações → Faturação." };
  const api = ix(account);

  const existing = ((await rest(`invoices?order_id=eq.${orderId}&kind=eq.fatura-recibo&select=*&order=created_at.desc`)) ?? []) as Row[];
  const fin = existing.find((i) => i.status === "final");
  if (fin?.storage_path) return { invoice: fin, already: true };
  let inv = fin ?? existing.find((i) => i.status === "pending");
  if (inv && inv.status === "pending" && !opts.force && Date.now() - new Date(inv.updated_at).getTime() < 2 * 60e3) {
    return { skipped: true, reason: "A fatura desta encomenda está a ser emitida neste momento." };
  }

  const payload = (await rpc("invoice_payload", { p_order: orderId })) as Row;
  const { expected_total_cents, order_number, ...doc } = payload;
  if (!doc.sequence_id) delete doc.sequence_id;

  if (!inv) {
    const prevErr = existing.find((i) => i.status === "error");
    if (prevErr) { await patchInvoice(prevErr.id, { status: "pending", error: null, attempts: (prevErr.attempts ?? 0) + 1 }); inv = { ...prevErr, status: "pending" }; }
    else [inv] = (await rest("invoices", { method: "POST", body: JSON.stringify({ order_id: orderId, status: "pending", attempts: 1 }) })) as Row[];
  } else if (inv.status === "pending") {
    await patchInvoice(inv.id, { attempts: (inv.attempts ?? 0) + 1 });
  }

  try {
    // 1) criar (o proprietary_uid evita duplicados se repetirmos)
    if (!inv.external_id) {
      let created;
      try {
        created = await api.call("POST", "/invoice_receipts.json", { invoice: doc, proprietary_uid: `inurse-${orderId}` });
      } catch (e) {
        if (!String(e).includes(" 422")) throw e;
        created = await api.call("POST", "/invoice_receipts.json", { invoice_receipt: doc, proprietary_uid: `inurse-${orderId}` });
      }
      const d = api.doc(created.body);
      if (!d.id) throw new Error("O InvoiceXpress não devolveu o número interno do documento.");
      inv.external_id = String(d.id);
      await patchInvoice(inv.id, { external_id: inv.external_id });
    }
    // 2) finalizar (já final → seguimos)
    if (inv.status !== "final") {
      try {
        await api.call("PUT", `/invoice_receipts/${inv.external_id}/change-state.json`, { invoice: { state: "finalized" } }, true);
      } catch (e) {
        const cur = api.doc((await api.call("GET", `/invoice_receipts/${inv.external_id}.json`)).body);
        if (cur.status !== "final" && cur.status !== "settled") throw e;
      }
      const d = api.doc((await api.call("GET", `/invoice_receipts/${inv.external_id}.json`)).body);
      const total = Math.round(Number(d.total ?? 0) * 100);
      const number = d.sequence_number ? `FR ${d.inverted_sequence_number ?? d.sequence_number}` : null;
      await patchInvoice(inv.id, { status: "final", number, permalink: d.permalink ?? null, total_cents: total || null, error: null });
      inv = { ...inv, status: "final", number, permalink: d.permalink, total_cents: total };
      await event(orderId, `Fatura-recibo ${number ?? ""} emitida no InvoiceXpress (${(total / 100).toFixed(2).replace(".", ",")} €)`);
      if (total && Math.abs(total - expected_total_cents) > 1) {
        await event(orderId, `Atenção: a fatura soma ${(total / 100).toFixed(2)} € e a encomenda ${(expected_total_cents / 100).toFixed(2)} €. Confirma no InvoiceXpress.`);
      }
    }
    // 3) PDF: o InvoiceXpress gera-o em segundo plano (202 até estar pronto)
    let pdfUrl = "";
    for (let i = 0; i < 8 && !pdfUrl; i++) {
      const r = await api.call("GET", `/api/pdf/${inv.external_id}.json`, undefined, true);
      if (r.status === 200 && r.body?.output?.pdfUrl) pdfUrl = r.body.output.pdfUrl;
      else await sleep(1500 + i * 500);
    }
    if (!pdfUrl) {
      await patchInvoice(inv.id, { error: "PDF ainda não estava pronto; o agendador tenta de novo." });
      return { invoice: inv, pdf: false };
    }
    const pdf = await fetch(pdfUrl);
    if (!pdf.ok) throw new Error(`Não consegui descarregar o PDF da fatura (${pdf.status}).`);
    const path = `${orderId}/${(inv.number ?? inv.external_id).replace(/[^\w.-]+/g, "_")}.pdf`;
    const up = await fetch(`${SB}/storage/v1/object/faturas/${path}`, {
      method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/pdf", "x-upsert": "true" }, body: await pdf.arrayBuffer(),
    });
    if (!up.ok) throw new Error(`Não consegui guardar o PDF: ${(await up.text()).slice(0, 200)}`);
    const link = `${PUBLIC_URL}?f=${inv.id}&t=${inv.access_token}`;
    await patchInvoice(inv.id, { storage_path: path, pdf_url: link, error: null });
    inv = { ...inv, storage_path: path, pdf_url: link };
    // 4) enviar ao cliente pelo InvoiceXpress
    if (cfg.send_email !== false) await sendEmail(orderId, inv, order_number, api);
    return { invoice: inv };
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await patchInvoice(inv.id, { status: inv.status === "final" ? "final" : "error", error: msg });
    await event(orderId, `Fatura não emitida: ${msg}`);
    throw new Error(msg);
  }
}

async function sendEmail(orderId: string, inv: Row, orderNumber: number | undefined, api?: ReturnType<typeof ix>) {
  if (!api) {
    const cfg = await settings();
    api = ix(normAccount(cfg.account));
  }
  const [o] = (await rest(`orders?id=eq.${orderId}&select=email,number,shipping_address`)) as Row[];
  const nome = String(o.shipping_address?.name ?? "").split(" ")[0];
  await api.call("PUT", `/invoice_receipts/${inv.external_id}/email-document.json`, {
    message: {
      client: { email: o.email, save: "0" },
      subject: `iNurse — fatura da encomenda #${orderNumber ?? o.number}`,
      body: `Olá${nome ? " " + nome : ""},\n\nObrigado pela sua compra na iNurse. Segue em anexo a fatura-recibo da encomenda #${orderNumber ?? o.number}.\n\nPode acompanhar a encomenda e consultar as faturas na sua conta em inurse.pt.\n\nCom os melhores cumprimentos,\niNurse`,
      logo: "1",
    },
  }, true);
  await patchInvoice(inv.id, { sent_to: o.email });
  await event(orderId, `Fatura enviada por email para ${o.email}`);
}

async function servePdf(id: string, token: string) {
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{32,80}$/.test(token)) return new Response("Ligação inválida.", { status: 404 });
  const [inv] = ((await rest(`invoices?id=eq.${id}&access_token=eq.${token}&select=storage_path,number`)) ?? []) as Row[];
  if (!inv?.storage_path) return new Response("Fatura não encontrada.", { status: 404 });
  const f = await fetch(`${SB}/storage/v1/object/faturas/${inv.storage_path}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  if (!f.ok) return new Response("Fatura indisponível de momento.", { status: 502 });
  const name = `iNurse-${String(inv.number ?? "fatura").replace(/[^\w.-]+/g, "_")}.pdf`;
  return new Response(f.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "private, max-age=3600" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method === "GET") {
      const u = new URL(req.url);
      return await servePdf(u.searchParams.get("f") ?? "", u.searchParams.get("t") ?? "");
    }
    const body = await req.json().catch(() => ({}));
    const given = req.headers.get("x-cron-secret") ?? "";
    let cron = false;
    if (given) {
      const [c] = ((await rest("settings?key=eq.cron&select=value")) ?? []) as Row[];
      cron = !!c?.value?.secret && given === c.value.secret;
    }
    if (!cron) {
      const chk = await fetch(`${SB}/rest/v1/rpc/is_admin`, { method: "POST", headers: { apikey: ANON, Authorization: req.headers.get("Authorization") ?? "", "Content-Type": "application/json" }, body: "{}" });
      if (!chk.ok || (await chk.json()) !== true) return json({ error: "sem permissão" }, 401);
    }

    if (body.mode === "due") {
      const cfg = await settings();
      if (!IX_KEY || !cfg.account || cfg.auto_invoice === false) return json({ skipped: true });
      const ids = ((await rpc("orders_to_invoice", { p_limit: 5 })) ?? []) as (string | Row)[];
      // faturas emitidas mas cujo PDF ainda não tinha ficado pronto
      const noPdf = ((await rest("invoices?status=eq.final&storage_path=is.null&select=order_id&limit=5")) ?? []) as Row[];
      const todo = [...new Set([...ids.map((x) => (typeof x === "string" ? x : Object.values(x)[0] as string)), ...noPdf.map((r) => r.order_id)])];
      const out = [];
      for (const id of todo) {
        try { out.push({ id, ...(await emit(id)) }); } catch (e) { out.push({ id, error: String((e as Error).message) }); }
      }
      return json({ done: out });
    }
    if (body.mode === "check") {
      // testar a ligação: lista as séries da conta (para escolher a série das faturas)
      if (!IX_KEY) return json({ error: "Falta a chave INVOICEXPRESS_API_KEY nos segredos das Edge Functions do Supabase." }, 400);
      const account = normAccount((await settings()).account);
      if (!account) return json({ error: "Indica primeiro o nome da conta e guarda." }, 400);
      const r = await ix(account).call("GET", "/sequences.json");
      const list = (r.body?.sequences ?? []) as Row[];
      return json({ ok: true, account, sequences: list.map((q) => ({ id: q.id, serie: q.serie, default: String(q.default_sequence) === "1" || q.default_sequence === true })) });
    }
    if (!body.order_id) return json({ error: "falta a encomenda" }, 400);
    if (body.email) {
      const [inv] = ((await rest(`invoices?order_id=eq.${body.order_id}&status=eq.final&select=*`)) ?? []) as Row[];
      if (!inv) return json({ error: "Esta encomenda ainda não tem fatura emitida." }, 400);
      await sendEmail(body.order_id, inv, undefined);
      return json({ sent: true });
    }
    return json(await emit(String(body.order_id), { force: !!body.force }));
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
