// Percorre a função "faturas" com o InvoiceXpress e o Supabase simulados: criar → finalizar → PDF → guardar → email,
// repetir sem duplicar, erro guardado na encomenda e o link do PDF com chave.
import test from 'node:test';
import assert from 'node:assert/strict';

const db = { invoices: [], order_events: [], storage: {}, settings: { invoicing: { account: 'inurse', auto_invoice: true, send_email: true }, cron: { secret: 'S' } } };
const ixLog = [];
let ixFail = false;
let handler;
globalThis.Deno = {
  env: { get: (k) => ({ SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon', INVOICEXPRESS_API_KEY: 'ixkey' })[k] },
  serve: (h) => { handler = h; },
};
const ORDER = '11111111-1111-1111-1111-111111111111';
const res = (b, status = 200) => new Response(b == null ? '' : typeof b === 'string' ? b : JSON.stringify(b), { status });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url); const m = init.method ?? 'GET'; const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
  if (u.host === 'inurse.app.invoicexpress.com') {
    ixLog.push(`${m} ${u.pathname}`);
    assert.equal(u.searchParams.get('api_key'), 'ixkey');
    if (ixFail) return res('', 422);
    if (m === 'POST' && u.pathname === '/invoice_receipts.json') { assert.equal(body.invoice.client.code, 'CF-abc'); assert.equal(body.proprietary_uid, `inurse-${ORDER}`); return res({ invoice: { id: 77, status: 'draft' } }, 201); }
    if (m === 'PUT' && u.pathname.endsWith('/change-state.json')) return res('', 200);
    if (m === 'GET' && u.pathname === '/invoice_receipts/77.json') return res({ invoice_receipt: { id: 77, status: 'final', sequence_number: '12/FR', inverted_sequence_number: 'FR/12', total: 79.3, permalink: 'https://ix/p/77' } });
    if (u.pathname === '/api/pdf/77.json') return ixLog.filter((l) => l.includes('/api/pdf')).length < 2 ? res('', 202) : res({ output: { pdfUrl: 'https://cdn.ix/77.pdf' } });
    if (m === 'PUT' && u.pathname.endsWith('/email-document.json')) { assert.equal(body.message.client.email, 'ana@x.pt'); return res('', 200); }
    throw new Error('IX inesperado ' + m + u.pathname);
  }
  if (u.host === 'cdn.ix') return res('%PDF-1.4 teste');
  if (u.host === 'sb.test') {
    const p = u.pathname;
    if (p === '/rest/v1/rpc/is_admin') return res(init.headers.Authorization === 'Bearer admin');
    if (p === '/rest/v1/rpc/invoice_payload') return res({ date: '19/10/2026', client: { code: 'CF-abc', name: 'Ana' }, items: [], sequence_id: null, expected_total_cents: 7930, order_number: 1001 });
    if (p === '/rest/v1/rpc/orders_to_invoice') return res([ORDER]);
    if (p === '/rest/v1/settings') return res([{ value: db.settings[u.searchParams.get('key').slice(3)] }]);
    if (p === '/rest/v1/orders') return res([{ email: 'ana@x.pt', number: 1001, shipping_address: { name: 'Ana Costa' } }]);
    if (p === '/rest/v1/order_events') { db.order_events.push(body.message); return res([body]); }
    if (p === '/rest/v1/invoices') {
      const f = [...u.searchParams].filter(([k]) => !['select', 'order', 'limit'].includes(k));
      const match = (r) => f.every(([k, v]) => v === 'is.null' ? r[k] == null : String(r[k]) === v.slice(3));
      if (m === 'POST') { const r = { id: '22222222-2222-2222-2222-222222222222', kind: 'fatura-recibo', access_token: 'ab'.repeat(16), external_id: null, number: null, attempts: 0, updated_at: new Date().toISOString(), ...body }; db.invoices.push(r); return res([r]); }
      if (m === 'PATCH') { db.invoices.filter(match).forEach((r) => Object.assign(r, body)); return res([]); }
      return res(db.invoices.filter(match));
    }
    if (p.startsWith('/storage/v1/object/faturas/')) {
      const key = p.slice('/storage/v1/object/faturas/'.length);
      if (m === 'POST') { db.storage[key] = true; return res({ Key: key }); }
      return db.storage[key] ? res('%PDF') : res('', 404);
    }
  }
  throw new Error('fetch inesperado ' + url);
};
await import('../../supabase/functions/faturas/index.ts');
const call = (b, auth = 'Bearer admin') => handler(new Request('https://sb.test/functions/v1/faturas', { method: 'POST', headers: { Authorization: auth }, body: JSON.stringify(b) }));

test('sem sessão de administrador é recusado', async () => {
  assert.equal((await call({ order_id: ORDER }, 'Bearer x')).status, 401);
});

test('emite, finaliza, guarda o PDF e envia por email', async () => {
  const r = await call({ order_id: ORDER });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  const inv = db.invoices[0];
  assert.equal(inv.status, 'final'); assert.equal(inv.number, 'FR FR/12');
  assert.equal(inv.external_id, '77'); assert.equal(inv.total_cents, 7930);
  assert.ok(inv.storage_path.startsWith(`${ORDER}/`)); assert.equal(inv.sent_to, 'ana@x.pt');
  assert.match(inv.pdf_url, /^https:\/\/sb\.test\/functions\/v1\/faturas\?f=.+&t=(ab){16}$/);
  assert.ok(db.order_events.some((e) => e.startsWith('Fatura-recibo')) && db.order_events.some((e) => e.startsWith('Fatura enviada')));
});

test('repetir não cria outra fatura', async () => {
  const before = ixLog.length;
  const j = await (await call({ order_id: ORDER })).json();
  assert.equal(j.already, true); assert.equal(ixLog.length, before); assert.equal(db.invoices.length, 1);
});

test('o link do PDF só abre com a chave certa', async () => {
  const inv = db.invoices[0];
  const ok = await handler(new Request(inv.pdf_url));
  assert.equal(ok.status, 200); assert.equal(ok.headers.get('content-type'), 'application/pdf');
  const bad = await handler(new Request(inv.pdf_url.replace(/t=.*/, 't=' + 'cd'.repeat(16))));
  assert.equal(bad.status, 404);
});

test('agendador com segredo; erro do InvoiceXpress fica registado', async () => {
  db.invoices.length = 0; ixFail = true;
  const j = await (await handler(new Request('https://sb.test/functions/v1/faturas', { method: 'POST', headers: { 'x-cron-secret': 'S' }, body: '{"mode":"due"}' }))).json();
  assert.ok(j.done[0].error, JSON.stringify(j));
  assert.equal(db.invoices[0].status, 'error'); assert.match(db.invoices[0].error, /InvoiceXpress 422/);
  assert.ok(db.order_events.some((e) => e.startsWith('Fatura não emitida')));
});
