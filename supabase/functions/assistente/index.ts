// Assistente de contacto do site: responde a clientes (IA) com o catálogo, portes, trocas e estado das encomendas,
// guarda a conversa e passa para uma pessoa quando é preciso.
//  POST {message, conversation_id?, token?, page?, locale?}      — mensagem do cliente → resposta
//  POST {mode:"poll", conversation_id, token, after}              — novas mensagens (respostas do Artur no backoffice)
const SB = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = "claude-haiku-5-5";
const PRICE_IN = 0.1, PRICE_OUT = 0.5; // USD por milhão de tokens

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
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
const UUID = /^[0-9a-f-]{36}$/i;

const FALLBACK: Record<string, string> = {
  pt: "Neste momento não consigo responder automaticamente. Deixe aqui o seu email e respondemos por email o quanto antes.",
  en: "I can't answer automatically right now. Leave your email here and we'll reply by email as soon as possible.",
  es: "Ahora mismo no puedo responder automáticamente. Deja aquí tu email y te responderemos por email lo antes posible.",
  fr: "Je ne peux pas répondre automatiquement pour le moment. Laissez ici votre email et nous vous répondrons par email au plus vite.",
};
const THANKS: Record<string, string> = {
  pt: "Obrigado! Já registámos a sua mensagem e respondemos para {e} o quanto antes.",
  en: "Thank you! We've received your message and will reply to {e} as soon as possible.",
  es: "¡Gracias! Hemos recibido tu mensaje y te responderemos a {e} lo antes posible.",
  fr: "Merci ! Nous avons bien reçu votre message et vous répondrons à {e} au plus vite.",
};

async function storeContext() {
  const [products, ship, store, pay] = await Promise.all([
    rest("products?status=in.(active,out_of_stock)&select=handle,title,brand,model,color,status,excerpt,vat_rate,variants(option_value,price_cents,active)&limit=2000"),
    one("settings?key=eq.public.shipping&select=value"), one("settings?key=eq.public.store&select=value"),
    one("settings?key=eq.public.payments&select=value"),
  ]);
  const groups = new Map<string, Row>();
  for (const p of (products ?? []) as Row[]) {
    const vs = (p.variants ?? []).filter((v: Row) => v.active && v.price_cents > 0);
    if (!vs.length) continue;
    const k = p.model ? `${p.brand}|${p.model}` : p.handle;
    const g = groups.get(k) ?? { modelo: p.model ?? p.title, marca: p.brand, cores: [], tamanhos: new Set(), preco_min: Infinity, link: `/produto/${p.handle}`, resumo: (p.excerpt ?? "").slice(0, 140), esgotado: true };
    if (p.color) g.cores.push(p.color);
    vs.forEach((v: Row) => { g.tamanhos.add(v.option_value); g.preco_min = Math.min(g.preco_min, v.price_cents); });
    if (p.status === "active") g.esgotado = false;
    groups.set(k, g);
  }
  const catalogo = [...groups.values()].map((g) => ({ ...g, tamanhos: [...g.tamanhos].join(", "), preco_desde: euro(g.preco_min), preco_min: undefined }));
  const s = ship?.value ?? {}; const st = store?.value ?? {}; const pv = pay?.value ?? {};
  const zones = (s.zones ?? []).map((z: Row) => `${z.region}: ${z.free_from_cents ? `grátis a partir de ${euro(z.free_from_cents)}` : ""}`).join("; ");
  const simple = s.simple?.enabled ? Object.entries(s.simple.zones ?? {}).filter(([, z]) => (z as Row).available !== false && (z as Row).weight_up_cents)
    .map(([r, z]) => `${r}: desde ${euro((z as Row).weight_up_cents)}${(z as Row).eta ? ` (${(z as Row).eta})` : ""}`).join("; ") : "";
  return {
    catalogo,
    loja: {
      envios: `Só para Portugal (Continente, Açores, Madeira) por CTT, a partir do armazém do fornecedor. ${simple ? `Portes: ${simple}.` : ""} ${zones}`,
      trocas: `${st.return_days ?? 15} dias após a receção para trocar ou devolver (livre resolução). Meias de compressão/descanso só com embalagem selada. Pedido na página da encomenda ou em /livre-resolucao.`,
      pagamentos: ["mbway", "multibanco", "transfer"].filter((k) => pv[k]).map((k) => ({ mbway: "MB WAY", multibanco: "Multibanco", transfer: "transferência bancária" }[k])).join(", "),
      contactos: `${st.email ?? "info@inurse.pt"} · ${st.phone ?? ""}`, guia_tamanhos: "/p/guia-de-tamanhos",
    },
  };
}

