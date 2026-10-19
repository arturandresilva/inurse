import { db, count } from './api.js';
import { esc, $, $$, money, toCents, centsInput, date, dateTime, badge, ORDER_STATUS, PAY, toast, busy, emptyState, debounce, downloadCSV, confirmDialog } from './ui.js';

// ---------------- Painel ----------------
export async function dashboard(el) {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const [toPay, toShip, nCust, nProd, nOut, nCttImgs, monthOrders, recent, top, settings] = await Promise.all([
    count('orders?status=eq.pending_payment'),
    count('orders?status=in.(paid,processing)'),
    count('customers'),
    count('products?status=in.(active,out_of_stock)'),
    count('products?status=eq.out_of_stock'),
    count('product_images?url=like.*lojasonlinectt*'),
    db(`orders?select=total_cents&status=in.(paid,processing,shipped,delivered)&created_at=gte.${monthStart.toISOString()}`),
    db('orders?select=id,number,email,total_cents,status,created_at&order=created_at.desc&limit=8'),
    db('customers?select=id,name,email,legacy_total_spent_cents,legacy_total_orders&order=legacy_total_spent_cents.desc.nullslast&limit=6'),
    db('settings?select=key,value'),
  ]);
  const S = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const sales = monthOrders.reduce((a, o) => a + o.total_cents, 0);
  const shipOk = (S['public.shipping']?.zones || []).some((z) => z.price_cents > 0 || z.free_from_cents > 0);
  const steps = [
    [nProd > 0, 'Importar catálogo e clientes da Loja CTT', '#/importar'],
    [nProd > 0 && nCttImgs === 0, 'Copiar as imagens para o servidor da loja', '#/multimedia'],
    [shipOk, 'Definir portes de envio por zona', '#/configuracoes'],
    [!!S['public.payments']?.iban, 'Indicar o IBAN para transferências', '#/configuracoes'],
  ];
  const done = steps.filter((s) => s[0]).length;
  el.innerHTML = `<div class="page">
    <header class="page-head"><h1>Painel</h1></header>
    ${done < steps.length ? `<section class="card onboarding"><h2>Primeiros passos <small>${done}/${steps.length}</small></h2>
      <div class="progress"><span style="width:${(done / steps.length) * 100}%"></span></div>
      <ul class="steps">${steps.map(([ok, t, href]) => `<li class="${ok ? 'ok' : ''}"><span class="tick">${ok ? '✓' : ''}</span>${ok ? esc(t) : `<a href="${href}">${esc(t)}</a>`}</li>`).join('')}</ul></section>` : ''}
    <div class="kpis">
      <a class="kpi" href="#/encomendas/pending_payment"><span>Aguardam pagamento</span><b>${toPay}</b></a>
      <a class="kpi ${toShip ? 'hl' : ''}" href="#/encomendas/paid"><span>Por enviar</span><b>${toShip}</b></a>
      <div class="kpi"><span>Vendas este mês</span><b>${money(sales)}</b></div>
      <a class="kpi" href="#/produtos"><span>Produtos à venda</span><b>${nProd}</b><small>${nOut} esgotados</small></a>
      <a class="kpi" href="#/clientes"><span>Clientes</span><b>${nCust}</b></a>
    </div>
    <div class="grid-2 even">
      <section class="card"><h2>Últimas encomendas</h2>${recent.length ? `<table class="table compact"><tbody>${recent.map((o) => `
        <tr class="click" onclick="location.hash='#/encomenda/${o.id}'"><td>#${o.number}</td><td>${esc(o.email)}</td><td>${badge(ORDER_STATUS, o.status)}</td><td class="num">${money(o.total_cents)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="hint">Ainda sem encomendas na loja nova. As encomendas antigas continuam no backoffice dos CTT.</p>'}</section>
      <section class="card"><h2>Melhores clientes <small>histórico CTT</small></h2>${top.length ? `<table class="table compact"><tbody>${top.map((c) => `
        <tr class="click" onclick="location.hash='#/cliente/${c.id}'"><td>${esc(c.name || c.email)}</td><td class="num">${c.legacy_total_orders} enc.</td><td class="num">${money(c.legacy_total_spent_cents)}</td></tr>`).join('')}</tbody></table>` : '<p class="hint">Sem clientes.</p>'}</section>
    </div></div>`;
}

// ---------------- Encomendas ----------------
export async function orders(el, [status = '']) {
  const list = await db(`orders?select=id,number,email,total_cents,status,payment_method,created_at,shipping_address&order=created_at.desc&limit=500${status === 'paid' ? '&status=in.(paid,processing)' : status ? `&status=eq.${status}` : ''}`);
  const tabs = [['', 'Todas'], ['pending_payment', 'Aguardam pagamento'], ['paid', 'Por enviar'], ['shipped', 'Enviadas'], ['delivered', 'Entregues'], ['cancelled', 'Canceladas']];
  el.innerHTML = `<div class="page"><header class="page-head"><h1>Encomendas</h1></header>
    <div class="tabs">${tabs.map(([k, t]) => `<a href="#/encomendas${k ? `/${k}` : ''}" class="${status === k ? 'on' : ''}">${t}</a>`).join('')}</div>
    <div class="filters"><input type="search" id="q" placeholder="N.º, email ou nome…"></div>
    <div class="card flush"><table class="table"><thead><tr><th>N.º</th><th>Data</th><th>Cliente</th><th>Pagamento</th><th>Estado</th><th class="num">Total</th></tr></thead><tbody id="rows"></tbody></table></div></div>`;
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase();
    const rows = list.filter((o) => !q || String(o.number).includes(q) || o.email.toLowerCase().includes(q) || (o.shipping_address?.name || '').toLowerCase().includes(q));
    $('#rows').innerHTML = rows.map((o) => `<tr class="click" data-id="${o.id}"><td><b>#${o.number}</b></td><td>${dateTime(o.created_at)}</td>
      <td>${esc(o.shipping_address?.name || '')}<br><small>${esc(o.email)}</small></td><td>${esc(PAY[o.payment_method] || '—')}</td><td>${badge(ORDER_STATUS, o.status)}</td><td class="num">${money(o.total_cents)}</td></tr>`).join('')
      || `<tr><td colspan="6">${emptyState('Sem encomendas', 'Quando a loja nova estiver online, as encomendas aparecem aqui.')}</td></tr>`;
  };
  $('#q').addEventListener('input', debounce(draw, 150));
  $('#rows').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = `#/encomenda/${tr.dataset.id}`; });
  draw();
}

