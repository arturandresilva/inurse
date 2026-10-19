// Função "emails" com Supabase e Resend simulados: exemplos de todos os estados, fila (envia, salta antigos, repete erros)
import test from 'node:test';
import assert from 'node:assert/strict';

let handler; const sent = []; let resendFail = false;
const now = Date.now();
const db = {
  settings: { email: { enabled: true, active_since: new Date(now - 3600e3).toISOString(), site_url: 'https://www.inurse.pt' }, cron: { secret: 'S' },
              'public.store': { legal_name: 'Artur Silva', address: 'Rua Nova 1', zip: '4590-000', city: 'Paços', email: 'info@inurse.pt', phone: '918889008', return_days: 15 },
              'public.payments': { iban: 'PT50000201231234567890154' } },
  order: { id: 'o1', number: 1001, public_token: 'tok', email: 'ana@x.pt', status: 'delivered', payment_method: 'transfer', total_cents: 6430, shipping_cents: 450, discount_cents: 0, shipping_address: { name: 'Ana Costa' } },
  outbox: [
    { id: 'e1', kind: 'encomenda_enviada', order_id: 'o1', to_email: 'ana@x.pt', created_at: new Date(now).toISOString(), attempts: 0 },
    { id: 'e2', kind: 'encomenda_recebida', order_id: 'o1', to_email: 'ana@x.pt', created_at: new Date(now - 7200e3).toISOString(), attempts: 0 },
  ],
};
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon', RESEND_API_KEY: 'rk' })[k] }, serve: (h) => { handler = h; } };
const res = (b, status = 200) => new Response(b == null ? '' : JSON.stringify(b), { status });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url); const body = init.body ? JSON.parse(init.body) : null; const m = init.method ?? 'GET';
  if (u.host === 'api.resend.com') { if (resendFail) return res({ message: 'domínio por verificar' }, 403); sent.push(body); return res({ id: 'x' }); }
  const p = u.pathname;
  if (p === '/rest/v1/rpc/is_admin') return res(init.headers.Authorization === 'Bearer admin');
  if (p === '/rest/v1/settings') return res([{ value: db.settings[u.searchParams.get('key').slice(3)] }]);
  if (p === '/rest/v1/orders') return res([db.order]);
  if (p === '/rest/v1/order_items') return res([{ title: 'CLOG 01 - AZUL', option_value: '38', quantity: 2, unit_price_cents: 2990 }]);
  if (p === '/rest/v1/shipments') return res([{ carrier: 'CTT Expresso', tracking_code: 'EA123PT' }]);
  if (p === '/rest/v1/order_events') return res([]);
  if (p === '/rest/v1/email_outbox') {
    if (m === 'PATCH') { const id = u.searchParams.get('id').slice(3); Object.assign(db.outbox.find((e) => e.id === id), body); return res([]); }
    return res(db.outbox.filter((e) => (e.status ?? 'pending') === 'pending'));
  }
  throw new Error('fetch inesperado ' + url);
};
await import('../../supabase/functions/emails/index.ts');
const call = (b, h = { Authorization: 'Bearer admin' }) => handler(new Request('https://sb.test/functions/v1/emails', { method: 'POST', headers: h, body: JSON.stringify(b) }));

test('exemplos de todos os emails', async () => {
  const r = await call({ mode: 'test', to: 'artur@x.pt' });
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal(sent.length, 8);
  const all = sent.map((e) => e.html).join('\n');
  assert.match(all, /Rua Nova 1, 4590-000 Paços/);          // rodapé com os dados legais do backoffice
  assert.match(all, /PT50000201231234567890154/);           // IBAN na transferência
  assert.match(all, /objects=EA123PT/);                     // seguimento CTT
  assert.match(all, /\/avaliar\/1001\?t=tok&nota=5/);       // estrelas da avaliação
  assert.ok(sent.every((e) => e.to[0] === 'artur@x.pt' && e.subject.startsWith('[Exemplo]')));
});

test('fila: envia o novo, salta o anterior à ativação', async () => {
  sent.length = 0;
  const j = await (await call({ mode: 'due' }, { 'x-cron-secret': 'S' })).json();
  assert.equal(j.done.length, 1);
  assert.equal(db.outbox[0].status, 'sent'); assert.equal(db.outbox[1].status, 'skipped');
  assert.equal(sent[0].subject, 'A encomenda #1001 está a caminho');
});

test('erro do Resend fica registado e volta a tentar', async () => {
  resendFail = true;
  db.outbox.push({ id: 'e3', kind: 'avaliacao', order_id: 'o1', to_email: 'ana@x.pt', created_at: new Date().toISOString(), attempts: 0 });
  await call({ mode: 'due' }, { 'x-cron-secret': 'S' });
  const e = db.outbox[2];
  assert.equal(e.status, 'pending'); assert.equal(e.attempts, 1); assert.match(e.error, /Resend 403/);
});

test('sem sessão de administrador não envia testes', async () => {
  assert.equal((await call({ mode: 'test', to: 'a@b.pt' }, {})).status, 401);
});

test('email na língua do cliente', async () => {
  sent.length = 0; resendFail = false;
  db.order.locale = 'fr';
  await call({ mode: 'test', to: 'jean@x.fr', kind: 'encomenda_enviada' });
  assert.match(sent[0].subject, /La commande #1001 est en route/);
  assert.match(sent[0].html, /lang="fr"/);
  db.order.locale = 'pt';
});
