// Leitura das exportações da Loja Online CTT (ZIP ou CSV) e conversão para o formato de importação

// ---------- ZIP (usa DecompressionStream do browser) ----------
export async function unzip(buf) {
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Ficheiro ZIP inválido');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = [];
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nlen));
    const lnlen = dv.getUint16(off + 26, true), lelen = dv.getUint16(off + 28, true);
    const data = new Uint8Array(buf, off + 30 + lnlen + lelen, csize);
    let out;
    if (method === 0) out = data;
    else if (method === 8) out = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else throw new Error(`Compressão não suportada em ${name}`);
    if (!name.endsWith('/')) files.push({ name, text: new TextDecoder('utf-8').decode(out) });
    p += 46 + nlen + elen + clen;
  }
  return files;
}

// ---------- CSV ; com aspas e quebras de linha ----------
export function parseCSV(text, sep = ';') {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '');
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

export function slugify(s) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x00-\x7f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'produto';
}

// preço sem IVA (até 3 casas) -> cêntimos com IVA, arredondamento meio-acima, sem erros de vírgula flutuante
export function grossCents(net, vat) {
  const [i, d = ''] = String(net).trim().split('.');
  const milli = parseInt(i || '0', 10) * 1000 + parseInt((d + '000').slice(0, 3), 10);
  return Math.floor((milli * (100 + Number(vat)) + 500) / 1000);
}

const REGION = { 'Portugal - Continental': 'Continente', 'Portugal - Açores': 'Açores', 'Portugal - Madeira': 'Madeira' };
const split = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

export const kindOf = (rows) => (rows[0] && 'Handle' in rows[0] ? 'produtos' : rows[0] && 'Email' in rows[0] ? 'clientes' : null);

export function toCatalog(rows) {
  const prods = []; let cur = null;
  for (const r of rows) {
    if (r.Title) { cur = { r, v: [], i: [] }; prods.push(cur); }
    if (!cur) continue;
    if (r['Option1 Value']) cur.v.push(r);
    if (r.Image) cur.i.push(r.Image);
  }
  const used = new Set();
  return prods.map(({ r, v, i }, pos) => {
    const vat = r.Tax || '23';
    let h = slugify(r.Title); const base = h; let k = 2;
    while (used.has(h)) h = `${base}-${k++}`;
    used.add(h);
    const seen = new Set(); const vs = [];
    for (const x of v) {
      if (seen.has(x['Option1 Value'])) continue;
      seen.add(x['Option1 Value']);
      vs.push([x['Option1 Value'], x.SKU, grossCents(x.Price || r.Price, vat)]);
    }
    return {
      lh: r.Handle, h, t: r.Title, ex: r.Description.includes(r.Excerpt) ? '' : r.Excerpt, d: r.Description, b: r.Brand,
      tg: split(r.Tags), st: r.Status || 'active', vat: Number(vat), w: parseInt(r.Weight || '0', 10) || null,
      f: r.Featured === 'true', st_t: r['Page Title'], st_d: r['Meta Description'], c: split(r.Categories),
      v: vs, i, p: pos,
    };
  });
}

export function toCustomers(rows) {
  const by = new Map();
  for (const r of rows) {
    const k = r.Email.trim().toLowerCase();
    const a = by.get(k);
    if (!a) { by.set(k, r); continue; }
    const [keep, other] = r['Created At'] > a['Created At'] ? [{ ...r }, a] : [{ ...a }, r];
    keep['Total Spent'] = String((Number(a['Total Spent'] || 0) * 100 + Number(r['Total Spent'] || 0) * 100) / 100);
    keep['Total Orders'] = String(Number(a['Total Orders'] || 0) + Number(r['Total Orders'] || 0));
    for (const [f, v] of Object.entries(other)) if (!keep[f] && v) keep[f] = v;
    by.set(k, keep);
  }
  return [...by.values()].map((r) => {
    const addr = [];
    for (const [kind, pre] of [['delivery', 'Delivery'], ['billing', 'Billing']]) {
      if (r[`${pre} Address`]) addr.push([kind, r[`${pre} Name`], r[`${pre} Phone`], r[`${pre} Address`], r[`${pre} Address Extra`],
        r[`${pre} Zip Code`], r[`${pre} City`], REGION[r[`${pre} Country`]] ?? r[`${pre} Country`]]);
    }
    if (addr.length === 2 && JSON.stringify(addr[0].slice(1)) === JSON.stringify(addr[1].slice(1))) addr[1] = ['billing='];
    return [r.Email.trim().toLowerCase(), r.Name, r.Company, r['Fiscal id'], r['Delivery Phone'] || r['Billing Phone'],
      r['Subscribe Newsletter'] === 'true', Math.round(Number(r['Total Spent'] || 0) * 100), parseInt(r['Total Orders'] || '0', 10),
      r['Created At'], addr];
  });
}

// lê vários ficheiros (zip/csv) e devolve { produtos: [...], clientes: [...] }
export async function readExports(fileList) {
  const out = { produtos: null, clientes: null };
  for (const file of fileList) {
    const parts = /\.zip$/i.test(file.name) ? await unzip(await file.arrayBuffer()) : [{ name: file.name, text: await file.text() }];
    for (const p of parts) {
      if (!/\.csv$/i.test(p.name)) continue;
      const rows = parseCSV(p.text);
      const k = kindOf(rows);
      if (k === 'produtos') out.produtos = toCatalog(rows);
      if (k === 'clientes') out.clientes = toCustomers(rows);
    }
  }
  return out;
}