const addr = (a) => (a ? `${esc(a.name || '')}<br>${esc(a.line1 || '')} ${esc(a.line2 || '')}<br>${esc(a.zip || '')} ${esc(a.city || '')}<br>${esc(a.region || '')}${a.phone ? `<br>${esc(a.phone)}` : ''}` : '—');

export async function order(el, [id]) {
  const o = (await db(`orders?id=eq.${id}&select=*,order_items(*),payments(*),shipments(*),invoices(*)`))[0];
  if (!o) throw new Error('Encomenda não encontrada');
  const next = {
    pending_payment: [['paid', 'Marcar como paga', 'primary']],
    paid: [['processing', 'Em preparação', ''], ['shipped', 'Marcar como enviada', 'primary']],
    processing: [['shipped', 'Marcar como enviada', 'primary']],
    shipped: [['delivered', 'Marcar como entregue', 'primary']],
  }[o.status] || [];
  const ship = o.shipments.at(-1);
  el.innerHTML = `<div class="page">
    <header class="page-head"><h1><a href="#/encomendas" class="back">‹</a> Encomenda #${o.number} ${badge(ORDER_STATUS, o.status)}</h1>
      <div class="actions">${next.map(([s, t, c]) => `<button class="btn ${c}" data-s="${s}">${t}</button>`).join('')}
      ${['pending_payment', 'paid', 'processing'].includes(o.status) ? '<button class="btn danger ghost" data-s="cancelled">Cancelar</button>' : ''}</div></header>
    <div class="grid-2"><div class="col">
      <section class="card"><h2>Artigos</h2><table class="table"><thead><tr><th>Produto</th><th class="num">Qtd.</th><th class="num">Preço</th><th class="num">Total</th></tr></thead><tbody>
        ${o.order_items.map((i) => `<tr><td>${esc(i.title)}<br><small>Tam. ${esc(i.option_value || '')} · ${esc(i.sku || '')} · IVA ${Number(i.vat_rate)}%</small></td><td class="num">${i.quantity}</td><td class="num">${money(i.unit_price_cents)}</td><td class="num">${money(i.unit_price_cents * i.quantity)}</td></tr>`).join('')}
      </tbody><tfoot>
        <tr><td colspan="3">Subtotal</td><td class="num">${money(o.subtotal_cents)}</td></tr>
        ${o.discount_cents ? `<tr><td colspan="3">Desconto</td><td class="num">−${money(o.discount_cents)}</td></tr>` : ''}
        <tr><td colspan="3">Portes</td><td class="num">${money(o.shipping_cents)}</td></tr>
        <tr class="total"><td colspan="3">Total</td><td class="num">${money(o.total_cents)}</td></tr></tfoot></table></section>
      <section class="card"><h2>Envio</h2>
        ${ship ? `<p><b>${esc(ship.carrier || '')}</b> ${esc(ship.service || '')}<br>Seguimento: <b>${esc(ship.tracking_code || '—')}</b><br><small>${dateTime(ship.shipped_at)}</small></p>` : ''}
        <div class="inline-form" id="shipForm" ${['paid', 'processing'].includes(o.status) ? '' : 'hidden'}>
          <input id="carrier" placeholder="Transportadora (ex.: CTT Expresso)"><input id="tracking" placeholder="N.º de seguimento"></div>
        <p class="hint">A emissão automática de etiquetas chega na fase de integração com as transportadoras.</p></section>
      <section class="card"><h2>Notas internas</h2><textarea id="notes" rows="3">${esc(o.notes || '')}</textarea><button class="btn small" id="saveNotes">Guardar nota</button></section>
    </div><div class="col side-col">
      <section class="card"><h2>Cliente</h2><p>${esc(o.email)}${o.nif ? `<br>NIF ${esc(o.nif)}` : ''}</p>${o.customer_id ? `<a href="#/cliente/${o.customer_id}">Ver ficha</a>` : ''}</section>
      <section class="card"><h2>Morada de entrega</h2><p>${addr(o.shipping_address)}</p></section>
      ${o.billing_address ? `<section class="card"><h2>Faturação</h2><p>${addr(o.billing_address)}</p></section>` : ''}
      <section class="card"><h2>Pagamento</h2><p>${esc(PAY[o.payment_method] || '—')}${o.paid_at ? `<br>Pago em ${dateTime(o.paid_at)}` : ''}</p>
        ${o.payments.map((p) => `<p class="hint">${esc(p.provider)} · ${esc(p.reference || '')} · ${esc(p.status)}</p>`).join('')}</section>
      <section class="card"><h2>Fatura</h2>${o.invoices.length ? o.invoices.map((i) => `<p>${esc(i.number || 'pendente')} ${i.pdf_url ? `<a href="${esc(i.pdf_url)}" target="_blank" rel="noopener">PDF</a>` : ''}</p>`).join('') : '<p class="hint">Será emitida no InvoiceXpress quando a encomenda for paga (fase 3).</p>'}</section>
    </div></div></div>`;

  el.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => busy(b, async () => {
    const s = b.dataset.s; const now = new Date().toISOString();
    if (s === 'cancelled') {
      if (!confirmDialog('Cancelar a encomenda? O stock dos artigos volta a entrar.')) return;
      for (const i of o.order_items.filter((x) => x.variant_id)) {
        await db('stock_movements', { method: 'POST', body: { variant_id: i.variant_id, delta: i.quantity, reason: 'devolucao', order_id: o.id, note: `Cancelamento #${o.number}` } });
      }
    }
    if (s === 'paid') {
      await db('payments', { method: 'POST', body: { order_id: o.id, provider: 'manual', method: o.payment_method || 'transfer', amount_cents: o.total_cents, status: 'paid', paid_at: now } });
    }
    if (s === 'shipped') {
      const carrier = $('#carrier')?.value.trim(), tracking = $('#tracking')?.value.trim();
      await db('shipments', { method: 'POST', body: { order_id: o.id, carrier: carrier || null, tracking_code: tracking || null, status: 'shipped', shipped_at: now } });
    }
    await db(`orders?id=eq.${o.id}`, { method: 'PATCH', body: { status: s, ...(s === 'paid' ? { paid_at: now } : {}) } });
    toast('Encomenda atualizada.'); order(el, [id]);
  }).catch(() => {}); });
  $('#saveNotes').onclick = (e) => busy(e.currentTarget, async () => {
    await db(`orders?id=eq.${o.id}`, { method: 'PATCH', body: { notes: $('#notes').value } }); toast('Nota guardada.');
  }).catch(() => {});
}

