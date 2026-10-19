// Leitura "inteligente" de folhas de fornecedor (CSV / Excel já convertido em linhas / linhas devolvidas pela IA a partir de PDF).
// Sem dependências: pode correr no browser e nos testes (node --experimental-strip-types).

export type Field =
  | "model_ref" | "title" | "description" | "brand" | "color" | "size" | "supplier_sku" | "ean"
  | "cost" | "rrp" | "vat" | "category" | "image";

export const FIELDS: { key: Field; label: string; hint: string }[] = [
  { key: "model_ref", label: "Referência do modelo", hint: "Agrupa tamanhos num produto (ex.: WG4A.03)" },
  { key: "title", label: "Nome", hint: "Nome do artigo" },
  { key: "color", label: "Cor", hint: "Junta-se ao nome do produto" },
  { key: "size", label: "Tamanho(s)", hint: "Um tamanho ou intervalo (35 a 46, S,M,L)" },
  { key: "cost", label: "Custo (s/IVA)", hint: "Preço a que compras" },
  { key: "rrp", label: "PVPR (c/IVA)", hint: "Preço de venda recomendado" },
  { key: "vat", label: "IVA %", hint: "23 ou 6" },
  { key: "description", label: "Descrição", hint: "" },
  { key: "brand", label: "Marca", hint: "" },
  { key: "category", label: "Categoria", hint: "ex.: CALÇADO>SOCAS" },
  { key: "supplier_sku", label: "Referência por tamanho", hint: "Se a folha tiver uma linha por tamanho" },
  { key: "ean", label: "EAN / código de barras", hint: "" },
  { key: "image", label: "Imagem (URL)", hint: "" },
];

export type Mapping = Partial<Record<Field, number>>;

export type ImportRow = {
  row_index: number;
  raw: Record<string, string>;
  model_ref: string | null;
  title: string | null;
  brand: string | null;
  color: string | null;
  size: string | null;
  supplier_sku: string | null;
  ean: string | null;
  cost_cents: number | null;
  rrp_cents: number | null;
  vat_rate: number | null;
  category_path: string | null;
  description: string | null;
  image_urls: string[];
  issues: string[];
};

/** linha "lógica" (modelo/cor) antes de expandir tamanhos — também é o formato devolvido pela IA */
export type SourceLine = {
  ref?: string | null; name?: string | null; description?: string | null; brand?: string | null; color?: string | null;
  sizes?: string | null; sku?: string | null; ean?: string | null; cost?: number | string | null; rrp?: number | string | null;
  vat?: number | string | null; category?: string | null; image?: string | null; review?: string | null;
  raw?: Record<string, string>;
};

const norm = (s: unknown) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9%/]+/g, " ").trim();

const SYN: Record<Field, string[]> = {
  model_ref: ["ref", "ref.", "referencia", "ref modelo", "referencia modelo", "codigo", "cod", "cod artigo", "codigo artigo", "modelo ref", "item", "art", "artigo n", "n artigo"],
  title: ["nome", "designacao", "modelo", "produto", "artigo", "nome artigo", "nome produto", "descricao curta"],
  description: ["descricao", "detalhes", "caracteristicas", "observacoes", "descricao longa"],
  brand: ["marca", "fabricante"],
  color: ["cor", "cores", "color", "colour", "acabamento"],
  size: ["tamanho", "tamanhos", "numero", "numeros", "n", "medida", "medidas", "tam", "tams", "size", "sizes", "numeracao"],
  supplier_sku: ["sku", "ref tamanho", "referencia tamanho", "cod barras interno"],
  ean: ["ean", "ean13", "codigo barras", "codigo de barras", "barcode", "gtin"],
  cost: ["custo", "preco custo", "custo s/iva", "custo sem iva", "preco", "preco s/iva", "preco sem iva", "pvf", "preco revenda", "revenda", "preco liquido", "net", "preco unitario", "preco unit", "valor"],
  rrp: ["pvp", "pvpr", "pvp recomendado", "preco recomendado", "pvp c/iva", "pvpr c/iva", "preco venda publico", "preco publico", "retalho"],
  vat: ["iva", "iva %", "taxa iva", "taxa", "% iva"],
  category: ["categoria", "familia", "tipo", "seccao", "grupo", "linha"],
  image: ["imagem", "foto", "url imagem", "image", "fotografia"],
};

function score(header: string, f: Field): number {
  const h = norm(header);
  if (!h) return 0;
  let best = 0;
  for (const s of SYN[f]) {
    if (h === s) best = Math.max(best, 10);
    else if (h.startsWith(s + " ") || h.endsWith(" " + s)) best = Math.max(best, 6);
    else if (s.length >= 4 && h.includes(s)) best = Math.max(best, 4);
  }
  // "preço" sozinho é custo, mas "pvp"/"recomendado" ganha para PVPR
  if (f === "cost" && /pvp|recomend|publico/.test(h)) best = 0;
  if (f === "title" && /descri/.test(h) && !/curta/.test(h)) best = Math.min(best, 3);
  if (f === "model_ref" && /tamanho|barras|ean/.test(h)) best = 0;
  return best;
}

