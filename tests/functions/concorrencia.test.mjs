// Preços da concorrência com Supabase e API Anthropic simulados: pesquisa, guarda, propõe sem descer da margem mínima
import test from 'node:test';
import assert from 'node:assert/strict';

let handler; const db = { prices: [], checks: [], proposals: [], reports: [], runs: [] }; let calls = 0;
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon', ANTHROPIC_API_KEY: 'ak' })[k] }, serve: (h) => { handler = h; } };
const res = (b, status = 200) => new Response(b == null ? '' : JSON.stringify(b), { status });
const products = [
  { id: 'p1', brand: 'Wock', model: 'CLOG', color: 'Azul', title: 'CLOG 01 - AZUL', variants: [{ id: 'v1', price_cents: 5990, cost_cents: 2500, active: true }, { id: 'v2', price_cents: 5990, cost_cents: 2500, active: true }] },
  { id: 'p2', brand: 'Wock', model: 'CLOG', color: 'Rosa', title: 'CLOG 02 - ROSA', variants: [{ id: 'v3', price_cents: 5990, cost_cents: 2500, active: true }] },
  { id: 'p3', brand: 'Wock', model: 'NUBE', color: 'Preto', title: 'NUBE 06 - PRETAS', variants: [{ id: 'v4', price_cents: 4990, cost_cents: 3500, active: true }] },
];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url); const body = init.body ? JSON.parse(init.body) : null; const m = init.method ?? 'GET';
  if (u.host === 'api.anthropic.com') {
    calls++;
    assert.equal(body.tools[0].type, 'web_search_20250305'); assert.deepEqual(body.tools[0].blocked_domains, ['inurse.pt']);
    if (calls === 1) return res({ stop_reason: 'pause_turn', content: [{ type: 'text', text: 'a pesquisar' }], usage: { input_tokens: 1000, output_tokens: 100, server_tool_use: { web_search_requests: 3 } } });
    return res({ stop_reason: 'tool_use', usage: { input_tokens: 2000, output_tokens: 300, server_tool_use: { web_search_requests: 2 } }, content: [{ type: 'tool_use', name: 'registar_precos', id: 't', input: { ofertas: [
      { modelo: 'wock|clog', loja: 'Loja A', url: 'https://a.pt/clog', preco_eur: 54.5 },
      { modelo: 'wock|clog', loja: 'Loja B', url: 'https://b.es/clog', preco_eur: 57 },
      { modelo: 'wock|nube', loja: 'Loja C', url: 'https://c.pt/nube', preco_eur: 39 },
      { modelo: 'wock|nube', loja: 'Sem link', url: 'nada', preco_eur: 10 } ] } }] });
  }
  const p = u.pathname;
  if (p === '/rest/v1/rpc/is_admin') return res(init.headers.Authorization === 'Bearer admin');
  if (p === '/rest/v1/settings') { const k = u.searchParams.get('key').slice(3); return res([{ value: { agents: { monthly_budget_usd: 15, min_margin_pct: 25 }, competition: { undercut_cents: 0 }, cron: { secret: 'S' } }[k] }]); }
  if (p === '/rest/v1/agents') return res(m === 'PATCH' ? [] : [{ key: 'concorrencia', instructions: 'x', max_proposals: 30 }]);
  if (p === '/rest/v1/agent_runs') { if (m === 'POST') { db.runs.push(body); return res([{ id: 'r1' }]); } if (m === 'PATCH') { Object.assign(db.runs[0], body); return res([]); } return res([]); }
  if (p === '/rest/v1/products') return res(products);
  if (p === '/rest/v1/competitor_checks') { if (m === 'POST') { db.checks.push(body); return res(null); } return res([]); }
  if (p === '/rest/v1/competitor_prices') { db.prices.push(...body); return res([]); }
  if (p === '/rest/v1/proposals') { db.proposals.push(...body); return res([]); }
  if (p === '/rest/v1/reports') { db.reports.push(body); return res([]); }
  throw new Error('fetch inesperado ' + url);
};
const mod = await import('../../supabase/functions/concorrencia/index.ts');

test('preço sugerido: ,90 imediatamente abaixo do mais barato, nunca abaixo da margem', () => {
  assert.equal(mod.suggest(5450, 0, 0), 5390);
  assert.equal(mod.suggest(5490, 0, 0), 5490);
  assert.equal(mod.suggest(5490, 100, 0), 5390);
  assert.equal(mod.suggest(3900, 0, 5740), 5740);
});

test('pesquisa, guarda e propõe', async () => {
  const r = await handler(new Request('https://sb.test/functions/v1/concorrencia', { method: 'POST', headers: { 'x-cron-secret': 'S' }, body: '{}' }));
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.equal(calls, 2);                                     // pause_turn retomado
  assert.equal(db.prices.length, 3);                          // a oferta sem link é ignorada
  assert.equal(db.checks.length, 2);
  // CLOG: mais barato 54,50 → 53,90 nas 3 variantes (margem: 25,00 × 1,23 / 0,75 = 41,00 ok)
  const clog = db.proposals.find((p) => p.title.startsWith('Wock CLOG'));
  assert.equal(clog.kind, 'product.prices');
  assert.deepEqual(clog.payload.changes.map((c) => c.price_cents), [5390, 5390, 5390]);
  // NUBE: concorrência a 39 € mas a margem mínima exige 57,40 € → só um aviso
  const nube = db.proposals.find((p) => p.title.startsWith('Wock NUBE'));
  assert.equal(nube.kind, 'insight');
  assert.ok(db.runs[0].cost_usd > 0.05 && db.runs[0].status === 'done');
  assert.match(db.reports[0].body_md, /Loja A/);
});

test('sem sessão de administrador é recusado', async () => {
  const r = await handler(new Request('https://sb.test/functions/v1/concorrencia', { method: 'POST', headers: {}, body: '{}' }));
  assert.equal(r.status, 401);
});
