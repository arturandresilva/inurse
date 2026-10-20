// Redes sociais (Meta: Instagram e Facebook). Só administradores.
//  POST {mode:"status"}                                   — que contas estão ligadas (nunca devolve chaves)
//  POST {mode:"publish", campaign_id, networks:["instagram","facebook"]} — publica a imagem e o texto da campanha
// Segredos nas Edge Functions do Supabase: META_ACCESS_TOKEN (token de página de longa duração),
// META_PAGE_ID (página do Facebook) e META_IG_USER_ID (conta profissional do Instagram ligada à página).
const SB = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const TOKEN = Deno.env.get("META_ACCESS_TOKEN") ?? "";
const PAGE = Deno.env.get("META_PAGE_ID") ?? "";
const IG = Deno.env.get("META_IG_USER_ID") ?? "";
const GRAPH = "https://graph.facebook.com/v21.0";

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
async function graph(path: string, params: Record<string, string> = {}, method = "GET") {
  const qs = new URLSearchParams({ ...params, access_token: TOKEN });
  const r = await fetch(`${GRAPH}/${path}${method === "GET" ? `?${qs}` : ""}`, method === "GET" ? {} : { method, body: qs });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d?.error?.message ?? `Meta ${r.status}`);
  return d as Row;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const chk = await fetch(`${SB}/rest/v1/rpc/is_admin`, { method: "POST", headers: { apikey: ANON, Authorization: req.headers.get("Authorization") ?? "", "Content-Type": "application/json" }, body: "{}" });
    if (!chk.ok || (await chk.json()) !== true) return json({ error: "sem permissão" }, 401);
    const b = await req.json().catch(() => ({}));

    if (b.mode === "status") {
      const out: Row = { meta: { chave: !!TOKEN, pagina: !!PAGE, instagram: !!IG } };
      if (TOKEN && PAGE) { try { out.facebook = (await graph(PAGE, { fields: "name,link" })); } catch (e) { out.facebook_error = (e as Error).message; } }
      if (TOKEN && IG) { try { out.instagram = (await graph(IG, { fields: "username,profile_picture_url,followers_count" })); } catch (e) { out.instagram_error = (e as Error).message; } }
      return json(out);
    }

    if (b.mode === "publish") {
      if (!TOKEN) return json({ error: "Instagram e Facebook ainda não estão ligados (faltam os segredos META_ACCESS_TOKEN, META_PAGE_ID e META_IG_USER_ID)." }, 400);
      const [c] = ((await rest(`campaigns?id=eq.${encodeURIComponent(String(b.campaign_id ?? ""))}&select=*`)) ?? []) as Row[];
      if (!c) return json({ error: "campanha não encontrada" }, 404);
      const content = c.content ?? {};
      const image = content.image_url;
      if (!image) return json({ error: "Esta publicação ainda não tem imagem. Gera e guarda a imagem primeiro." }, 400);
      const tags = Array.isArray(content.hashtags) ? content.hashtags.map((h: string) => (h.startsWith("#") ? h : `#${h}`)).join(" ") : (content.hashtags ?? "");
      const caption = [content.caption ?? "", tags].filter(Boolean).join("\n\n").slice(0, 2150);
      const nets: string[] = Array.isArray(b.networks) && b.networks.length ? b.networks : ["instagram", "facebook"];
      const published: Row = { ...(c.published ?? {}) }, errors: Row = {};
      if (nets.includes("instagram")) {
        if (!IG) errors.instagram = "Falta o segredo META_IG_USER_ID.";
        else try {
          const media = await graph(`${IG}/media`, { image_url: image, caption }, "POST");
          // o Instagram precisa de processar a imagem antes de publicar
          for (let i = 0; i < 10; i++) { const st = await graph(media.id, { fields: "status_code" }); if (st.status_code === "FINISHED") break; if (st.status_code === "ERROR") throw new Error("o Instagram não aceitou a imagem"); await new Promise((r) => setTimeout(r, 1500)); }
          const pub = await graph(`${IG}/media_publish`, { creation_id: media.id }, "POST");
          const link = await graph(pub.id, { fields: "permalink" }).catch(() => ({} as Row));
          published.instagram = { id: pub.id, url: link.permalink ?? null, at: new Date().toISOString() };
        } catch (e) { errors.instagram = (e as Error).message; }
      }
      if (nets.includes("facebook")) {
        if (!PAGE) errors.facebook = "Falta o segredo META_PAGE_ID.";
        else try {
          const p = await graph(`${PAGE}/photos`, { url: image, caption }, "POST");
          published.facebook = { id: p.post_id ?? p.id, url: p.post_id ? `https://www.facebook.com/${p.post_id}` : null, at: new Date().toISOString() };
        } catch (e) { errors.facebook = (e as Error).message; }
      }
      const ok = Object.keys(published).some((k) => nets.includes(k) && published[k]?.at && !errors[k]);
      await rest(`campaigns?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify({ published, ...(ok ? { status: "sent", sent_at: new Date().toISOString() } : {}) }) });
      return json({ published, errors });
    }
    return json({ error: "pedido inválido" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
