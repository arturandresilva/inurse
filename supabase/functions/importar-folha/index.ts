// Lê folhas de preços de fornecedores com a IA (Claude): uma página de PDF ou um bloco de texto de cada vez.
// Devolve "linhas lógicas" (modelo/cor com tamanhos como estão escritos); o backoffice expande os tamanhos
// e mostra tudo para revisão antes de mexer no catálogo. Só administradores.
import { PDFDocument } from "npm:pdf-lib@1.17.1";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
// preço por milhão de tokens (USD) para registar o custo no Contabilista
const PRICE: Record<string, [number, number]> = { "claude-sonnet-5-5": [2, 10], "claude-opus-5-5": [4, 20], "claude-haiku-5-5": [0.1, 0.5] };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

const TOOL = {
  name: "registar_linhas",
  description: "Regista todas as linhas de artigos encontradas na folha de preços.",
  input_schema: {
    type: "object",
    properties: {
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ref: { type: "string", description: "Referência/código do modelo (ou do artigo) tal como na folha" },
            name: { type: "string", description: "Nome do modelo/artigo" },
            description: { type: "string" },
            brand: { type: "string" },
            color: { type: "string", description: "Cor desta linha, se houver" },
            sizes: { type: "string", description: "Tamanhos exatamente como escritos (ex.: '35 a 46', '35/6 a 47/8', 'S,M,L', 'Único')" },
            sku: { type: "string", description: "Referência por tamanho, se a folha tiver uma linha por tamanho" },
            ean: { type: "string" },
            cost: { type: "number", description: "Preço de compra para a loja, SEM IVA, em euros" },
            rrp: { type: "number", description: "PVP/PVPR recomendado ao público, COM IVA, em euros" },
            vat: { type: "number", description: "Taxa de IVA em % se indicada (23, 13, 6)" },
            category: { type: "string", description: "Uma de: CALÇADO>SOCAS, CALÇADO>SAPATOS, CALÇADO>SAPATILHAS, CALÇADO>BOTAS, CALÇADO>SANDÁLIAS E CHINELOS, MEIAS, ACESSÓRIOS>CUIDADOS DOS PÉS, ACESSÓRIOS>PEÇAS DE REPOSIÇÃO, ou outra se nenhuma servir" },
            review: { type: "string", description: "Preencher só se algo estiver ilegível ou duvidoso (o quê)" },
          },
          required: ["name"],
        },
      },
      notes: { type: "string", description: "Condições comerciais encontradas (portes, descontos, mínimos), se houver" },
    },
    required: ["lines"],
  },
};

const SYSTEM = `Lês tabelas de preços de fornecedores de calçado profissional, meias de compressão e acessórios para uma loja online portuguesa.
Regras:
- Extrai TODAS as linhas de artigos desta página, pela ordem; uma entrada por combinação modelo+cor.
- Células unidas: se a referência, o nome ou o preço só aparecem uma vez para várias cores, repete-os em cada linha.
- "cost" é o preço para o revendedor (sem IVA). "rrp" é o PVP/PVPR recomendado ao público (com IVA). Não inventes valores: se faltar, omite o campo.
- Mantém os tamanhos como estão escritos; não os expandas.
- Ignora cabeçalhos, rodapés, condições comerciais (põe-nas em "notes") e tabelas que não sejam de artigos.
- Usa números com ponto decimal (32.70), sem símbolo de euro.`;

async function isAdmin(auth: string) {
  const r = await fetch(`${URL}/rest/v1/rpc/is_admin`, { method: "POST", headers: { apikey: ANON, Authorization: auth, "Content-Type": "application/json" }, body: "{}" });
  return r.ok && (await r.json()) === true;
}

async function download(path: string): Promise<Uint8Array> {
  const r = await fetch(`${URL}/storage/v1/object/importacoes/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: svc });
  if (!r.ok) throw new Error(`não encontrei o ficheiro (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

function b64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function logRun(summary: string, tin: number, tout: number, error?: string) {
  const [pi, po] = PRICE[MODEL] ?? [2, 10];
  await fetch(`${URL}/rest/v1/agent_runs`, {
    method: "POST", headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ agent_key: "importador", trigger: "manual", status: error ? "failed" : "done", summary, error: error ?? null,
      tokens_in: tin, tokens_out: tout, cost_usd: (tin * pi + tout * po) / 1e6, finished_at: new Date().toISOString() }),
  }).catch(() => {});
}

async function ask(content: unknown[], label: string) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 16000, system: SYSTEM, tools: [TOOL], tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content }] }),
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = data?.error?.message ?? `erro ${r.status}`;
    await logRun(`Leitura falhou: ${label}`, 0, 0, msg);
    if (r.status === 401) throw new Error("A chave da API Anthropic não é válida (segredo ANTHROPIC_API_KEY).");
    throw new Error(`IA: ${msg}`);
  }
  const tin = data.usage?.input_tokens ?? 0, tout = data.usage?.output_tokens ?? 0;
  const out = (data.content ?? []).find((c: { type: string }) => c.type === "tool_use")?.input ?? { lines: [] };
  const truncated = data.stop_reason === "max_tokens";
  await logRun(`Leitura de ${label}: ${out.lines?.length ?? 0} linhas`, tin, tout);
  return { lines: out.lines ?? [], notes: out.notes ?? null, truncated, tokens: { in: tin, out: tout } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!(await isAdmin(req.headers.get("Authorization") ?? ""))) return json({ error: "sem permissão" }, 403);
    const body = await req.json().catch(() => ({}));
    const { mode = "pdf", path, page, text, label = "folha" } = body as { mode?: string; path?: string; page?: number; text?: string; label?: string };

    if (mode === "info") {
      if (!path) return json({ error: "falta o ficheiro" }, 400);
      const doc = await PDFDocument.load(await download(path), { ignoreEncryption: true });
      return json({ pages: doc.getPageCount(), ai: !!KEY });
    }
    if (!KEY) return json({ error: "Falta a chave da API Anthropic: guarda-a nos segredos das Edge Functions do Supabase com o nome ANTHROPIC_API_KEY." }, 400);

    if (mode === "pdf") {
      if (!path || !page) return json({ error: "falta o ficheiro ou a página" }, 400);
      const src = await PDFDocument.load(await download(path), { ignoreEncryption: true });
      if (page < 1 || page > src.getPageCount()) return json({ error: "página inexistente" }, 400);
      const one = await PDFDocument.create();
      const [p] = await one.copyPages(src, [page - 1]);
      one.addPage(p);
      const data = b64(await one.save());
      const res = await ask([
        { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
        { type: "text", text: `Página ${page} de ${src.getPageCount()} da tabela "${label}". Regista todas as linhas de artigos desta página.` },
      ], `${label} p.${page}`);
      return json({ page, ...res });
    }
    if (mode === "text") {
      if (!text) return json({ error: "sem texto" }, 400);
      const res = await ask([{ type: "text", text: `Excerto da folha "${label}" (colunas separadas por ;):\n\n${text.slice(0, 60000)}\n\nRegista todas as linhas de artigos.` }], `${label} (texto)`);
      return json(res);
    }
    return json({ error: "modo desconhecido" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
