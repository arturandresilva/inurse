// Percorre o backoffice como o Artur: entrar, ver cada página, fazer as ações principais e tirar fotografias.
// Uso: BASE=http://127.0.0.1:3000 SHOTS=./shots node admin.mjs
import fs from 'node:fs';
let pw;
try { pw = await import('playwright'); } catch { pw = await import('/opt/node22/lib/node_modules/playwright/index.mjs'); }
const { chromium } = pw;

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SHOTS = process.env.SHOTS || './shots';
const MOCK = process.env.MOCK || 'http://127.0.0.1:3002';
fs.mkdirSync(SHOTS, { recursive: true });

const problems = [];
const ok = (...a) => { console.log('✔', ...a); fs.appendFileSync(`${SHOTS}/passos.log`, `✔ ${a.join(' ')}\n`); };
const browser = await chromium.launch();

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'pt-PT', timezoneId: 'Europe/Lisbon' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${page.url()}] erro JS: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR/.test(m.text())) problems.push(`[${page.url()}] consola: ${m.text()}`);
  });
  page.on('dialog', (d) => d.accept());
  page.on('console', (m2) => fs.appendFileSync(`${SHOTS}/consola.log`, `[${m2.type()}] ${page.url()} ${m2.text()}\n`));
  page.on('response', (r) => { if (r.status() >= 400) fs.appendFileSync(`${SHOTS}/rede.log`, `${r.status()} ${r.request().method()} ${r.url()}\n`); });
  page.on('requestfailed', (r) => fs.appendFileSync(`${SHOTS}/rede.log`, `FALHOU ${r.request ? '' : ''}${r.method()} ${r.url()} ${r.failure()?.errorText}\n`));
  // imagens externas (CDN antigo) não interessam ao teste
  await page.route(/lojasonlinectt|supabase\.co\/storage/, (r) => r.fulfill({ status: 404, body: '' }));
  return page;
}

async function settle(page) {
  await page.waitForSelector('.a-main', { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('.a-main .a-loading'), null, { timeout: 20000 });
  await page.waitForTimeout(250);
  const err = await page.$('.a-main .a-alert.err');
  if (err) problems.push(`[${page.url()}] mostra erro: ${(await err.textContent()).trim().slice(0, 300)}`);
}
const shot = (page, name, full = true) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });

let page;
async function main() {
// ---------- entrar ----------
page = await newPage({ width: 1400, height: 900 });
await page.goto(`${BASE}/admin`);
await page.waitForSelector('form.a-auth');
await shot(page, '00-entrar', false);
await page.fill('input[name=email]', 'artur.impact@gmail.com');
await page.fill('input[name=password]', 'errada');
await page.click('button.a-btn.primary');
await page.waitForSelector('.a-auth-msg.err');
ok('palavra-passe errada recusada:', await page.textContent('.a-auth-msg'));
await page.fill('input[name=password]', 'teste12345');
await page.click('button.a-btn.primary');
await settle(page);
ok('entrou no painel');
await shot(page, '01-painel');

// ---------- todas as páginas ----------
const ROUTES = (process.env.ROUTES || [
  'encomendas', 'encomendas/1001', 'devolucoes', 'clientes', 'promocoes', 'produtos', 'importar', 'precos', 'fornecedores',
  'envios', 'agentes', 'contas', 'paginas', 'configuracoes',
].join(',')).split(',');
for (const [i, r] of ROUTES.entries()) {
  const resp = await page.goto(`${BASE}/admin/${r}`);
  if (!resp || resp.status() >= 400) { problems.push(`/admin/${r} respondeu ${resp?.status()}`); continue; }
  await settle(page);
  await shot(page, `${String(i + 2).padStart(2, '0')}-${r.replace(/\//g, '_')}`);
  ok('página', r);
}

// ---------- ações ----------
const step = async (name, fn) => {
  try { await fn(); ok(name); } catch (e) { problems.push(`ação "${name}" falhou: ${e.message.split('\n')[0]}`); await shot(page, `falha-${name.replace(/\W+/g, '-')}`, false); }
};
const toastOk = async () => { await page.waitForSelector('.a-toast:not(.err)', { timeout: 10000 }); };

await step('marcar encomenda 1003 como paga', async () => {
  await page.goto(`${BASE}/admin/encomendas/1003`); await settle(page);
  await page.click('button:has-text("Marcar como paga")'); await toastOk();
  await page.waitForSelector('.a-head .a-badge:has-text("Paga")');
});
await step('registar envio da 1001', async () => {
  await page.goto(`${BASE}/admin/encomendas/1001`); await settle(page);
  await page.click('button:has-text("Registar envio")');
  await page.fill('dialog[open] input[name=tracking_code]', 'EA000000001PT');
  await page.click('dialog[open] button.a-btn.primary'); await toastOk();
  await page.waitForSelector('text=EA000000001PT');
  await shot(page, '50-encomenda-enviada');
});
await step('nota interna', async () => {
  await page.fill('input[aria-label="Nota interna"]', 'Teste automático');
  await page.click('button:has-text("Guardar nota")'); await page.waitForSelector('.a-timeline >> text=Teste automático');
});
await step('editar preço de um produto', async () => {
  await page.goto(`${BASE}/admin/produtos`); await settle(page);
  await page.click('.a-table tbody tr.click >> nth=0'); await settle(page);
  const inp = page.locator('input[aria-label="Preço"]').first();
  await inp.fill('59,90'); await inp.blur();
  await page.click('button:has-text("Guardar")'); await toastOk();
  await shot(page, '51-produto');
});
if (process.env.EXTRA_STEPS) {
  const extra = await import(process.env.EXTRA_STEPS);
  await extra.default({ page, BASE, MOCK, step, settle, shot, toastOk, problems });
}

// ---------- telemóvel ----------
const m = await newPage({ width: 390, height: 844 });
await m.goto(`${BASE}/admin`);
await m.waitForSelector('form.a-auth');
await m.fill('input[name=email]', 'artur.impact@gmail.com'); await m.fill('input[name=password]', 'teste12345');
await m.click('button.a-btn.primary'); await m.waitForSelector('.a-main');
for (const r of ['', 'encomendas/1002', 'produtos', 'agentes']) {
  await m.goto(`${BASE}/admin/${r}`); await m.waitForSelector('.a-main');
  await m.waitForFunction(() => !document.querySelector('.a-main .a-loading'), null, { timeout: 20000 });
  const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 2) problems.push(`[telemóvel /admin/${r}] a página é ${over}px mais larga que o ecrã`);
  await m.screenshot({ path: `${SHOTS}/m-${r.replace(/\//g, '_') || 'painel'}.png`, fullPage: false });
}
ok('telemóvel');

// ---------- sem acesso ----------
const other = await newPage({ width: 1200, height: 800 });
await other.goto(`${BASE}/admin`); await other.waitForSelector('form.a-auth');
await other.fill('input[name=email]', 'outro@exemplo.pt'); await other.fill('input[name=password]', 'teste12345');
await other.click('button.a-btn.primary');
await other.waitForSelector('h1:has-text("Sem acesso")');
ok('conta sem permissões vê "Sem acesso"');

}
try { await main(); } catch (e) {
  problems.push(`o percurso parou: ${e.message.split('\n').slice(0, 3).join(' ')}`);
  try { await page?.screenshot({ path: `${SHOTS}/zz-parou.png`, fullPage: true }); } catch {}
}
await browser.close();
if (problems.length) {
  console.log(`\n✗ ${problems.length} problema(s):`);
  for (const p of problems) console.log(process.env.CI ? `::error::${p.replace(/\n/g, ' ')}` : ` - ${p}`);
  process.exit(1);
}
console.log('\nTudo certo.');
