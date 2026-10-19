import { db, rpc, count, callFunction, updatePassword, getSession } from './api.js';
import { esc, $, $$, money, toCents, centsInput, toast, busy } from './ui.js';
import { readExports } from './ctt.js';

// ---------------- Importar da Loja CTT ----------------
export async function importer(el) {
  const [np, nc] = await Promise.all([count('products'), count('customers')]);
  el.innerHTML = `<div class="page"><header class="page-head"><h1>Importar da Loja CTT</h1></header>
    <section class="card">
      <p>No backoffice dos CTT exporta <b>Produtos</b> e <b>Clientes</b> e larga aqui os ficheiros (ZIP ou CSV, podes largar os dois de uma vez).</p>
      <ul class="hint-list"><li>Podes repetir a importação as vezes que quiseres: atualiza nomes, descrições, preços e categorias e acrescenta clientes novos.</li>
        <li><b>O stock nunca é alterado</b> pela importação, e as imagens já copiadas mantêm-se.</li>
        <li>Neste momento existem ${np} produtos e ${nc} clientes na loja nova.</li></ul>
      <label class="drop" id="drop"><input type="file" id="files" accept=".zip,.csv" multiple hidden>
        <b>Larga aqui os ficheiros</b><span>ou clica para escolher</span></label>
      <div id="preview"></div>
    </section></div>`;
  const drop = $('#drop');
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); handle(e.dataTransfer.files); });
  $('#files').addEventListener('change', (e) => handle(e.target.files));

  async function handle(files) {
    const pv = $('#preview');
    pv.innerHTML = '<p class="hint"><span class="spin"></span> A ler ficheiros…</p>';
    let data;
    try { data = await readExports([...files]); } catch (e) { pv.innerHTML = `<div class="alert err">${esc(e.message)}</div>`; return; }
    if (!data.produtos && !data.clientes) { pv.innerHTML = '<div class="alert err">Não encontrei exportações de produtos nem de clientes nestes ficheiros.</div>'; return; }
    const nVar = data.produtos?.reduce((a, p) => a + p.v.length, 0) || 0, nImg = data.produtos?.reduce((a, p) => a + p.i.length, 0) || 0;
    pv.innerHTML = `<div class="import-sum">
      ${data.produtos ? `<div><b>${data.produtos.length}</b> produtos · ${nVar} tamanhos · ${nImg} imagens</div>` : ''}
      ${data.clientes ? `<div><b>${data.clientes.length}</b> clientes</div>` : ''}</div>
      <button class="btn primary" id="go">Importar agora</button><div class="progress" hidden><span></span></div><p class="hint" id="status"></p>`;
    $('#go').onclick = (e) => busy(e.currentTarget, async () => {
      const bar = $('#preview .progress'); bar.hidden = false;
      const jobs = [];
      for (let i = 0; i < (data.produtos?.length || 0); i += 15) jobs.push(['import_catalog', data.produtos.slice(i, i + 15)]);
      for (let i = 0; i < (data.clientes?.length || 0); i += 80) jobs.push(['import_customers', data.clientes.slice(i, i + 80)]);
      const tot = { produtos: [0, 0], clientes: [0, 0] };
      for (const [k, [fn, items]] of jobs.entries()) {
        $('#status').textContent = `A importar ${fn === 'import_catalog' ? 'produtos' : 'clientes'}… (${k + 1}/${jobs.length})`;
        const r = await rpc(fn, { items });
        const t = tot[fn === 'import_catalog' ? 'produtos' : 'clientes']; t[0] += r.criados; t[1] += r.atualizados;
        bar.firstElementChild.style.width = `${((k + 1) / jobs.length) * 100}%`;
      }
      $('#status').innerHTML = `<b>Importação concluída.</b> Produtos: ${tot.produtos[0]} novos, ${tot.produtos[1]} atualizados. Clientes: ${tot.clientes[0]} novos, ${tot.clientes[1]} atualizados.
        <br><a href="#/multimedia">Passo seguinte: copiar as imagens →</a>`;
      $('#go').remove();
      toast('Importação concluída.');
    }).catch((err) => { $('#status').innerHTML = `<span class="neg">Falhou: ${esc(err.message)}</span> — podes tentar de novo, não duplica nada.`; });
  }
}

