// Copia as imagens dos produtos do CDN da Loja CTT para o Storage do Supabase (bucket "produtos").
// Chamada pelo backoffice, em lotes; só administradores.
const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    // administrador (backoffice) ou o agendador da base de dados (cabeçalho x-cron-secret)
    const given = req.headers.get('x-cron-secret') ?? '';
    let cron = false;
    if (given) {
      const s = await (await fetch(`${URL}/rest/v1/settings?key=eq.cron&select=value`, { headers: svc })).json();
      cron = !!s?.[0]?.value?.secret && s[0].value.secret === given;
    }
    if (!cron) {
      const auth = req.headers.get('Authorization') ?? '';
      const chk = await fetch(`${URL}/rest/v1/rpc/is_admin`, {
        method: 'POST', headers: { apikey: ANON, Authorization: auth, 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!chk.ok || (await chk.json()) !== true) return json({ error: 'sem permissão' }, 403);
    }

    const { limit = 25 } = await req.json().catch(() => ({}));
    const pending = `${URL}/rest/v1/product_images?url=like.*lojasonlinectt*`;
    const rows: { id: string; url: string }[] = await (await fetch(`${pending}&select=id,url&limit=${Math.min(limit, 50)}`, { headers: svc })).json();

    let copied = 0; const failed: string[] = [];
    for (const r of rows) {
      try {
        const img = await fetch(r.url);
        if (!img.ok) throw new Error(`HTTP ${img.status}`);
        const type = img.headers.get('content-type') ?? 'image/jpeg';
        const name = decodeURIComponent(r.url.split('/').pop()!.split('?')[0]).replace(/[^A-Za-z0-9._-]/g, '_');
        const up = await fetch(`${URL}/storage/v1/object/produtos/ctt/${name}`, {
          method: 'POST', headers: { ...svc, 'Content-Type': type, 'x-upsert': 'true' }, body: await img.arrayBuffer(),
        });
        if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`);
        const pub = `${URL}/storage/v1/object/public/produtos/ctt/${name}`;
        const upd = await fetch(`${URL}/rest/v1/product_images?id=eq.${r.id}`, {
          method: 'PATCH', headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ url: pub }),
        });
        if (!upd.ok) throw new Error(`update ${upd.status}`);
        copied++;
      } catch (e) {
        failed.push(`${r.url}: ${(e as Error).message}`);
      }
    }
    const rem = await fetch(`${pending}&select=id`, { method: 'HEAD', headers: { ...svc, Prefer: 'count=exact', Range: '0-0' } });
    const remaining = parseInt((rem.headers.get('content-range') ?? '*/0').split('/')[1], 10) || 0;
    return json({ copied, failed, remaining });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