/** Linha de cabeçalhos: a que tem mais colunas reconhecidas nas primeiras 20. */
export function findHeaderRow(rows: string[][]): number {
  let bestI = 0, bestN = -1;
  rows.slice(0, 20).forEach((r, i) => {
    const n = r.filter((c) => FIELDS.some((f) => score(c, f.key) >= 6)).length;
    if (n > bestN) { bestN = n; bestI = i; }
  });
  return bestI;
}

/** Atribui cada campo à coluna com melhor pontuação (cada coluna só uma vez). */
export function autoMap(headers: string[]): Mapping {
  const cands: { f: Field; c: number; s: number }[] = [];
  headers.forEach((h, c) => FIELDS.forEach(({ key }) => { const s = score(h, key); if (s > 0) cands.push({ f: key, c, s }); }));
  cands.sort((a, b) => b.s - a.s);
  const m: Mapping = {}; const used = new Set<number>();
  for (const x of cands) { if (m[x.f] != null || used.has(x.c)) continue; m[x.f] = x.c; used.add(x.c); }
  // sem coluna de nome: usa a descrição como nome
  if (m.title == null && m.description != null) { m.title = m.description; delete m.description; }
  return m;
}

/** "32,70" | "32.70" | "€ 1.032,70" | 32.7 → cêntimos */
export function parseMoney(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : null;
  let t = String(v).replace(/[€\s]|eur/gi, "");
  if (!t || !/\d/.test(t)) return null;
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = t.replace(",", ".");
  const n = Number(t.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function parseVat(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace("%", "").replace(",", ".").trim());
  if (!Number.isFinite(n)) return null;
  const pct = n < 1 ? n * 100 : n;
  return [0, 6, 13, 23].includes(Math.round(pct)) ? Math.round(pct) : null;
}

const LETTERS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const uniq = (xs: string[]) => [...new Set(xs)];

/** Limpa ruído de PDFs com texto sobreposto ("ho o 35/6 a 47/8 nco", "Cla4r0o a 46"). */
function cleanSize(input: string): string {
  const s = input.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  if (/^[SMLX]{1,3}(\s*[,/]\s*[SMLX]{1,3})*$/i.test(s.replace(/\s/g, ""))) return s;
  if (/^(\d{2}-\d{2}\s*){2,}$/.test(s + " ")) return s;
  const m = s.match(/\d{2}\/\d{1,2}\s*a\s*\d{2}(\/\d{1,2})?|\d{2}\s*(?:a|até|ao|-)\s*\d{2}|\b\d\s*a\s*\d\b/i);
  if (m) return m[0];
  const t = s.split(" ").filter((x) => x === "a" || /\d/.test(x)).map((x) => (x === "a" ? "a" : x.replace(/[^\d/]/g, ""))).join(" ");
  const m2 = t.match(/\d{2}\s*a\s*\d{2}/);
  if (m2) return m2[0];
  if (/^\d{2} \d{2}$/.test(s)) return s.replace(" ", " a ");
  return s;
}

/** Expande tamanhos: "35 a 46", "35/6 a 47/8", "34/5 a 42", "1 a 5", "S,M,L", "S a XL", "39-44", "35-37 38-40". */
export function expandSizes(input: unknown): string[] {
  const raw = String(input ?? "").replace(/\s+/g, " ").trim();
  if (!raw || /^(unico|único|u|tu|uni|one size|tamanho unico|tamanho único)$/i.test(raw) || /^\d+\s*(ml|g|cl|l)$/i.test(raw)) return ["Único"];
  if (/[,;]/.test(raw)) return uniq(raw.split(/[,;]/).map((x) => x.trim().replace(/\s*\(.*\)$/, "")).filter(Boolean).flatMap(expandSizes));
  if (/^[a-z]+(\/[a-z]+)+$/i.test(raw)) return uniq(raw.split("/").flatMap(expandSizes));
  const t = cleanSize(raw);
  const toks = t.split(" ");
  if (toks.length > 1 && toks.every((x) => /^\d{2}-\d{2}$/.test(x))) return toks;
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
  let m = t.match(/^(\d{2})\/(\d{1,2})\s*(?:a|até|ao)\s*(\d{2})\/(\d{1,2})$/i);         // 35/6 a 47/8 -> pares
  if (m) {
    const a = Number(m[1]), b = Number(m[3]), out: string[] = [];
    for (let n = a; n <= b && out.length < 15; n += 2) out.push(`${n}/${n + 1}`);
    return out;
  }
  m = t.match(/^(\d{2})\/(\d{1,2})\s*(?:a|até|ao)\s*(\d{2})$/i);                        // 34/5 a 42 | 35/36 a 42
  if (m) {
    const a = Number(m[1]), b = Number(m[3]);
    if (b > a + 1 && b - a <= 20) return [`${a}/${a + 1}`, ...range(a + 2, b)];
  }
  m = t.match(/^(\d{1,2})\s*(?:a|até|ao)\s*(\d{1,2})$/i);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (b > a && b - a <= 20) return range(a, b);
  }
  m = t.match(/^(\d{2})\s*-\s*(\d{2})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (b - a >= 4 && b - a <= 20) return range(a, b);
    return [`${a}-${b}`];
  }
  m = t.toUpperCase().match(/^(XXS|XS|S|M|L|XL|XXL|XXXL)\s*(?:A|AO|-)\s*(XXS|XS|S|M|L|XL|XXL|XXXL)$/);
  if (m) {
    const a = LETTERS.indexOf(m[1]), b = LETTERS.indexOf(m[2]);
    if (b > a) return LETTERS.slice(a, b + 1);
  }
  return [t];
}