// ---------------- Multimédia ----------------
export async function media(el) {
  const [total, ctt] = await Promise.all([count('product_images'), count('product_images?url=like.*lojasonlinectt*')]);
  const recent = await db('product_images?select=url,product_id,products(title)&order=id.desc&limit=24');
  el.innerHTML = `<div class="page"><header class="page-head"><h1>Multimédia</h1></header>
    <section class="card"><h2>Imagens dos produtos</h2>
      <p><b>${total}</b> imagens no total · <b>${total - ctt}</b> já no servidor da loja · <b class="${ctt ? 'warn' : ''}">${ctt}</b> ainda no servidor dos CTT</p>
      ${ctt ? `<div class="alert warn">Estas ${ctt} imagens ainda estão alojadas nos CTT e desaparecem quando cancelares a loja de lá. Copia-as agora.</div>
        <button class="btn primary" id="copy">Copiar imagens dos CTT</button><div class="progress" hidden><span></span></div><p class="hint" id="cstatus"></p>`
        : total ? '<div class="alert ok">Todas as imagens estão no servidor da loja.</div>' : '<p class="hint">Sem imagens. Importa primeiro o catálogo.</p>'}
    </section>
    ${recent.length ? `<section class="card"><h2>Algumas imagens</h2><div class="img-grid small">${recent.map((r) => `<a href="#/produto/${r.product_id}" title="${esc(r.products?.title || '')}"><img src="${esc(r.url)}" loading="lazy" alt=""></a>`).join('')}</div></section>` : ''}
    <p class="hint">Para trocar ou acrescentar imagens de um produto, abre a ficha do produto.</p></div>`;
  if (!ctt) return;
  $('#copy').onclick = (e) => busy(e.currentTarget, async () => {
    const bar = $('.progress'); bar.hidden = false; const start = ctt; let failed = [];
    for (;;) {
      const r = await callFunction('copiar-imagens', { limit: 20 });
      if (r.error) throw new Error(r.error);
      failed = failed.concat(r.failed);
      bar.firstElementChild.style.width = `${((start - r.remaining) / start) * 100}%`;
      $('#cstatus').textContent = `${start - r.remaining} de ${start} copiadas…`;
      if (!r.remaining || r.copied === 0) break;
    }
    toast('Cópia concluída.');
    $('#cstatus').innerHTML = failed.length ? `<span class="neg">${failed.length} imagens falharam:</span><br><small>${failed.slice(0, 10).map(esc).join('<br>')}</small>` : 'Todas copiadas.';
    setTimeout(() => media(el), failed.length ? 6000 : 1500);
  }).catch(() => {});
}