// ---------------- Clientes ----------------
export async function customers(el) {
  const list = await db('customers?select=id,name,email,company,nif,phone,newsletter,legacy_total_spent_cents,legacy_total_orders,created_at,addresses(city,region,kind)&order=created_at.desc');
  el.innerHTML = `<div class="page"><header class="page-head"><h1>Clientes <small>${list.length}</small></h1>
    <div class="actions"><button class="btn" id="exp">Exportar CSV</button><button class="btn primary" id="new">Novo cliente</button></div></header>
    <div class="filters"><input type="search" id="q" placeholder="Nome, email, NIF, telefone, localidade…">
      <select id="fn"><option value="">Todos</option><option value="news">Aceitam newsletter</option><option value="nif">Com NIF</option><option value="buy">Já compraram</option></select>
      <select id="so"><option value="recent">Mais recentes</option><option value="spent">Maior valor gasto</option><option value="name">Nome A–Z</option></select></div>
    <div class="card flush"><table class="table"><thead><tr><th>Cliente</th><th>Localidade</th><th>NIF</th><th class="num">Encomendas</th><th class="num">Total gasto</th><th>Desde</th></tr></thead><tbody id="rows"></tbody></table></div></div>`;
  let shown = [];
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase(), fn = $('#fn').value, so = $('#so').value;
    shown = list.filter((c) => (!q || [c.name, c.email, c.nif, c.phone, c.company, ...c.addresses.map((a) => a.city)].some((v) => (v || '').toLowerCase().includes(q))) &&
      (!fn || (fn === 'news' ? c.newsletter : fn === 'nif' ? c.nif : c.legacy_total_orders > 0)));
    if (so === 'spent') shown.sort((a, b) => (b.legacy_total_spent_cents || 0) - (a.legacy_total_spent_cents || 0));
    if (so === 'name') shown.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'pt'));
    $('#rows').innerHTML = shown.slice(0, 400).map((c) => {
      const city = c.addresses.find((a) => a.kind === 'delivery') || c.addresses[0];
      return `<tr class="click" data-id="${c.id}"><td><b>${esc(c.name || '—')}</b>${c.newsletter ? ' <span class="badge info" title="Aceita newsletter">✉</span>' : ''}<br><small>${esc(c.email)}</small></td>
      <td>${esc(city?.city || '')}${city?.region && city.region !== 'Continente' ? ` <small>(${esc(city.region)})</small>` : ''}</td><td>${esc(c.nif || '')}</td>
      <td class="num">${c.legacy_total_orders || 0}</td><td class="num">${money(c.legacy_total_spent_cents || 0)}</td><td>${date(c.created_at)}</td></tr>`;
    }).join('') || `<tr><td colspan="6">${emptyState('Sem clientes', list.length ? 'Nenhum cliente corresponde à pesquisa.' : 'Importa os clientes da Loja CTT.', list.length ? '' : '<a class="btn primary" href="#/importar">Importar</a>')}</td></tr>`;
  };
  $('#q').addEventListener('input', debounce(draw, 150));
  ['#fn', '#so'].forEach((s) => $(s).addEventListener('change', draw));
  $('#rows').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = `#/cliente/${tr.dataset.id}`; });
  $('#new').onclick = () => { location.hash = '#/cliente/novo'; };
  $('#exp').onclick = () => downloadCSV('clientes-inurse.csv', [['Nome', 'Email', 'Empresa', 'NIF', 'Telefone', 'Newsletter', 'Encomendas', 'Total gasto', 'Desde'],
    ...shown.map((c) => [c.name, c.email, c.company, c.nif, c.phone, c.newsletter ? 'sim' : 'não', c.legacy_total_orders, ((c.legacy_total_spent_cents || 0) / 100).toFixed(2).replace('.', ','), date(c.created_at)])]);
  draw();
}

