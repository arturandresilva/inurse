// Assistente do site com Supabase e IA simulados: cria conversa, guarda mensagens, não mostra encomendas sem o email certo, passa para pessoa
import test from 'node:test';
import assert from 'node:assert/strict';

let handler; const db = { convs: [], msgs: [] }; let script = [];
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', ANTHROPIC_API_KEY: 'ak' })[k] }, serve: (h) => { handler = h; } };
const res = (b, status = 200) => new Response(b == null ? '' : JSON.stringify(b), { status });
const sent = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url); const body = init.body ? JSON.parse(init.body) : null; const m = init.method ?? 'GET';
  if (u.host === 'api.anthropic.com') { sent.push(body); return res(script.shift()); }
  const p = u.pathname; const q = (k) => u.searchParams.get(k)?.replace(/^eq\./, '');
  if (p === '/rest/v1/settings') return res([{ value: { 'public.chat': { whatsapp: '351900000000' }, agents: { monthly_budget_usd: 15 }, 'public.store': { return_days: 15 } }[q('key')] ?? {} }]);
  if (p === '/rest/v1/products') return res([{ handle: 'clog-01-azul', title: 'CLOG 01 - AZUL', brand: 'Wock', model: 'CLOG', color: 'Azul', status: 'active', variants: [{ option_value: '38', price_cents: 5990, active: true }] }]);
  if (p === '/rest/v1/agent_runs') return res([]);
  if (p === '/rest/v1/orders') return res([{ id: 'o', number: 1001, email: 'ana@x.pt', status: 'shipped', created_at: '2026-10-19', total_cents: 6440, shipments: [{ carrier: 'CTT', tracking_code: 'EA1PT' }] }]);
  if (p === '/rest/v1/chat_conversations') {
    if (m === 'POST') { const c = { id: '11111111-1111-1111-1111-111111111111', token: '22222222-2222-2222-2222-222222222222', status: 'open', messages: 0, cost_usd: 0 }; db.convs.push(c); return res([c]); }
    if (m === 'PATCH') { Object.assign(db.convs[0], body); return res([]); }
    if (u.searchParams.get('select') === 'cost_usd') return res([]);
    return res(db.convs.filter((c) => c.id === q('id') && (!q('token') || c.token === q('token'))));
  }
  if (p === '/rest/v1/chat_messages') {
    if (m === 'POST') { const r = { ...body, created_at: new Date().toISOString() }; db.msgs.push(r); return res([r]); }
    return res(db.msgs.slice().reverse());
  }
  throw new Error('fetch inesperado ' + url);
};
await import('../../supabase/functions/assistente/index.ts');
const call = (b) => handler(new Request('https://sb.test/functions/v1/assistente', { method: 'POST', body: JSON.stringify(b) }));

test('primeira mensagem cria conversa e responde', async () => {
  script = [{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Recomendo o CLOG: /produto/clog-01-azul' }], usage: { input_tokens: 1000, output_tokens: 50 } }];
  const j = await (await call({ message: 'Que socas recomendam?', locale: 'pt', page: '/' })).json();
  assert.equal(j.conversation_id, db.convs[0].id); assert.match(j.reply, /CLOG/);
  assert.match(sent[0].system, /"modelo":"CLOG"/);
  assert.deepEqual(db.msgs.map((x) => x.role), ['user', 'assistant']);
  assert.ok(db.convs[0].cost_usd > 0);
});

test('encomenda com email errado não é revelada; pedir pessoa marca a conversa', async () => {
  const c = db.convs[0];
  script = [
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'ver_encomenda', input: { numero: 1001, email: 'outro@x.pt' } }], usage: {} },
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't2', name: 'pedir_pessoa', input: { motivo: 'não encontra a encomenda', contacto: '912000000' } }], usage: {} },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Passei para a equipa.' }], usage: {} },
  ];
  sent.length = 0;
  const j = await (await call({ message: 'A minha encomenda 1001?', conversation_id: c.id, token: c.token })).json();
  assert.equal(j.reply, 'Passei para a equipa.');
  const toolResult = JSON.stringify(sent[1].messages.at(-1).content);
  assert.match(toolResult, /Não encontrei/); assert.doesNotMatch(toolResult, /EA1PT/);
  assert.equal(c.status, 'needs_human'); assert.equal(c.contact, '912000000');
});

test('chave errada não lê a conversa', async () => {
  const j = await (await call({ mode: 'poll', conversation_id: db.convs[0].id, token: '33333333-3333-3333-3333-333333333333' })).json();
  assert.deepEqual(j.messages, []);
});
