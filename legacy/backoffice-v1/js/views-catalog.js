import { db, rpc, uploadImage } from './api.js';
import { esc, $, $$, money, toCents, centsInput, dateTime, badge, PRODUCT_STATUS, toast, busy, emptyState, debounce, pref, confirmDialog } from './ui.js';
import { slugify } from './ctt.js';

const thumb = (imgs) => {
  const u = [...(imgs || [])].sort((a, b) => a.position - b.position)[0]?.url;
  return u ? `<img class="thumb" src="${esc(u)}" alt="" loading="lazy">` : '<span class="thumb none"></span>';
};
const stockSum = (vs) => {
  const act = vs.filter((v) => v.active);
  if (!act.length) return { txt: '—', cls: 'muted' };
  if (act.every((v) => v.stock == null)) return { txt: 'Fornecedor', cls: 'muted' };
  const s = act.reduce((a, v) => a + Math.max(v.stock || 0, 0), 0);
  const missing = act.filter((v) => v.stock == null).length;
  return { txt: `${s}${missing ? ` <small>(+${missing} sem controlo)</small>` : ''}`, cls: s === 0 ? 'warn' : '' };
};
const priceRange = (vs) => {
  const p = vs.filter((v) => v.active).map((v) => v.price_cents);
  if (!p.length) return '—';
  const mn = Math.min(...p), mx = Math.max(...p);
  return mn === mx ? money(mn) : `${money(mn)} – ${money(mx)}`;
};

async function loadLookups() {
  const [cats, brands] = await Promise.all([
    db('categories?select=id,name,parent_id,path,position&order=path'),
    db('brands?select=id,name&order=name'),
  ]);
  return { cats, brands };
}
const catLabel = (c) => c.path.split('>').slice(1).join(' › ') || c.name;