export async function customer(el, [id]) {
  const isNew = id === 'novo';
  const c = isNew ? { email: '', name: '', company: '', nif: '', phone: '', newsletter: false, internal_notes: '', addresses: [], orders: [] }
    : (await db(`customers?id=eq.${id}&select=*,addresses(*),orders(id,number,status,total_cents,created_at)`))[0];
  if (!c) throw new Error('Cliente não encontrado');
  const ad = (k) => c.addresses.find((a) => a.kind === k) || {};
  const addrForm = (k, t) => { const a = ad(k); return `<section class="card"><h2>${t}</h2>
    <div class="form-grid" data-k="${k}">
      <label>Nome<input name="name" value="${esc(a.name || '')}"></label><label>Telefone<input name="phone" value="${esc(a.phone || '')}"></label>
      <label class="span2">Morada<input name="line1" value="${esc(a.line1 || '')}"></label><label class="span2">Complemento<input name="line2" value="${esc(a.line2 || '')}"></label>
      <label>Código postal<input name="zip" value="${esc(a.zip || '')}" placeholder="0000-000"></label><label>Localidade<input name="city" value="${esc(a.city || '')}"></label>
      <label>Zona<select name="region">${['Continente', 'Açores', 'Madeira'].map((r) => `<option ${a.region === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    </div></section>`; };
  el.innerHTML = `<div class="page"><header class="page-head"><h1><a href="#/clientes" class="back">‹</a> ${isNew ? 'Novo cliente' : esc(c.name || c.email)}</h1>
    <div class="actions"><button class="btn primary" id="save">Guardar</button></div></header>
    <div class="grid-2"><div class="col">
      <section class="card"><h2>Dados</h2><div class="form-grid">
        <label>Nome<input id="name" value="${esc(c.name || '')}"></label><label>Email<input id="email" type="email" value="${esc(c.email)}"></label>
        <label>Empresa<input id="company" value="${esc(c.company || '')}"></label><label>NIF<input id="nif" value="${esc(c.nif || '')}"></label>
        <label>Telefone<input id="phone" value="${esc(c.phone || '')}"></label><label class="check"><input type="checkbox" id="news" ${c.newsletter ? 'checked' : ''}> Aceita receber newsletter</label>
      </div></section>
      ${addrForm('delivery', 'Morada de entrega')}${addrForm('billing', 'Morada de faturação')}
    </div><div class="col side-col">
      ${!isNew ? `<section class="card"><h2>Histórico</h2><p>Na Loja CTT: <b>${c.legacy_total_orders || 0}</b> encomendas · <b>${money(c.legacy_total_spent_cents || 0)}</b></p><p class="hint">Cliente desde ${date(c.created_at)}</p>
        ${c.orders.length ? `<table class="table compact">${c.orders.map((o) => `<tr class="click" onclick="location.hash='#/encomenda/${o.id}'"><td>#${o.number}</td><td>${badge(ORDER_STATUS, o.status)}</td><td class="num">${money(o.total_cents)}</td></tr>`).join('')}</table>` : ''}</section>` : ''}
      <section class="card"><h2>Notas internas</h2><textarea id="notes" rows="5" placeholder="Só tu vês isto.">${esc(c.internal_notes || '')}</textarea></section>
    </div></div></div>`;
  $('#save').onclick = (e) => busy(e.currentTarget, async () => {
    const email = $('#email').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email inválido.');
    const body = { email, name: $('#name').value.trim() || null, company: $('#company').value.trim() || null, nif: $('#nif').value.trim() || null,
      phone: $('#phone').value.trim() || null, newsletter: $('#news').checked, internal_notes: $('#notes').value || null };
    let cid = c.id;
    if (isNew) cid = (await db('customers', { method: 'POST', body, prefer: 'return=representation' }))[0].id;
    else await db(`customers?id=eq.${cid}`, { method: 'PATCH', body });
    for (const box of $$('[data-k]')) {
      const k = box.dataset.k; const data = Object.fromEntries($$('input,select', box).map((i) => [i.name, i.value.trim() || null]));
      const has = ['line1', 'zip', 'city'].some((f) => data[f]);
      const old = ad(k);
      if (old.id) await db(`addresses?id=eq.${old.id}`, { method: 'PATCH', body: data });
      else if (has) await db('addresses', { method: 'POST', body: { ...data, kind: k, customer_id: cid, country_code: 'PT' } });
    }
    toast('Cliente guardado.');
    if (isNew) location.hash = `#/cliente/${cid}`; else customer(el, [cid]);
  }).catch(() => {});
}

