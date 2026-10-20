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

async function newPage(viewport, { cookies = true, images = false } = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'pt-PT', timezoneId: 'Europe/Lisbon' });
  // o aviso de cookies já respondido, para não tapar botões nos outros testes
  if (cookies) await ctx.addInitScript(() => { try { localStorage.setItem('inurse.cookies', JSON.stringify({ v: 1, stats: false, marketing: false, at: '2026-01-01' })); } catch {} });
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
  await page.route(images ? /lojasonlinectt/ : /lojasonlinectt|supabase\.co\/storage/, (r) => r.fulfill({ status: 404, body: '' }));
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
  'encomendas', 'encomendas/1001', 'encomendas/1002', 'devolucoes', 'clientes', 'promocoes', 'produtos', 'importar', 'precos', 'fornecedores',
  'envios', 'agentes', 'contas', 'pagina-inicial', 'paginas', 'configuracoes', 'configuracoes?tab=faturacao',
].join(',')).split(',');
for (const [i, r] of ROUTES.entries()) {
  const resp = await page.goto(`${BASE}/admin/${r}`);
  if (!resp || resp.status() >= 400) { problems.push(`/admin/${r} respondeu ${resp?.status()}`); continue; }
  await settle(page);
  await shot(page, `${String(i + 2).padStart(2, '0')}-${r.replace(/[\/?=]/g, '_')}`);
  ok('página', r);
  // encomendas ainda não abertas aparecem com o selo "Nova" (antes de abrir os detalhes)
  if (r === 'encomendas' && !(await page.locator('.a-table .a-badge:has-text("Nova")').count())) problems.push('encomendas novas sem o selo "Nova"');
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
await step('editar campanha da página inicial', async () => {
  await page.goto(`${BASE}/admin/pagina-inicial`); await settle(page);
  await page.click('tr:has-text("Campanha de teste") button:has-text("Editar")');
  await page.waitForSelector('.a-slide');
  await page.fill('.a-slide >> nth=0 >> input[placeholder="Nova coleção"]', 'Só esta semana');
  await page.click('.a-slide >> nth=0 >> button:has-text("Guardar textos")'); await toastOk();
  await shot(page, '18-pagina-inicial-campanha');
  await page.click('button[role=tab]:has-text("Imagens da página inicial")'); await settle(page);
  await shot(page, '19-pagina-inicial-imagens');
});
await step('editar preço de um produto', async () => {
  await page.goto(`${BASE}/admin/produtos`); await settle(page);
  await page.click('.a-table tbody tr.click >> nth=0'); await settle(page);
  const inp = page.locator('input[aria-label="Preço"]').first();
  await inp.fill('59,90'); await inp.blur();
  await page.click('button:has-text("Guardar")'); await toastOk();
  await shot(page, '51-produto');
});
await step('importar folha CSV e aplicar', async () => {
  const csv = `${SHOTS}/folha-teste.csv`;
  fs.writeFileSync(csv, 'Tabela 2026;;;;;\nReferência;Designação;Cor;Tamanhos;Preço;PVP\nTST01;SOCA TESTE;Azul;36 a 39;30,00;59,90\nTST02;SOCA TESTE;Branco;36 a 38;30,00;59,90\n');
  await page.goto(`${BASE}/admin/importar`); await settle(page);
  await page.selectOption('label:has-text("Fornecedor") select', { label: 'Nursing Care' });
  await page.setInputFiles('input[type=file]', csv);
  await page.waitForSelector('text=Continuar para revisão');
  await shot(page, '52-importar-colunas');
  await page.click('text=Continuar para revisão');
  await page.waitForURL(/\/admin\/importar\/[0-9a-f-]{36}/, { timeout: 20000 }); await settle(page);
  await shot(page, '53-importar-revisao');
  await page.click('button:has-text("Aplicar ao catálogo")');
  await page.click('dialog[open] button.a-btn.primary'); await toastOk();
  await page.waitForSelector('text=Aplicada:');
  await shot(page, '54-importar-aplicada');
});
if (process.env.EXTRA_STEPS) {
  const extra = await import(process.env.EXTRA_STEPS);
  await extra.default({ page, BASE, MOCK, step, settle, shot, toastOk, problems });
}

// ---------- área de cliente (loja) ----------
const shop = await newPage({ width: 1280, height: 860 }, { images: true });
const stepShop = async (name, fn) => { try { await fn(); ok(name); } catch (e) { problems.push(`ação "${name}" falhou: ${e.message.split('\n')[0]}`); await shop.screenshot({ path: `${SHOTS}/falha-loja-${name.replace(/\W+/g, '-')}.png`, fullPage: true }); } };
await stepShop('cliente cria conta e vê a sua encomenda', async () => {
  await shop.goto(`${BASE}/conta`);
  await shop.click('text=Criar conta nova');
  await shop.fill('#a-name', 'Ana Costa'); await shop.fill('#a-email', 'ana@exemplo.pt'); await shop.fill('#a-pass', 'cliente12345');
  await shop.click('button:has-text("Criar conta")');
  await shop.waitForSelector('text=Encomenda n.º 1001', { timeout: 15000 });
  await shop.screenshot({ path: `${SHOTS}/60-conta-encomendas.png`, fullPage: true });
});
await stepShop('cliente guarda favorito e morada', async () => {
  await shop.goto(`${BASE}/loja`); await shop.click('.prod >> nth=0');
  await shop.waitForSelector('button.fav'); await shop.click('button.fav');
  await shop.waitForSelector('button.fav.on');
  await shop.goto(`${BASE}/conta?separador=favoritos`); await shop.waitForSelector('.grid .prod');
  await shop.click('text=Moradas'); await shop.click('text=Adicionar morada');
  await shop.fill('#ad-name', 'Ana Costa'); await shop.fill('#ad-l1', 'Rua do Hospital 1'); await shop.fill('#ad-zip', '4000-100'); await shop.fill('#ad-city', 'Porto');
  await shop.click('text=Guardar morada'); await shop.waitForSelector('.address-card >> text=Rua do Hospital 1');
  await shop.screenshot({ path: `${SHOTS}/61-conta-moradas.png`, fullPage: true });
});
await stepShop('checkout preenchido com os dados da conta', async () => {
  await shop.goto(`${BASE}/loja`); await shop.click('.prod >> nth=1');
  await shop.click('.opts label:not(:has(input:disabled)) >> nth=0');
  await shop.click('button:has-text("Adicionar")');
  await shop.goto(`${BASE}/checkout`);
  await shop.waitForFunction(() => document.querySelector('#line1')?.value === 'Rua do Hospital 1', null, { timeout: 15000 });
  await shop.screenshot({ path: `${SHOTS}/62-checkout-preenchido.png`, fullPage: true });
});
await stepShop('aviso de cookies aparece na primeira visita e some ao escolher', async () => {
  const fresh = await newPage({ width: 390, height: 844 }, { cookies: false });
  await fresh.goto(`${BASE}/`); await fresh.waitForSelector('.cookie-notice');
  await fresh.screenshot({ path: `${SHOTS}/64-cookies-telemovel.png` });
  await fresh.click('.cookie-notice button:has-text("Só essenciais")');
  await fresh.waitForSelector('.cookie-notice', { state: 'detached' });
  await fresh.reload(); await fresh.waitForTimeout(500);
  if (await fresh.$('.cookie-notice')) throw new Error('voltou a aparecer depois de escolher');
  await fresh.click('footer button:has-text("Preferências de cookies")'); await fresh.waitForSelector('.cookie-notice');
});
await stepShop('loja agrupada por modelos com escolha da cor', async () => {
  await shop.goto(`${BASE}/loja`); await shop.waitForSelector('.prod');
  await shop.screenshot({ path: `${SHOTS}/65-loja-modelos.png` });
  const card = shop.locator('.prod:has(.swatches)').first();
  if (await card.count()) {
    await card.click(); await shop.waitForSelector('.colors .color.on');
    await shop.screenshot({ path: `${SHOTS}/66-produto-cores.png` });
    await shop.locator('.colors .color:not(.on)').first().click(); await shop.waitForURL(/\/produto\//);
  }
});
await stepShop('formulário de livre resolução', async () => {
  await shop.goto(`${BASE}/livre-resolucao`);
  await shop.fill('#w-number', '1002'); await shop.fill('#w-email', 'rui@exemplo.pt');
  await shop.click('button:has-text("Continuar")'); await shop.waitForSelector('#w-name');
  await shop.screenshot({ path: `${SHOTS}/67-livre-resolucao-form.png`, fullPage: true });
  await shop.click('button:has-text("Enviar declaração")'); await shop.waitForSelector('.withdrawal-receipt');
  await shop.screenshot({ path: `${SHOTS}/68-livre-resolucao-comprovativo.png`, fullPage: true });
});
await stepShop('loja em inglês', async () => {
  await shop.goto(`${BASE}/?lang=en`); await shop.waitForSelector('html[lang="en"]');
  await shop.waitForSelector('text=Comfort for long shifts.');
  await shop.screenshot({ path: `${SHOTS}/69-loja-ingles.png` });
  await shop.goto(`${BASE}/?lang=pt`); await shop.waitForSelector('html[lang="pt-PT"]');
});
await stepShop('loja com logótipo novo', async () => {
  await shop.goto(`${BASE}/`); await shop.waitForSelector('header .logo svg');
  await shop.waitForTimeout(1500);
  await shop.screenshot({ path: `${SHOTS}/63-loja-inicio.png` });
  await shop.screenshot({ path: `${SHOTS}/63b-loja-inicio-completa.png`, fullPage: true });
});
// ---------- loja no telemóvel: fotografias de cada página para rever o aspeto ----------
const phone = await newPage({ width: 390, height: 844 }, { images: true });
for (const [name, url, wait] of [['inicio', '/', 'header'], ['loja', '/loja', '.prod'], ['categoria', '/c/calcado/socas', 'header'], ['produto', null, '.buybox, .colors, h1'],
  ['carrinho', '/carrinho', 'header'], ['checkout', '/checkout', 'header'], ['pagina', '/p/envios', 'h1'], ['livre-resolucao', '/livre-resolucao', 'h1'], ['conta', '/conta', 'header']]) {
  await stepShop(`telemóvel: ${name}`, async () => {
    if (url) await phone.goto(`${BASE}${url}`);
    else { await phone.goto(`${BASE}/loja`); await phone.locator('.prod').first().click(); await phone.waitForURL(/\/produto\//); }
    await phone.waitForSelector(wait); await phone.waitForTimeout(400);
    const over = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const wide = await phone.evaluate(() => { const el = [...document.querySelectorAll("main *, header *, footer *")].find((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(el).position !== "fixed" && !(() => { for (let a = el.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return a !== document.body && a !== document.documentElement; } return false; })()); return el ? `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} (${Math.round(el.getBoundingClientRect().right)}px)` : ""; });
    if (over > 1 || wide) problems.push(`[telemóvel ${name}] a página passa a largura do ecrã: ${wide || over + "px"}`);
    await phone.screenshot({ path: `${SHOTS}/t-${name}.png`, fullPage: true });
  });
}
await stepShop('telemóvel: menu aberto e fecha ao escolher', async () => {
  await phone.goto(`${BASE}/`); await phone.click('details.mnav > summary'); await phone.waitForTimeout(300);
  await phone.screenshot({ path: `${SHOTS}/t-menu.png` });
  await phone.locator('.mnav-panel a').first().click();
  await phone.waitForFunction(() => !document.querySelector('details.mnav[open]'), null, { timeout: 5000 });
});
await stepShop('modo de manutenção', async () => {
  await page.goto(`${BASE}/admin/configuracoes`); await settle(page);
  await page.click('button:has-text("Pôr a loja em manutenção")'); await toastOk();
  await page.waitForSelector('.a-maint-bar');
  await shot(page, '20-manutencao-backoffice', false);
  await phone.goto(`${BASE}/`); await phone.waitForSelector('.maint h1');
  await phone.screenshot({ path: `${SHOTS}/t-manutencao.png` });
  await phone.goto(`${BASE}/livre-resolucao`); await phone.waitForSelector('header .logo');      // livre resolução e páginas legais continuam abertas
  const admin = await page.context().newPage(); await admin.goto(`${BASE}/`); await admin.waitForSelector('.maint-bar'); await admin.close();
  await page.click('.a-maint-bar button:has-text("Reabrir a loja")'); await toastOk();
  await phone.goto(`${BASE}/`); await phone.waitForSelector('header .logo');
});
await stepShop('balão de ajuda aparece e fecha', async () => {
  const v = await newPage({ width: 1280, height: 800 });
  await v.goto(`${BASE}/`); await v.waitForSelector('.chat-teaser', { timeout: 10000 });
  await v.screenshot({ path: `${SHOTS}/71-balao-ajuda.png` });
  await v.click('.chat-teaser-x'); await v.waitForSelector('.chat-teaser', { state: 'detached', timeout: 3000 });
  await v.close();
});
await stepShop('campanha na página inicial (slider)', async () => {
  await shop.goto(`${BASE}/`);
  await shop.waitForSelector('.slider-faixa .slide.on >> text=Campanha de outono');
  await shop.locator('.slider-faixa').scrollIntoViewIfNeeded();
  await shop.click('.slider-faixa .slider-dots button[aria-label$=" 2"]');
  await shop.waitForSelector('.slider-faixa .slide.on >> text=Segundo diapositivo');
  await shop.click('.slider-faixa .slider-dots button[aria-label$=" 1"]');
  await shop.waitForTimeout(800);
  await shop.locator('.slider-faixa').screenshot({ path: `${SHOTS}/70-loja-campanha.png` });
});

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