const TOOLS = [
  { name: "ver_encomenda", description: "Consulta o estado de uma encomenda. Pede sempre ao cliente o número da encomenda E o email usado na compra.",
    input_schema: { type: "object", properties: { numero: { type: "integer" }, email: { type: "string" } }, required: ["numero", "email"] } },
  { name: "pedir_pessoa", description: "Passa a conversa para uma pessoa da loja (quando o cliente pede, há uma reclamação, um problema com uma encomenda que não consegues resolver, ou não sabes a resposta). Pede antes o email do cliente (a resposta segue por email).",
    input_schema: { type: "object", properties: { motivo: { type: "string" }, nome: { type: "string" }, contacto: { type: "string" } }, required: ["motivo"] } },
];
const STATUS: Record<string, string> = { pending_payment: "a aguardar pagamento", paid: "paga, em preparação", processing: "em preparação", shipped: "enviada", delivered: "entregue", cancelled: "cancelada", refunded: "reembolsada" };

async function runTool(name: string, input: Row, conv: Row) {
  if (name === "ver_encomenda") {
    const o = await one(`orders?number=eq.${Number(input.numero) || 0}&select=id,number,email,status,created_at,total_cents,shipments(carrier,tracking_code,shipped_at)`);
    if (!o || String(o.email).toLowerCase().trim() !== String(input.email ?? "").toLowerCase().trim()) return { erro: "Não encontrei uma encomenda com esse número e email." };
    return { numero: o.number, estado: STATUS[o.status] ?? o.status, feita_em: String(o.created_at).slice(0, 10), total: euro(o.total_cents),
      envios: (o.shipments ?? []).map((s: Row) => ({ transportadora: s.carrier, seguimento: s.tracking_code, link: s.tracking_code ? `https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=${s.tracking_code}` : null })) };
  }
  if (name === "pedir_pessoa") {
    await rest(`chat_conversations?id=eq.${conv.id}`, { method: "PATCH", body: JSON.stringify({ status: "needs_human", unread: true,
      summary: String(input.motivo ?? "").slice(0, 300), name: input.nome ? String(input.nome).slice(0, 80) : conv.name, contact: input.contacto ? String(input.contacto).slice(0, 120) : conv.contact }) });
    return { ok: true, nota: "A conversa foi passada para a equipa; diz ao cliente que lhe respondemos por email o quanto antes." };
  }
  return { erro: "ferramenta desconhecida" };
}

async function overBudget() {
  const policy = (await one("settings?key=eq.agents&select=value"))?.value ?? {};
  const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const a = (((await rest(`agent_runs?select=cost_usd&started_at=gte.${month}`)) ?? []) as Row[]).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const c = (((await rest(`chat_conversations?select=cost_usd&last_at=gte.${month}`)) ?? []) as Row[]).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  return a + c >= Number(policy.monthly_budget_usd ?? 15);
}