// ---------------- Lista de produtos ----------------
export async function products(el) {
  const [{ cats, brands }, list] = await Promise.all([
    loadLookups(),
    db('products?select=id,title,handle,status,featured,brand_id,product_images(url,position),variants(price_cents,stock,active),product_categories(category_id)&order=position,title'),
  ]);
  const f = pref.get('prodFilter', { q: '', status: '', brand: '', cat: '' });
  el.innerHTML = `<div class="page">
    <header class="page-head"><h1>Produtos <small>${list.length}</small></h1>
      <div class="actions"><a class="btn primary" href="#/produto/novo">Novo produto</a></div></header>
    <div class="filters">
      <input type="search" id="q" placeholder="Pesquisar nome ou referência…" value="${esc(f.q)}">
      <select id="fs"><option value="">Todos os estados</option>${Object.entries(PRODUCT_STATUS).map(([k, [t]]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select id="fb"><option value="">Todas as marcas</option>${brands.map((b) => `<option value="${b.id}" ${f.brand === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
      <select id="fc"><option value="">Todas as categorias</option>${cats.map((c) => `<option value="${c.id}" ${f.cat === c.id ? 'selected' : ''}>${esc(c.path.replace(/>/g, ' › '))}</option>`).join('')}</select>
    </div>
    <div class="card flush"><table class="table"><thead><tr><th></th><th>Produto</th><th>Marca</th><th>Estado</th><th class="num">Stock</th><th class="num">Preço</th></tr></thead><tbody id="rows"></tbody></table></div>
  </div>`;
  const bname = Object.fromEntries(brands.map((b) => [b.id, b.name]));
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase(), st = $('#fs').value, br = $('#fb').value, ct = $('#fc').value;
    pref.set('prodFilter', { q, status: st, brand: br, cat: ct });
    const rows = list.filter((p) => (!q || p.title.toLowerCase().includes(q) || p.handle.includes(q)) && (!st || p.status === st) &&
      (!br || p.brand_id === br) && (!ct || p.product_categories.some((x) => x.category_id === ct)));
    $('#rows').innerHTML = rows.length ? rows.map((p) => {
      const s = stockSum(p.variants);
      return `<tr class="click" data-id="${p.id}"><td>${thumb(p.product_images)}</td><td><b>${esc(p.title)}</b>${p.featured ? ' <span class="badge info">Destaque</span>' : ''}</td>
        <td>${esc(bname[p.brand_id] || '')}</td><td>${badge(PRODUCT_STATUS, p.status)}</td><td class="num ${s.cls}">${s.txt}</td><td class="num">${priceRange(p.variants)}</td></tr>`;
    }).join('') : `<tr><td colspan="6">${list.length ? emptyState('Sem resultados', 'Nenhum produto corresponde aos filtros.') : emptyState('Ainda não há produtos', 'Importa o catálogo da Loja CTT ou cria o primeiro produto.', '<a class="btn primary" href="#/importar">Importar da Loja CTT</a>')}</td></tr>`;
  };
  $('#q').addEventListener('input', debounce(draw, 150));
  ['#fs', '#fb', '#fc'].forEach((s) => $(s).addEventListener('change', draw));
  $('#rows').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = `#/produto/${tr.dataset.id}`; });
  draw();
}

// ---------------- Ficha de produto ----------------
export async function product(el, [id]) {
  const isNew = id === 'novo';
  const { cats, brands } = await loadLookups();
  const p = isNew
    ? { title: '', handle: '', excerpt: '', description_html: '', brand_id: null, status: 'draft', vat_rate: 23, featured: false, weight_g: null,
      seo_title: '', seo_description: '', option_name: 'Tamanho', variants: [], product_images: [], product_categories: [] }
    : (await db(`products?id=eq.${id}&select=*,variants(*),product_images(*),product_categories(category_id)`))[0];
  if (!p) throw new Error('Produto não encontrado');
  p.variants.sort((a, b) => a.position - b.position);
  p.product_images.sort((a, b) => a.position - b.position);
  const moves = isNew || !p.variants.length ? [] : await db(`stock_movements?variant_id=in.(${p.variants.map((v) => v.id).join(',')})&select=*&order=created_at.desc&limit=30`);
  const vName = Object.fromEntries(p.variants.map((v) => [v.id, v.option_value]));
  const selCats = new Set(p.product_categories.map((x) => x.category_id));
  let images = p.product_images.map((i) => ({ ...i }));
  const removedImages = [];
  const REASON = { entrada: 'Entrada', venda: 'Venda', devolucao: 'Devolução', ajuste: 'Ajuste', contagem: 'Contagem' };

  const varRow = (v, i) => `<tr data-i="${i}">
    <td><input class="sz" value="${esc(v.option_value)}" ${v.id ? 'readonly title="O tamanho não se altera depois de criado"' : ''} placeholder="ex.: 38"></td>
    <td><input class="sku" value="${esc(v.sku || '')}"></td>
    <td><input class="price money" value="${centsInput(v.price_cents)}" inputmode="decimal"></td>
    <td><input class="cmp money" value="${centsInput(v.compare_at_cents)}" inputmode="decimal" placeholder="—"></td>
    <td><input class="stk" type="number" min="0" step="1" value="${v.stock ?? ''}" placeholder="—"></td>
    <td class="center"><input class="act" type="checkbox" ${v.active !== false ? 'checked' : ''}></td>
    <td>${v.id ? '' : '<button class="icon-btn rm" title="Remover">✕</button>'}</td></tr>`;

  el.innerHTML = `<div class="page">
    <header class="page-head"><h1><a href="#/produtos" class="back">‹</a> ${isNew ? 'Novo produto' : esc(p.title)}</h1>
      <div class="actions"><button class="btn primary" id="save">Guardar</button></div></header>
    <div class="grid-2">
      <div class="col">
        <section class="card"><h2>Informação</h2>
          <label>Nome<input id="title" value="${esc(p.title)}" required></label>
          <label>Endereço (URL)<div class="prefix"><span>/produto/</span><input id="handle" value="${esc(p.handle)}"></div></label>
          <label>Resumo<input id="excerpt" value="${esc(p.excerpt || '')}"></label>
          <label>Descrição <small>(HTML)</small><textarea id="desc" rows="8">${esc(p.description_html || '')}</textarea></label>
          <details><summary>Pré-visualizar descrição</summary><div class="preview" id="preview"></div></details>
        </section>
        <section class="card"><h2>Tamanhos, preços e stock</h2>
          <p class="hint">Preços com IVA incluído (é o preço que o cliente vê). Stock opcional: deixa vazio para vender sempre (envio direto do fornecedor); se escreveres uma quantidade, passa a ser controlado.</p>
          <div class="scroll-x"><table class="table edit"><thead><tr><th>${esc(p.option_name || 'Tamanho')}</th><th>Referência</th><th>Preço €</th><th>Preço antes €</th><th>Stock</th><th>Ativo</th><th></th></tr></thead>
          <tbody id="vars">${p.variants.map(varRow).join('')}</tbody></table></div>
          <div class="row-actions"><button class="btn small" id="addVar">+ Tamanho</button>
            <button class="btn small ghost" id="samePrice">Aplicar 1.º preço a todos</button></div>
        </section>
        <section class="card"><h2>Imagens</h2>
          <div class="img-grid" id="imgs"></div>
          <label class="btn small upload">Carregar imagens<input type="file" id="upl" accept="image/*" multiple hidden></label>
          ${isNew ? '<p class="hint">Guarda o produto primeiro para poderes carregar imagens.</p>' : ''}
        </section>
        ${moves.length ? `<section class="card"><h2>Histórico de stock</h2><table class="table compact"><thead><tr><th>Data</th><th>Tamanho</th><th>Motivo</th><th class="num">Movimento</th><th>Nota</th></tr></thead><tbody>
          ${moves.map((m) => `<tr><td>${dateTime(m.created_at)}</td><td>${esc(vName[m.variant_id])}</td><td>${REASON[m.reason]}</td><td class="num ${m.delta < 0 ? 'neg' : 'pos'}">${m.delta > 0 ? '+' : ''}${m.delta}</td><td>${esc(m.note || '')}</td></tr>`).join('')}
        </tbody></table></section>` : ''}
      </div>
      <div class="col side-col">
        <section class="card"><h2>Estado</h2>
          <select id="status">${Object.entries(PRODUCT_STATUS).map(([k, [t]]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <p class="hint">Usa "Esgotado" para deixar de vender um produto que o fornecedor não tem. Se controlares stock, muda sozinho.</p>
          <label class="check"><input type="checkbox" id="featured" ${p.featured ? 'checked' : ''}> Produto em destaque</label>
        </section>
        <section class="card"><h2>Organização</h2>
          <label>Marca<select id="brand"><option value="">—</option>${brands.map((b) => `<option value="${b.id}" ${p.brand_id === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
          <label>IVA<select id="vat">${[23, 13, 6, 0].map((v) => `<option value="${v}" ${Number(p.vat_rate) === v ? 'selected' : ''}>${v}%</option>`).join('')}</select></label>
          <label>Peso (g)<input id="weight" type="number" min="0" value="${p.weight_g ?? ''}"></label>
          <div class="label">Categorias</div>
          <div class="cat-list">${cats.map((c) => `<label class="check lvl${c.path.split('>').length}"><input type="checkbox" value="${c.id}" ${selCats.has(c.id) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('')}</div>
        </section>
        <section class="card"><h2>Google (SEO)</h2>
          <label>Título<input id="seoT" value="${esc(p.seo_title || '')}" placeholder="${esc(p.title)}"></label>
          <label>Descrição<textarea id="seoD" rows="3">${esc(p.seo_description || '')}</textarea></label>
        </section>
      </div>
    </div></div>`;

  const drawImgs = () => {
    $('#imgs').innerHTML = images.length ? images.map((im, i) => `<figure data-i="${i}"><img src="${esc(im.url)}" alt="">
      <figcaption>${i === 0 ? '<span class="badge ok">Principal</span>' : `<button class="icon-btn left" title="Mover para a esquerda">‹</button>`}<button class="icon-btn del" title="Remover">✕</button></figcaption></figure>`).join('')
      : '<p class="hint">Sem imagens.</p>';
  };
  drawImgs();
  $('#imgs').addEventListener('click', (e) => {
    const i = Number(e.target.closest('figure')?.dataset.i);
    if (e.target.classList.contains('del')) { removedImages.push(...images.splice(i, 1).filter((x) => x.id)); drawImgs(); }
    if (e.target.classList.contains('left')) { [images[i - 1], images[i]] = [images[i], images[i - 1]]; drawImgs(); }
  });
  $('#upl').addEventListener('change', async (e) => {
    if (isNew) { toast('Guarda o produto primeiro.', 'err'); return; }
    const lbl = e.target.closest('label');
    await busy(lbl, async () => {
      for (const file of e.target.files) {
        const name = `${p.handle}/${Date.now()}-${slugify(file.name.replace(/\.[^.]+$/, ''))}.${(file.name.split('.').pop() || 'jpg').toLowerCase()}`;
        images.push({ url: await uploadImage(name, file) });
      }
      drawImgs(); toast('Imagens carregadas. Não te esqueças de guardar.');
    }).catch(() => {});
    e.target.value = '';
  });
  $('#title').addEventListener('input', () => { if (isNew) $('#handle').value = slugify($('#title').value); });
  $('#desc').addEventListener('input', () => { $('#preview').innerHTML = $('#desc').value; });
  $('#preview').innerHTML = p.description_html || '';
  $('#addVar').onclick = () => {
    const last = [...$$('#vars tr')].pop();
    $('#vars').insertAdjacentHTML('beforeend', varRow({ option_value: '', price_cents: last ? toCents($('.price', last).value) : null, active: true }, $$('#vars tr').length));
    $$('#vars tr').pop().querySelector('.sz').focus();
  };
  $('#samePrice').onclick = () => { const v = $('#vars .price')?.value; $$('#vars .price').forEach((i) => { i.value = v; }); };
  $('#vars').addEventListener('click', (e) => { if (e.target.classList.contains('rm')) e.target.closest('tr').remove(); });

  $('#save').onclick = (e) => busy(e.currentTarget, async () => {
    const title = $('#title').value.trim();
    if (!title) throw new Error('O nome é obrigatório.');
    const body = {
      title, handle: slugify($('#handle').value || title), excerpt: $('#excerpt').value.trim() || null, description_html: $('#desc').value,
      brand_id: $('#brand').value || null, brand: $('#brand').selectedOptions[0]?.value ? $('#brand').selectedOptions[0].text : null,
      status: $('#status').value, featured: $('#featured').checked, vat_rate: Number($('#vat').value),
      weight_g: $('#weight').value ? Number($('#weight').value) : null, seo_title: $('#seoT').value.trim() || null,
      seo_description: $('#seoD').value.trim() || null, updated_at: new Date().toISOString(),
    };
    // valida tamanhos
    const rows = $$('#vars tr').map((tr) => ({
      tr, i: Number(tr.dataset.i), option_value: $('.sz', tr).value.trim(), sku: $('.sku', tr).value.trim() || null,
      price_cents: toCents($('.price', tr).value), compare_at_cents: $('.cmp', tr).value.trim() ? toCents($('.cmp', tr).value) : null,
      stock: $('.stk', tr).value === '' ? null : Number($('.stk', tr).value), active: $('.act', tr).checked,
    }));
    const seen = new Set();
    for (const r of rows) {
      if (!r.option_value) throw new Error('Há um tamanho sem nome.');
      if (seen.has(r.option_value)) throw new Error(`Tamanho repetido: ${r.option_value}`);
      seen.add(r.option_value);
      if (r.price_cents == null || r.price_cents < 0) throw new Error(`Preço inválido no tamanho ${r.option_value}`);
      if (r.stock != null && (!Number.isInteger(r.stock) || r.stock < 0)) throw new Error(`Stock inválido no tamanho ${r.option_value}`);
    }
    let pid = p.id;
    if (isNew) pid = (await db('products', { method: 'POST', body: { ...body, option_name: 'Tamanho' }, prefer: 'return=representation' }))[0].id;
    else await db(`products?id=eq.${pid}`, { method: 'PATCH', body });

    // tamanhos
    for (const [pos, r] of rows.entries()) {
      const old = p.variants[r.i] && p.variants[r.i].option_value === r.option_value ? p.variants[r.i] : null;
      const data = { sku: r.sku, price_cents: r.price_cents, compare_at_cents: r.compare_at_cents, active: r.active, position: pos };
      let vid = old?.id;
      if (old) {
        if (old.sku !== r.sku || old.price_cents !== r.price_cents || old.compare_at_cents !== r.compare_at_cents || old.active !== r.active || old.position !== pos) {
          await db(`variants?id=eq.${vid}`, { method: 'PATCH', body: data });
        }
      } else {
        vid = (await db('variants', { method: 'POST', body: { ...data, product_id: pid, option_value: r.option_value }, prefer: 'return=representation' }))[0].id;
      }
      if (r.stock != null && r.stock !== (old?.stock ?? null)) await rpc('set_stock', { p_variant: vid, p_qty: r.stock, p_note: 'Ficha do produto' });
    }
    // categorias
    const want = new Set($$('.cat-list input:checked').map((i) => i.value));
    const add = [...want].filter((c) => !selCats.has(c)), rem = [...selCats].filter((c) => !want.has(c));
    if (add.length) await db('product_categories', { method: 'POST', body: add.map((category_id) => ({ product_id: pid, category_id })), prefer: 'resolution=ignore-duplicates' });
    if (rem.length) await db(`product_categories?product_id=eq.${pid}&category_id=in.(${rem.join(',')})`, { method: 'DELETE' });
    // imagens
    if (removedImages.length) await db(`product_images?id=in.(${removedImages.map((x) => x.id).join(',')})`, { method: 'DELETE' });
    for (const [pos, im] of images.entries()) {
      if (!im.id) await db('product_images', { method: 'POST', body: { product_id: pid, url: im.url, position: pos } });
      else if (im.position !== pos) await db(`product_images?id=eq.${im.id}`, { method: 'PATCH', body: { position: pos } });
    }
    toast('Produto guardado.');
    if (isNew) location.hash = `#/produto/${pid}`; else product(el, [pid]);
  }).catch(() => {});
}

// ---------------- Stock (contagem rápida / entrada de mercadoria) ----------------
export async function stock(el) {
  const [{ cats, brands }, list] = await Promise.all([
    loadLookups(),
    db('products?select=id,title,brand_id,status,product_images(url,position),variants(id,option_value,stock,active,position),product_categories(category_id)&status=in.(active,out_of_stock,draft)&order=position,title'),
  ]);
  const f = pref.get('stockFilter', { q: '', brand: '', cat: '', only: '' });
  el.innerHTML = `<div class="page">
    <header class="page-head"><h1>Stock <small>opcional</small></h1>
      <div class="actions"><div class="seg" id="mode"><button data-m="contagem" class="on">Contagem</button><button data-m="entrada">Entrada de mercadoria</button></div></div></header>
    <p class="hint" id="modeHint"></p>
    <div class="filters">
      <input type="search" id="q" placeholder="Pesquisar…" value="${esc(f.q)}">
      <select id="fb"><option value="">Todas as marcas</option>${brands.map((b) => `<option value="${b.id}" ${f.brand === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
      <select id="fc"><option value="">Todas as categorias</option>${cats.map((c) => `<option value="${c.id}" ${f.cat === c.id ? 'selected' : ''}>${esc(catLabel(c))}</option>`).join('')}</select>
      <select id="fo"><option value="">Todos</option><option value="null" ${f.only === 'null' ? 'selected' : ''}>Sem controlo de stock</option><option value="zero" ${f.only === 'zero' ? 'selected' : ''}>Só com tamanhos a 0</option></select>
    </div>
    <div id="list" class="stock-list"></div>
    <div class="savebar" id="bar" hidden><span id="barTxt"></span><button class="btn ghost" id="undo">Descartar</button><button class="btn primary" id="saveAll">Guardar</button></div>
  </div>`;
  let mode = 'contagem';
  const dirty = new Map();
  const hint = () => {
    $('#modeHint').textContent = mode === 'contagem'
      ? 'Só para produtos que tenhas em armazém. Tamanhos vazios não têm controlo de stock e vendem-se sempre (envio do fornecedor). Escreve a quantidade para começar a controlar.'
      : 'Entrada: escreve quantas unidades chegaram. São somadas ao stock atual.';
  };
  hint();
  const bar = () => { $('#bar').hidden = !dirty.size; $('#barTxt').textContent = `${dirty.size} tamanho(s) alterado(s)`; };
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase(), br = $('#fb').value, ct = $('#fc').value, only = $('#fo').value;
    pref.set('stockFilter', { q, brand: br, cat: ct, only });
    const rows = list.filter((p) => (!q || p.title.toLowerCase().includes(q)) && (!br || p.brand_id === br) &&
      (!ct || p.product_categories.some((x) => x.category_id === ct)) &&
      (!only || p.variants.some((v) => v.active && (only === 'null' ? v.stock == null : v.stock === 0))));
    $('#list').innerHTML = rows.length ? rows.map((p) => `<div class="stock-row card">
      <div class="stock-prod">${thumb(p.product_images)}<a href="#/produto/${p.id}">${esc(p.title)}</a></div>
      <div class="sizes">${p.variants.filter((v) => v.active).sort((a, b) => a.position - b.position).map((v) => `
        <label class="size ${v.stock == null ? 'unset' : v.stock === 0 ? 'zero' : ''}"><span>${esc(v.option_value)}</span>
          <input type="number" min="${mode === 'contagem' ? 0 : ''}" step="1" data-v="${v.id}" value="${dirty.has(v.id) ? dirty.get(v.id) : (mode === 'contagem' ? (v.stock ?? '') : '')}"
            placeholder="${mode === 'contagem' ? '—' : `+ (${v.stock ?? 0})`}" class="${dirty.has(v.id) ? 'dirty' : ''}"></label>`).join('')}</div></div>`).join('')
      : emptyState('Nada para mostrar', list.length ? 'Nenhum produto corresponde aos filtros.' : 'Importa primeiro o catálogo.');
  };
  $('#list').addEventListener('input', (e) => {
    const inp = e.target.closest('input[data-v]'); if (!inp) return;
    const v = list.flatMap((p) => p.variants).find((x) => x.id === inp.dataset.v);
    const orig = mode === 'contagem' ? String(v.stock ?? '') : '';
    if (inp.value === orig) dirty.delete(v.id); else dirty.set(v.id, inp.value);
    inp.classList.toggle('dirty', dirty.has(v.id)); bar();
  });
  $('#list').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input[data-v]')) {
      const all = $$('#list input[data-v]'); all[all.indexOf(e.target) + 1]?.focus(); e.preventDefault();
    }
  });
  $('#mode').addEventListener('click', (e) => {
    const m = e.target.dataset.m; if (!m || m === mode) return;
    if (dirty.size && !confirmDialog('Tens alterações por guardar. Descartar?')) return;
    dirty.clear(); bar(); mode = m; $$('#mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === m)); hint(); draw();
  });
  $('#q').addEventListener('input', debounce(draw, 150));
  ['#fb', '#fc', '#fo'].forEach((s) => $(s).addEventListener('change', draw));
  $('#undo').onclick = () => { dirty.clear(); bar(); draw(); };
  $('#saveAll').onclick = (e) => busy(e.currentTarget, async () => {
    const entries = [...dirty.entries()].filter(([, val]) => val !== '');
    for (const [vid, val] of entries) {
      const n = Number(val);
      if (!Number.isInteger(n)) throw new Error(`Valor inválido: ${val}`);
      if (mode === 'contagem' && n < 0) throw new Error('A contagem não pode ser negativa.');
      if (mode === 'entrada' && n <= 0) throw new Error('Na entrada de mercadoria escreve só quantidades positivas.');
    }
    let done = 0;
    for (let i = 0; i < entries.length; i += 8) {
      await Promise.all(entries.slice(i, i + 8).map(([vid, val]) => (mode === 'contagem'
        ? rpc('set_stock', { p_variant: vid, p_qty: Number(val), p_note: 'Contagem de stock' })
        : db('stock_movements', { method: 'POST', body: { variant_id: vid, delta: Number(val), reason: 'entrada', note: 'Entrada de mercadoria' } }))));
      done += Math.min(8, entries.length - i);
      $('#barTxt').textContent = `A guardar… ${done}/${entries.length}`;
    }
    toast(`${entries.length} tamanho(s) atualizado(s).`);
    await stock(el);
  }).catch(() => {});
  draw();
}

// ---------------- Categorias ----------------
export async function categories(el) {
  const [cats, links] = await Promise.all([db('categories?select=*&order=path'), db('product_categories?select=category_id')]);
  const cnt = {}; links.forEach((l) => { cnt[l.category_id] = (cnt[l.category_id] || 0) + 1; });
  const hasKids = new Set(cats.map((c) => c.parent_id).filter(Boolean));
  el.innerHTML = `<div class="page"><header class="page-head"><h1>Categorias <small>${cats.length}</small></h1></header>
    <section class="card"><h2>Nova categoria</h2><div class="inline-form">
      <input id="nName" placeholder="Nome"><select id="nParent"><option value="">— Categoria principal —</option>${cats.map((c) => `<option value="${c.id}">${esc(c.path.replace(/>/g, ' › '))}</option>`).join('')}</select>
      <button class="btn primary" id="add">Adicionar</button></div></section>
    <div class="card flush"><table class="table"><thead><tr><th>Categoria</th><th class="num">Produtos</th><th></th></tr></thead><tbody>
    ${cats.map((c) => { const d = c.path.split('>').length - 1; return `<tr data-id="${c.id}"><td style="padding-left:${16 + d * 22}px">${d ? '<span class="tree">└</span>' : ''}<input class="ghost-input" value="${esc(c.name)}"></td>
      <td class="num">${cnt[c.id] || 0}</td><td class="right">${!cnt[c.id] && !hasKids.has(c.id) ? '<button class="icon-btn del" title="Apagar">✕</button>' : ''}</td></tr>`; }).join('')
    || `<tr><td colspan="3">${emptyState('Sem categorias', 'Importa o catálogo ou cria a primeira.')}</td></tr>`}
    </tbody></table></div></div>`;
  $('#add').onclick = (e) => busy(e.currentTarget, async () => {
    const name = $('#nName').value.trim(); if (!name) throw new Error('Escreve o nome.');
    const parent = cats.find((c) => c.id === $('#nParent').value);
    const path = parent ? `${parent.path}>${name}` : name;
    await db('categories', { method: 'POST', body: { name, slug: slugify(name), path, parent_id: parent?.id || null, position: cats.length } });
    toast('Categoria criada.'); categories(el);
  }).catch(() => {});
  el.querySelector('tbody').addEventListener('change', async (e) => {
    const tr = e.target.closest('tr'); const c = cats.find((x) => x.id === tr.dataset.id); const name = e.target.value.trim();
    if (!name || name === c.name) return;
    const newPath = c.path.split('>').slice(0, -1).concat(name).join('>');
    try {
      await db(`categories?id=eq.${c.id}`, { method: 'PATCH', body: { name, slug: slugify(name), path: newPath } });
      for (const k of cats.filter((x) => x.path.startsWith(`${c.path}>`))) {
        await db(`categories?id=eq.${k.id}`, { method: 'PATCH', body: { path: newPath + k.path.slice(c.path.length) } });
      }
      toast('Nome atualizado.'); categories(el);
    } catch (err) { toast(err.message, 'err'); }
  });
  el.querySelector('tbody').addEventListener('click', async (e) => {
    if (!e.target.classList.contains('del')) return;
    const tr = e.target.closest('tr');
    if (!confirmDialog('Apagar esta categoria?')) return;
    try { await db(`categories?id=eq.${tr.dataset.id}`, { method: 'DELETE' }); toast('Categoria apagada.'); categories(el); } catch (err) { toast(err.message, 'err'); }
  });
}

// ---------------- Marcas ----------------
export async function brands(el) {
  const [list, prods] = await Promise.all([db('brands?select=*&order=name'), db('products?select=brand_id')]);
  const cnt = {}; prods.forEach((p) => { if (p.brand_id) cnt[p.brand_id] = (cnt[p.brand_id] || 0) + 1; });
  el.innerHTML = `<div class="page"><header class="page-head"><h1>Marcas <small>${list.length}</small></h1></header>
    <section class="card"><div class="inline-form"><input id="nName" placeholder="Nova marca"><button class="btn primary" id="add">Adicionar</button></div></section>
    <div class="card flush"><table class="table"><thead><tr><th>Marca</th><th class="num">Produtos</th><th></th></tr></thead><tbody>
    ${list.map((b) => `<tr data-id="${b.id}"><td><input class="ghost-input" value="${esc(b.name)}"></td><td class="num"><a href="#/produtos" data-brand="${b.id}">${cnt[b.id] || 0}</a></td>
      <td class="right">${cnt[b.id] ? '' : '<button class="icon-btn del" title="Apagar">✕</button>'}</td></tr>`).join('') || `<tr><td colspan="3">${emptyState('Sem marcas', 'As marcas são criadas ao importar o catálogo.')}</td></tr>`}
    </tbody></table></div></div>`;
  $('#add').onclick = (e) => busy(e.currentTarget, async () => {
    const name = $('#nName').value.trim(); if (!name) throw new Error('Escreve o nome.');
    await db('brands', { method: 'POST', body: { name, slug: slugify(name) } }); toast('Marca criada.'); brands(el);
  }).catch(() => {});
  const tb = el.querySelector('tbody');
  tb.addEventListener('change', async (e) => {
    const id = e.target.closest('tr').dataset.id; const name = e.target.value.trim(); if (!name) return;
    try {
      await db(`brands?id=eq.${id}`, { method: 'PATCH', body: { name, slug: slugify(name) } });
      await db(`products?brand_id=eq.${id}`, { method: 'PATCH', body: { brand: name } });
      toast('Marca atualizada.');
    } catch (err) { toast(err.message, 'err'); }
  });
  tb.addEventListener('click', async (e) => {
    const a = e.target.closest('a[data-brand]');
    if (a) { pref.set('prodFilter', { q: '', status: '', brand: a.dataset.brand, cat: '' }); return; }
    if (!e.target.classList.contains('del') || !confirmDialog('Apagar esta marca?')) return;
    try { await db(`brands?id=eq.${e.target.closest('tr').dataset.id}`, { method: 'DELETE' }); brands(el); } catch (err) { toast(err.message, 'err'); }
  });
}