// ---------------- Promoções ----------------
const KIND = { percent: 'Percentagem', fixed: 'Valor fixo', free_shipping: 'Portes grátis' };
export async function promotions(el) {
  const list = await db('promotions?select=*&order=created_at.desc');
  const fmtVal = (p) => (p.kind === 'percent' ? `${Number(p.value)}%` : p.kind === 'fixed' ? money(Math.round(p.value * 100)) : '—');
  const live = (p) => p.active && (!p.starts_at || new Date(p.starts_at) <= new Date()) && (!p.ends_at || new Date(p.ends_at) >= new Date()) && (!p.max_uses || p.uses < p.max_uses);
  el.innerHTML = `<div class="page"><header class="page-head"><h1>Promoções</h1><div class="actions"><button class="btn primary" id="new">Nova promoção</button></div></header>
    <section class="card" id="form" hidden></section>
    <div class="card flush"><table class="table"><thead><tr><th>Promoção</th><th>Código</th><th>Tipo</th><th class="num">Valor</th><th>Validade</th><th class="num">Usos</th><th>Estado</th></tr></thead><tbody>
    ${list.map((p) => `<tr class="click" data-id="${p.id}"><td><b>${esc(p.name)}</b></td><td><code>${esc(p.code || 'automática')}</code></td><td>${KIND[p.kind]}</td><td class="num">${fmtVal(p)}</td>
      <td>${p.starts_at || p.ends_at ? `${date(p.starts_at)} – ${date(p.ends_at)}` : 'Sempre'}</td><td class="num">${p.uses}${p.max_uses ? `/${p.max_uses}` : ''}</td>
      <td>${live(p) ? '<span class="badge ok">Ativa</span>' : '<span class="badge muted">Inativa</span>'}</td></tr>`).join('') || `<tr><td colspan="7">${emptyState('Sem promoções', 'Cria cupões de desconto (ex.: BEMVINDA10) ou portes grátis.')}</td></tr>`}
    </tbody></table></div>
    <p class="hint">Os cupões aplicam-se no checkout da loja nova (fase 2).</p></div>`;
  const toDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
  const open = (p = { name: '', code: '', kind: 'percent', value: 10, min_order_cents: 0, active: true }) => {
    const f = $('#form'); f.hidden = false;
    f.innerHTML = `<h2>${p.id ? 'Editar promoção' : 'Nova promoção'}</h2><div class="form-grid">
      <label>Nome<input id="pName" value="${esc(p.name)}" placeholder="ex.: Dia do Enfermeiro"></label>
      <label>Código<input id="pCode" value="${esc(p.code || '')}" placeholder="vazio = automática" style="text-transform:uppercase"></label>
      <label>Tipo<select id="pKind">${Object.entries(KIND).map(([k, t]) => `<option value="${k}" ${p.kind === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Valor <small id="pUnit"></small><input id="pVal" value="${p.kind === 'fixed' ? centsInput(Math.round(p.value * 100)) : Number(p.value)}" inputmode="decimal"></label>
      <label>Compra mínima €<input id="pMin" value="${centsInput(p.min_order_cents)}" inputmode="decimal"></label>
      <label>Máximo de usos<input id="pMax" type="number" min="1" value="${p.max_uses ?? ''}" placeholder="sem limite"></label>
      <label>Início<input id="pStart" type="date" value="${toDate(p.starts_at)}"></label><label>Fim<input id="pEnd" type="date" value="${toDate(p.ends_at)}"></label>
      <label class="check"><input type="checkbox" id="pAct" ${p.active ? 'checked' : ''}> Ativa</label></div>
      <div class="row-actions"><button class="btn primary" id="pSave">Guardar</button><button class="btn ghost" id="pCancel">Fechar</button>
      ${p.id ? '<button class="btn danger ghost" id="pDel">Apagar</button>' : ''}</div>`;
    const unit = () => { $('#pUnit').textContent = { percent: '(%)', fixed: '(€)', free_shipping: '' }[$('#pKind').value]; $('#pVal').disabled = $('#pKind').value === 'free_shipping'; };
    $('#pKind').onchange = unit; unit();
    $('#pCancel').onclick = () => { f.hidden = true; };
    if ($('#pDel')) $('#pDel').onclick = (e) => busy(e.currentTarget, async () => { if (confirmDialog('Apagar promoção?')) { await db(`promotions?id=eq.${p.id}`, { method: 'DELETE' }); promotions(el); } }).catch(() => {});
    $('#pSave').onclick = (e) => busy(e.currentTarget, async () => {
      const kind = $('#pKind').value; const raw = String($('#pVal').value).replace(',', '.');
      const value = kind === 'free_shipping' ? 0 : Number(raw);
      if (!$('#pName').value.trim()) throw new Error('Dá um nome à promoção.');
      if (kind !== 'free_shipping' && !(value > 0)) throw new Error('Valor inválido.');
      if (kind === 'percent' && value > 100) throw new Error('A percentagem não pode passar de 100.');
      const body = { name: $('#pName').value.trim(), code: $('#pCode').value.trim().toUpperCase() || null, kind, value,
        min_order_cents: toCents($('#pMin').value || '0') || 0, max_uses: $('#pMax').value ? Number($('#pMax').value) : null,
        starts_at: $('#pStart').value ? new Date(`${$('#pStart').value}T00:00:00`).toISOString() : null,
        ends_at: $('#pEnd').value ? new Date(`${$('#pEnd').value}T23:59:59`).toISOString() : null, active: $('#pAct').checked };
      if (p.id) await db(`promotions?id=eq.${p.id}`, { method: 'PATCH', body }); else await db('promotions', { method: 'POST', body });
      toast('Promoção guardada.'); promotions(el);
    }).catch(() => {});
    f.scrollIntoView({ behavior: 'smooth' });
  };
  $('#new').onclick = () => open();
  el.querySelector('tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) open(list.find((p) => p.id === tr.dataset.id)); });
}