// ---------------- Configurações ----------------
export async function settings(el, [sub]) {
  const rows = await db('settings?select=key,value');
  const S = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const store = S['public.store'] || {}, ship = S['public.shipping'] || { zones: [] }, pay = S['public.payments'] || {}, inv = S.invoicing || {};
  const admins = await db('admin_invites?select=email');
  el.innerHTML = `<div class="page"><header class="page-head"><h1>Configurações</h1><div class="actions"><button class="btn primary" id="save">Guardar</button></div></header>
    <div class="grid-2 even"><div class="col">
    <section class="card"><h2>Loja</h2><div class="form-grid">
      <label>Nome<input id="sName" value="${esc(store.name || '')}"></label><label>Domínio<input id="sDomain" value="${esc(store.domain || '')}"></label>
      <label>Email de contacto<input id="sEmail" type="email" value="${esc(store.email || '')}"></label><label>Telefone<input id="sPhone" value="${esc(store.phone || '')}"></label>
      <label class="span2">Nome da empresa / NIF (aparece no rodapé)<input id="sCompany" value="${esc(store.company || '')}"></label></div></section>
    <section class="card"><h2>Portes de envio</h2><p class="hint">Preço com IVA. "Grátis a partir de" vazio = nunca grátis.</p>
      <table class="table edit"><thead><tr><th>Zona</th><th>Portes €</th><th>Grátis a partir de €</th></tr></thead><tbody>
      ${['Continente', 'Açores', 'Madeira'].map((r) => { const z = ship.zones.find((x) => x.region === r) || {}; return `<tr data-r="${r}"><td>${r}</td>
        <td><input class="zp money" value="${centsInput(z.price_cents ?? 0)}" inputmode="decimal"></td><td><input class="zf money" value="${z.free_from_cents ? centsInput(z.free_from_cents) : ''}" inputmode="decimal" placeholder="—"></td></tr>`; }).join('')}
      </tbody></table></section>
    </div><div class="col">
    <section class="card"><h2>Pagamentos</h2>
      <label class="check"><input type="checkbox" id="pMb" ${pay.mbway !== false ? 'checked' : ''}> MB WAY</label>
      <label class="check"><input type="checkbox" id="pMul" ${pay.multibanco !== false ? 'checked' : ''}> Multibanco (referência)</label>
      <label class="check"><input type="checkbox" id="pTr" ${pay.transfer !== false ? 'checked' : ''}> Transferência bancária</label>
      <label>IBAN para transferências<input id="pIban" value="${esc(pay.iban || '')}" placeholder="PT50 …"></label>
      <p class="hint">MB WAY e Multibanco automáticos ligam-se a um gateway (ifthenpay ou Eupago) na fase 2.</p></section>
    <section class="card"><h2>Faturação</h2>
      <label>Conta InvoiceXpress <small>(o nome antes de .app.invoicexpress.com)</small><input id="iAcc" value="${esc(inv.account || '')}"></label>
      <label class="check"><input type="checkbox" id="iAuto" ${inv.auto_invoice !== false ? 'checked' : ''}> Emitir fatura-recibo automaticamente quando a encomenda é paga</label>
      <p class="hint">A chave da API não fica guardada aqui: vai para um cofre seguro do servidor quando ligarmos a faturação (fase 3).</p></section>
    <section class="card"><h2>A minha conta</h2><p class="hint">${esc(getSession()?.email || '')}</p>
      <div class="inline-form"><input type="password" id="newPw" placeholder="Nova palavra-passe (mín. 8)" minlength="8" autocomplete="new-password"><button class="btn" id="pw">Alterar</button></div></section>
    <section class="card"><h2>Administradores</h2><p class="hint">Estes emails passam a administradores quando criarem conta no backoffice.</p>
      <ul class="plain">${admins.map((a) => `<li>${esc(a.email)}</li>`).join('')}</ul>
      <div class="inline-form"><input type="email" id="newAdm" placeholder="email@exemplo.pt"><button class="btn" id="addAdm">Adicionar</button></div></section>
    </div></div></div>`;
  if (sub === 'conta') $('#newPw').focus();
  $('#save').onclick = (e) => busy(e.currentTarget, async () => {
    const zones = $$('[data-r]').map((tr) => {
      const p = toCents($('.zp', tr).value || '0'), f = $('.zf', tr).value.trim() ? toCents($('.zf', tr).value) : 0;
      if (p == null || p < 0 || f == null) throw new Error(`Valor inválido nos portes (${tr.dataset.r}).`);
      return { region: tr.dataset.r, price_cents: p, free_from_cents: f };
    });
    const iban = $('#pIban').value.replace(/\s/g, '').toUpperCase();
    if (iban && !/^PT50\d{21}$/.test(iban)) throw new Error('O IBAN português tem o formato PT50 seguido de 21 dígitos.');
    const up = (key, value) => db('settings', { method: 'POST', body: { key, value, updated_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates' });
    await Promise.all([
      up('public.store', { name: $('#sName').value.trim(), domain: $('#sDomain').value.trim(), email: $('#sEmail').value.trim(), phone: $('#sPhone').value.trim(), company: $('#sCompany').value.trim() }),
      up('public.shipping', { zones }),
      up('public.payments', { mbway: $('#pMb').checked, multibanco: $('#pMul').checked, transfer: $('#pTr').checked, iban }),
      up('invoicing', { provider: 'invoicexpress', account: $('#iAcc').value.trim(), auto_invoice: $('#iAuto').checked }),
    ]);
    toast('Configurações guardadas.');
    settings(el, []);
  }).catch(() => {});
  $('#pw').onclick = (e) => busy(e.currentTarget, async () => {
    if ($('#newPw').value.length < 8) throw new Error('A palavra-passe precisa de pelo menos 8 caracteres.');
    await updatePassword($('#newPw').value); $('#newPw').value = ''; toast('Palavra-passe alterada.');
  }).catch(() => {});
  $('#addAdm').onclick = (e) => busy(e.currentTarget, async () => {
    const em = $('#newAdm').value.trim().toLowerCase(); if (!em.includes('@')) throw new Error('Email inválido.');
    await db('admin_invites', { method: 'POST', body: { email: em }, prefer: 'resolution=ignore-duplicates' }); toast('Administrador adicionado.'); settings(el, []);
  }).catch(() => {});
}
