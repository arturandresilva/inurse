// Função "redes" com Supabase e Meta simulados: estado das contas e publicação no Instagram e no Facebook
import test from 'node:test';
import assert from 'node:assert/strict';

let handler; const graphCalls = []; let patched = null;
const camp = { id: 'c1', channel: 'instagram', title: 'Socas', content: { caption: 'Conforto para turnos longos.', hashtags: ['enfermagem', '#socas'], image_url: 'https://cdn/x.png' }, published: {} };
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon', META_ACCESS_TOKEN: 'tok', META_PAGE_ID: 'P1', META_IG_USER_ID: 'IG1' })[k] }, serve: (h) => { handler = h; } };
const res = (b, status = 200) => new Response(b == null ? '' : JSON.stringify(b), { status });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url); const m = init.method ?? 'GET';
  if (u.host === 'graph.facebook.com') {
    const params = m === 'GET' ? Object.fromEntries(u.searchParams) : Object.fromEntries(new URLSearchParams(init.body));
    graphCalls.push({ path: u.pathname, m, params });
    const p = u.pathname.replace('/v21.0/', '');
    if (p === 'IG1' ) return res({ username: 'inurse.pt', followers_count: 10 });
    if (p === 'P1') return res({ name: 'iNurse' });
    if (p === 'IG1/media') return res({ id: 'M1' });
    if (p === 'M1') return res({ status_code: 'FINISHED' });
    if (p === 'IG1/media_publish') return res({ id: 'POST1' });
    if (p === 'POST1') return res({ permalink: 'https://instagram.com/p/abc' });
    if (p === 'P1/photos') return res({ id: 'PH1', post_id: 'P1_9' });
    return res({ error: { message: 'desconhecido' } }, 400);
  }
  if (u.pathname === '/rest/v1/rpc/is_admin') return res(true);
  if (u.pathname === '/rest/v1/campaigns') { if (m === 'PATCH') { patched = JSON.parse(init.body); return res([]); } return res([camp]); }
  throw new Error('fetch inesperado ' + url);
};
await import('../../supabase/functions/redes/index.ts');
const call = (b) => handler(new Request('https://sb.test/functions/v1/redes', { method: 'POST', headers: { Authorization: 'Bearer x' }, body: JSON.stringify(b) }));

test('estado mostra as contas sem revelar o token', async () => {
  const j = await (await call({ mode: 'status' })).json();
  assert.equal(j.instagram.username, 'inurse.pt'); assert.equal(j.facebook.name, 'iNurse');
  assert.ok(!JSON.stringify(j).includes('"tok"'));
});

test('publica no Instagram e no Facebook com texto e hashtags', async () => {
  const j = await (await call({ mode: 'publish', campaign_id: 'c1', networks: ['instagram', 'facebook'] })).json();
  assert.deepEqual(j.errors, {});
  assert.equal(j.published.instagram.url, 'https://instagram.com/p/abc');
  assert.equal(j.published.facebook.id, 'P1_9');
  const media = graphCalls.find((c) => c.path.endsWith('IG1/media'));
  assert.equal(media.params.image_url, 'https://cdn/x.png');
  assert.match(media.params.caption, /Conforto[\s\S]*#enfermagem #socas/);
  assert.equal(patched.status, 'sent');
});