async function reply(conv: Row, locale: string, page: string) {
  const history = ((await rest(`chat_messages?conversation_id=eq.${conv.id}&select=role,content&order=created_at.desc&limit=24`)) ?? []) as Row[];
  history.reverse();
  const msgs: Row[] = [];
  for (const m of history) {
    const role = m.role === "user" ? "user" : "assistant";
    const content = m.role === "staff" ? `[Resposta de uma pessoa da equipa iNurse] ${m.content}` : m.content;
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += `\n${content}`;
    else msgs.push({ role, content });
  }
  if (!msgs.length || msgs[0].role !== "user") msgs.unshift({ role: "user", content: "(início da conversa)" });
  const ctx = await storeContext();
  const lang = { pt: "português de Portugal", en: "English", es: "español", fr: "français" }[locale] ?? "português de Portugal";
  const system = `És o assistente de atendimento da iNurse, loja online portuguesa de calçado profissional (socas hospitalares, sapatos e sapatilhas de trabalho) e meias de descanso e compressão para profissionais de saúde.
Responde em ${lang} (ou na língua em que o cliente escrever), de forma curta, simpática e concreta (2–5 frases). Usa só a informação abaixo; não inventes preços, prazos, stock nem características. Quando recomendares um modelo, inclui o link relativo (ex.: /produto/...).
Para o estado de uma encomenda usa ver_encomenda (precisa do número e do email da compra). Nunca reveles dados de encomendas sem o email certo.
Se o cliente pedir para falar com uma pessoa, tiver uma reclamação, um problema que não consegues resolver ou uma pergunta a que não sabes responder com certeza, não adivinhes: diz que vamos responder por email o quanto antes, pede o email (e o nome, se quiser) e usa pedir_pessoa com o email em "contacto". Não há atendimento por WhatsApp nem por telefone no chat.
Não dês aconselhamento médico: para dúvidas clínicas sobre compressão, recomenda falar com o médico ou farmacêutico.
O cliente está na página: ${page || "/"}.
Informação da loja (JSON): ${JSON.stringify(ctx.loja)}
Catálogo (JSON): ${JSON.stringify(ctx.catalogo)}`;
  let tin = 0, tout = 0, text = "";
  for (let i = 0; i < 4; i++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system, tools: TOOLS, messages: msgs }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(`IA: ${data?.error?.message ?? r.status}`);
    tin += data.usage?.input_tokens ?? 0; tout += data.usage?.output_tokens ?? 0;
    const uses = (data.content ?? []).filter((c: Row) => c.type === "tool_use");
    text = (data.content ?? []).filter((c: Row) => c.type === "text").map((c: Row) => c.text).join("\n").trim();
    if (!uses.length || data.stop_reason !== "tool_use") break;
    msgs.push({ role: "assistant", content: data.content });
    msgs.push({ role: "user", content: await Promise.all(uses.map(async (u: Row) => ({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(await runTool(u.name, u.input ?? {}, conv)) }))) });
  }
  return { text: text || FALLBACK[locale] || FALLBACK.pt, cost: (tin * PRICE_IN + tout * PRICE_OUT) / 1e6 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const b = await req.json().catch(() => ({}));
    const locale = ["pt", "en", "es", "fr"].includes(b.locale) ? b.locale : "pt";
    let conv: Row | null = null;
    if (b.conversation_id && UUID.test(b.conversation_id) && UUID.test(String(b.token ?? ""))) {
      conv = await one(`chat_conversations?id=eq.${b.conversation_id}&token=eq.${b.token}&select=*`);
    }
    if (b.mode === "poll") {
      if (!conv) return json({ messages: [] });
      const after = typeof b.after === "string" && !isNaN(Date.parse(b.after)) ? b.after : "1970-01-01T00:00:00Z";
      const ms = ((await rest(`chat_messages?conversation_id=eq.${conv.id}&created_at=gt.${encodeURIComponent(after)}&select=role,content,created_at&order=created_at`)) ?? []) as Row[];
      return json({ messages: ms, status: conv.status });
    }
    const message = String(b.message ?? "").trim().slice(0, 800);
    if (!message) return json({ error: "mensagem vazia" }, 400);
    if (!conv) {
      [conv] = (await rest("chat_conversations", { method: "POST", body: JSON.stringify({ locale, page: String(b.page ?? "").slice(0, 200) }) })) as Row[];
    }
    if (conv!.messages >= 60) return json({ conversation_id: conv!.id, token: conv!.token, reply: FALLBACK[locale], limit: true });
    await rest("chat_messages", { method: "POST", body: JSON.stringify({ conversation_id: conv!.id, role: "user", content: message }) });
    // email escrito pelo cliente: fica como contacto da conversa (é por lá que respondemos)
    const mail = message.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0];
    if (mail && !conv!.contact) { await rest(`chat_conversations?id=eq.${conv!.id}`, { method: "PATCH", body: JSON.stringify({ contact: mail.slice(0, 120) }) }); conv!.contact = mail; }
    let out: { text: string; cost: number };
    if (!KEY || await overBudget()) {
      out = { text: conv!.contact ? (THANKS[locale] ?? THANKS.pt).replace("{e}", conv!.contact) : FALLBACK[locale], cost: 0 };
      await rest(`chat_conversations?id=eq.${conv!.id}`, { method: "PATCH", body: JSON.stringify({ status: "needs_human" }) });
    } else {
      out = await reply(conv!, locale, String(b.page ?? ""));
    }
    const [m] = (await rest("chat_messages", { method: "POST", body: JSON.stringify({ conversation_id: conv!.id, role: "assistant", content: out.text }) })) as Row[];
    const fresh = await one(`chat_conversations?id=eq.${conv!.id}&select=status,messages,cost_usd`);
    await rest(`chat_conversations?id=eq.${conv!.id}`, { method: "PATCH", body: JSON.stringify({
      last_at: new Date().toISOString(), messages: (fresh?.messages ?? 0) + 2, cost_usd: Number(fresh?.cost_usd ?? 0) + out.cost,
      unread: true, locale }) });
    return json({ conversation_id: conv!.id, token: conv!.token, reply: out.text, at: m.created_at, status: fresh?.status });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