const clean = (s: unknown) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t || null; };
const titleCase = (s: string) => (s === s.toUpperCase() && s.length > 3 ? s.charAt(0) + s.slice(1).toLowerCase() : s);

/** Converte linhas da folha (com mapeamento) em linhas lógicas. */
export function linesFromTable(rows: string[][], headerRow: number, map: Mapping): SourceLine[] {
  const headers = rows[headerRow] ?? [];
  const g = (r: string[], f: Field) => (map[f] == null ? null : clean(r[map[f]!]));
  const out: SourceLine[] = [];
  let lastRef: string | null = null, lastName: string | null = null, lastCost: string | null = null, lastRrp: string | null = null;
  for (const r of rows.slice(headerRow + 1)) {
    if (!r.some((c) => String(c ?? "").trim())) continue;
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => { if (r[i] != null && String(r[i]).trim()) raw[String(h || `col${i + 1}`)] = String(r[i]); });
    const name = g(r, "title");
    const ref = g(r, "model_ref");
    const cost = g(r, "cost");
    // células unidas: herdar referência/nome/preço da linha anterior quando vazias
    const line: SourceLine = {
      ref: ref ?? (name ? null : lastRef), name: name ?? (ref ? null : lastName), description: g(r, "description"), brand: g(r, "brand"),
      color: g(r, "color"), sizes: g(r, "size"), sku: g(r, "supplier_sku"), ean: g(r, "ean"),
      cost: cost ?? (ref || name ? null : lastCost), rrp: g(r, "rrp") ?? (ref || name ? null : lastRrp), vat: g(r, "vat"),
      category: g(r, "category"), image: g(r, "image"), raw,
    };
    if (!line.ref && !line.name && !line.sku && !line.ean) continue;               // linhas de títulos/notas
    if (parseMoney(line.cost) == null && parseMoney(line.rrp) == null && !line.sizes && !line.color) continue;
    lastRef = line.ref ?? lastRef; lastName = line.name ?? lastName;
    lastCost = cost ?? lastCost; lastRrp = g(r, "rrp") ?? lastRrp;
    out.push(line);
  }
  return out;
}

/** Linhas lógicas → linhas de importação (uma por tamanho). */
export function toImportRows(lines: SourceLine[], opts: { defaultVat?: number; defaultBrand?: string | null; vatForCategory?: (cat: string | null) => number | null } = {}): ImportRow[] {
  const out: ImportRow[] = [];
  let idx = 0;
  for (const l of lines) {
    const sizes = expandSizes(l.sizes);
    const name = clean(l.name);
    const color = clean(l.color);
    const ref = clean(l.ref) ?? clean(l.sku)?.replace(/[-_. ]?\d{2}(\/\d{1,2})?$/, "") ?? null;
    const cost = parseMoney(l.cost);
    const rrp = parseMoney(l.rrp) || null;          // PVPR 0 = sem PVPR
    const cat = clean(l.category)?.replace(/\s*[>»/]\s*/g, ">").toUpperCase() ?? null;
    const vat = parseVat(l.vat) ?? opts.vatForCategory?.(cat) ?? opts.defaultVat ?? 23;
    const title = name ? [titleCase(name), color && !norm(name).includes(norm(color)) ? color : null].filter(Boolean).join(" ") : null;
    const issues: string[] = [];
    if (l.review) issues.push(String(l.review));
    if (sizes.length === 1 && sizes[0] !== "Único" && String(l.sizes ?? "").length > 12) issues.push("tamanhos por confirmar");
    if (cost != null && rrp != null && rrp / (1 + vat / 100) < cost) issues.push("PVPR abaixo do custo");
    for (const s of sizes) {
      out.push({
        row_index: ++idx, raw: { ...(l.raw ?? {}), _tamanhos: String(l.sizes ?? "") },
        model_ref: ref, title, brand: clean(l.brand) ?? opts.defaultBrand ?? null, color, size: s,
        supplier_sku: clean(l.sku) && sizes.length === 1 ? clean(l.sku) : ref ? `${ref}-${s}` : null,
        ean: sizes.length === 1 ? clean(l.ean) : null,
        cost_cents: cost, rrp_cents: rrp, vat_rate: vat, category_path: cat, description: clean(l.description),
        image_urls: l.image && /^https?:\/\//.test(l.image) ? [l.image] : [], issues: [...issues],
      });
    }
  }
  return out;
}

/** CSV com ; ou , (deteta), aspas e quebras de linha dentro de aspas. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const first = t.split(/\r?\n/, 1)[0] ?? "";
  const delim = [";", ",", "\t"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
