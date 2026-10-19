"""Extrator de tabelas de preços de fornecedores em PDF (com grelha de tabela).

Uso: python3 -I supplier_pdf.py tabela.pdf saida.json [saida.csv]

- Lê todas as tabelas de todas as páginas (células unidas são repartidas pelas linhas).
- Reconhece as colunas pelo cabeçalho (Nome, Descrição, Ref., Cor, Tam., Preço, PVPR/PVP, Uni. de venda).
- IVA por secção (texto "IVA 23%" por cima da tabela) e exceções por nota "(1)"/"(2)" da página.
- Expande intervalos de tamanhos: "35 a 46", "35/6 a 47/8", "39-44", "S,M,L", "Único".
- Preço = custo SEM IVA; PVPR = preço de venda recomendado COM IVA.
"""
import csv, json, re, sys, unicodedata
import pdfplumber

HEAD = {
    "nome": "name", "descrição": "desc", "descricao": "desc", "ref.": "ref", "ref": "ref", "cor": "color",
    "tam.": "size", "tam": "size", "preço": "cost", "preco": "cost", "pvpr": "rrp", "pvp": "rrp",
    "uni.de venda": "unit", "uni. de venda": "unit", "unidade de venda": "unit", "uni.": "unit",
}
FILL = ("ref", "name", "desc", "size", "cost", "rrp", "unit")


def norm(s):
    return re.sub(r"\s+", " ", (s or "").replace("\n", " ")).strip()


def money_cents(s):
    m = re.search(r"(\d{1,4}(?:\.\d{3})*,\d{2})", s or "")
    return int(round(float(m.group(1).replace(".", "").replace(",", ".")) * 100)) if m else None


def clean_size(s):
    s = norm(s).replace("–", "-")
    if re.fullmatch(r"[SMLX]{1,2}(\s*[,/]\s*[SMLX]{1,2})*", s.replace(" ", "")):
        return s
    m = re.search(r"\d{2}/\d\s*a\s*\d{2}/\d|\d{2}/\d{1,2}\s*a\s*\d{2}|\d{2}\s*(?:a|-)\s*\d{2}|\d\s*a\s*\d", s)
    if m:
        return m.group(0)
    # letras intercaladas (ex.: "Cla4r0o a 46" -> "40 a 46")
    t = " ".join("a" if tok == "a" else re.sub(r"[^\d/]", "", tok) for tok in s.split() if tok == "a" or re.search(r"\d", tok))
    m = re.search(r"\d{2}\s*a\s*\d{2}", t)
    return m.group(0) if m else s


def expand_sizes(s):
    s = clean_size(s)
    if not s or s.lower() in ("único", "unico", "u") or re.fullmatch(r"\d+\s*(ml|g|cl|l)", s.lower()):
        return ["Único"]
    m = re.fullmatch(r"(\d{2})/(\d)\s*a\s*(\d{2})", s)              # 34/5 a 42 -> 34/35, 36..42
    if m:
        a = int(m.group(1))
        return [f"{a}/{a + 1}"] + [str(x) for x in range(a + 2, int(m.group(3)) + 1)]
    m = re.fullmatch(r"(\d{2})/(\d)\s*a\s*(\d{2})/(\d)", s)          # 35/6 a 47/8 -> pares
    if m:
        a, b = int(m.group(1)), int(m.group(3))
        return [f"{x}/{x + 1}" for x in range(a, b + 1, 2)]
    m = re.fullmatch(r"(\d{2})/(\d{2})\s*a\s*(\d{2})", s)          # 35/36 a 42
    if m:
        return [f"{m.group(1)}/{m.group(2)}"] + [str(x) for x in range(int(m.group(2)) + 1, int(m.group(3)) + 1)]
    m = re.fullmatch(r"(\d)\s*a\s*(\d)", s)                          # meias: tamanhos 1 a 5
    if m:
        return [str(x) for x in range(int(m.group(1)), int(m.group(2)) + 1)]
    m = re.fullmatch(r"(\d{2})\s*(?:a|-|\s)\s*(\d{2})", s)            # 35 a 46 / 39-44 / "35 45"
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if a <= b and b - a <= 20:
            return [str(x) for x in range(a, b + 1)]
    parts = [p.strip() for p in re.split(r"[,;]", s) if p.strip()]
    if len(parts) > 1:
        return [re.sub(r"\s*\(.*\)", "", p) for p in parts]
    if "/" in s and re.fullmatch(r"[SMLX/ ]+", s):
        return [p.strip() for p in s.split("/") if p.strip()]
    return [s]


def category_for(text):
    t = unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode()
    if re.search(r"\bmeia|collant|meias", t): return "MEIAS"
    if re.search(r"\bsoca", t): return "CALÇADO>SOCAS"
    if re.search(r"palmilha|calcanheira|protetor|separador|\btala\b|corrector|\banel\b|\bbanda\b|reabilitador|\bspray\b|\btalco\b|\bcreme\b|espuma|almofada|tubo elastico|ortotese|\bpalm\.", t):
        return "ACESSÓRIOS>CUIDADOS DOS PÉS"
    if re.search(r"\bsoca", t): return "CALÇADO>SOCAS"
    if re.search(r"tenis|sapatilha", t): return "CALÇADO>SAPATILHAS"
    if re.search(r"sandalia|chinelo", t): return "CALÇADO>SANDÁLIAS E CHINELOS"
    if re.search(r"\bbota", t): return "CALÇADO>BOTAS"
    if re.search(r"sapato|mocassin|sabrina", t): return "CALÇADO>SAPATOS"
    if "presilha" in t: return "ACESSÓRIOS>PEÇAS DE REPOSIÇÃO"
    return None


def page_vat_notes(text):
    """'(1) - IVA 6%' / '(1) Taxa de IVA 23%' / '(2) Taxa IVA 23%' -> {'1': 6, ...}"""
    return {m.group(1): int(m.group(2)) for m in re.finditer(r"\((\d)\)\s*-?\s*(?:Taxa\s*(?:de\s*)?)?IVA\s*(\d{1,2})\s*%", text)}


def section_vat(page, top):
    """procura 'IVA xx%' até 60pt acima da tabela"""
    best = None
    for w in page.extract_words():
        if w["text"].upper() == "IVA" and top - 60 <= w["top"] <= top:
            nxt = [x for x in page.extract_words() if abs(x["top"] - w["top"]) < 3 and x["x0"] > w["x0"] and x["x0"] - w["x1"] < 20]
            for x in nxt:
                m = re.match(r"(\d{1,2})%", x["text"])
                if m and (best is None or w["top"] > best[0]):
                    best = (w["top"], int(m.group(1)))
    return best[1] if best else None


HEAD_ORDER = ["nome", "descrição", "ref.", "cor", "tam.", "uni.de venda", "unidade de venda", "uni.", "preço", "pvpr", "pvp"]


def header_map(cells_text, ncols):
    """mapeia colunas pelo cabeçalho; aceita cabeçalhos unidos numa só célula ("Nome Descrição Ref. Tam. Preço")"""
    low = [norm(c).lower() for c in cells_text]
    if sum(1 for c in low if c in HEAD) >= 3:
        return [HEAD.get(c) for c in low]
    joined = " ".join(low)
    found = []
    for m in re.finditer(r"nome|descrição|descricao|ref\.?|cor\b|tam\.?|uni(?:dade)?\.? ?de venda|uni\.|preço|preco|pvpr|pvp", joined):
        key = HEAD.get(m.group(0)) or HEAD.get(m.group(0).rstrip(".") + ".") or HEAD.get(m.group(0).rstrip("."))
        if key and key not in found:
            found.append(key)
    return found if len(found) == ncols and "ref" in found else None


def open_regions(page, tbl, ncols):
    """Células unidas que atravessam a mudança de página não têm linha de fecho (em baixo) ou de abertura (em cima).
    Devolve, por coluna, {'top': (y_fim, texto), 'bottom': (y_ini, texto)}."""
    out = {}
    xs = sorted({round(c[0]) for c in tbl.cells})
    x1s = sorted({round(c[2]) for c in tbl.cells})
    if len(xs) != ncols:
        return out
    for i in range(ncols):
        x0, x1 = xs[i], x1s[i] if i < len(x1s) else tbl.bbox[2]
        closed = [c for c in tbl.cells if round(c[0]) == x0]
        if not closed:
            continue
        first, last = min(c[1] for c in closed), max(c[3] for c in closed)
        reg = {}
        if first - tbl.bbox[1] > 8:
            reg["top"] = (first, (page.crop((x0, tbl.bbox[1], x1, first)).extract_text() or "").strip())
        if tbl.bbox[3] - last > 8:
            reg["bottom"] = (last, (page.crop((x0, last, x1, tbl.bbox[3])).extract_text() or "").strip())
        if reg:
            out[i] = reg
    return out


def finalize(rec, raw, pn, notes, vat, rows, issues):
    ref = rec.get("ref") or ""
    review = []
    if "(DM)" in ref:
        ref = ref.replace("(DM)", "").strip(); rec["name"] = rec.get("name", "") + " (DM)"
    if not ref or "ref." in ref.lower() or re.search(r"[%€+,]", ref) or not re.search(r"\d|[A-Z].*[A-Z]", ref):
        return
    if re.search(r"\(\s*$", ref) or any(re.search(r"[a-z][A-Z][a-z]|[a-z]\d[a-z]", rec.get(k, "")) for k in ("desc", "name", "color")):
        review.append("texto sobreposto no PDF: confirmar nome/cor")
        ref = ref.rstrip(" (")
    cost = money_cents(rec.get("cost"))
    if cost is None:
        issues.append(f"p.{pn} {ref}: sem preço — linha não importada")
        return
    note = re.search(r"\((\d)\)", " ".join([rec.get("name", ""), rec.get("desc", "")]))
    line_vat = notes.get(note.group(1), vat) if note else vat
    name = re.sub(r"\s*\(\d\)\s*", " ", rec.get("name", "")).strip()
    desc = re.sub(r"\s*\(\d\)\s*", " ", rec.get("desc", "")).strip()
    if desc.startswith(")") and "(" in name and ")" not in name:
        name, desc = name + ")", desc[1:].strip()
    device = "(DM)" in name
    name = name.replace("(DM)", "").strip()
    lines = [x.strip() for x in raw.get("size", "").split("\n") if x.strip()]
    if len(lines) > 1 and all(re.fullmatch(r"\d{2}\s*-\s*\d{2}", x) for x in lines):
        sizes = lines
    else:
        sizes = expand_sizes(rec.get("size", ""))
    if not rec.get("size"):
        review.append("tamanhos não indicados na tabela")
    elif len(sizes) == 1 and not re.fullmatch(r"[SMLX]{1,2}|\d{2}(/\d{2})?|Único|[SMLX] \(\d{2}/\d{2}\)", sizes[0]):
        review.append(f"tamanho por confirmar: {rec['size']}")
    rrp = money_cents(rec.get("rrp"))
    if rrp is not None and (rrp < cost or rrp > cost * 4):
        review.append(f"PVPR incoerente com o custo ({rrp/100:.2f} € vs {cost/100:.2f} €): ignorado")
        rrp = None
    elif rrp is None:
        review.append("sem PVPR")
    rows.append({
        "page": pn, "model_ref": ref, "name": name, "description": desc, "color": rec.get("color", ""),
        "sizes": sizes, "size_label": rec.get("size", ""), "unit": rec.get("unit", ""),
        "cost_cents": cost, "rrp_cents": rrp, "vat_rate": line_vat,
        "medical_device": device, "category_path": category_for(f"{name} {desc}"), "review": review,
    })
    if review:
        issues.append(f"p.{pn} {ref}: " + "; ".join(review))


def extract(path):
    rows, issues = [], []
    cols, carry, vat = None, {}, 23
    pending = []        # linhas cujo valor (célula unida) só aparece na página seguinte
    open_missing = set()
    with pdfplumber.open(path) as pdf:
        for pn, page in enumerate(pdf.pages, 1):
            notes = page_vat_notes(page.extract_text() or "")
            for tbl in page.find_tables({"vertical_strategy": "lines", "horizontal_strategy": "lines"}):
                data = tbl.extract()
                if not data:
                    continue
                v = section_vat(page, tbl.bbox[1])
                if v:
                    vat = v
                hdr = header_map(data[0], len(data[0]))
                start = 0
                if hdr:
                    for p in pending:                      # nova secção: o que ficou pendente não tem valor
                        finalize(*p, rows, issues)
                    pending, cols, start, carry = [], hdr, 1, {}
                    # cabeçalho unido pode vir fora de ordem: a coluna "ref" tem de parecer um código
                    codey = lambda v: bool(v) and " " not in v.strip() and bool(re.search(r"\d|^[A-Z]", v.strip()))
                    merged_header = sum(1 for c in data[0] if c) == 1
                    if merged_header and len(data) > 1 and "ref" in cols and "name" in cols:
                        ir, iname = cols.index("ref"), cols.index("name")
                        sample = data[1]
                        if ir < len(sample) and iname < len(sample) and not codey(sample[ir]) and codey(sample[iname]):
                            cols[ir], cols[iname] = "name", "ref"
                elif cols and len(data[0]) != len(cols):
                    continue                               # outra tabela (ex.: condições de venda), não é continuação
                if not cols:
                    continue
                regions = open_regions(page, tbl, len(data[0]))
                open_missing = set()
                deferred, group, group_vals = [], 0, {}

                def close_group():
                    for d in deferred:
                        for k in list(d["keys"]):
                            if k in group_vals:
                                d["rec"][k] = group_vals[k][0]; d["raw"][k] = group_vals[k][1]
                        finalize(d["rec"], d["raw"], pn, notes, vat, rows, issues)
                    deferred.clear()
                row_tops = [r.bbox[1] for r in tbl.rows]
                # resolve pendentes da página anterior com o texto do topo desta tabela
                if pending and not hdr:
                    still = []
                    for rec, raw, ppn, pnotes, pvat, missing in pending:
                        for i, k in list(missing.items()):
                            first = tbl.rows[0].cells[i] if tbl.rows and i < len(tbl.rows[0].cells) else None
                            txt = data[0][i] if i < len(data[0]) else None
                            top = regions.get(i, {}).get("top")
                            if first and abs(first[1] - tbl.bbox[1]) < 2 and txt:
                                rec[k] = norm(txt); raw[k] = txt
                            elif top and top[1]:
                                rec[k] = norm(top[1]); raw[k] = top[1]
                            else:
                                continue
                            del missing[i]
                        if missing:
                            still.append((rec, raw, ppn, pnotes, pvat, missing))
                        else:
                            finalize(rec, raw, ppn, pnotes, pvat, rows, issues)
                    for p in still:
                        finalize(*p[:5], rows, issues)
                    pending = []
                for ri, r in enumerate(data[start:], start):
                    rec, raw, missing = {}, {}, {}
                    tr = tbl.rows[ri] if ri < len(tbl.rows) else None
                    y = row_tops[ri] if ri < len(row_tops) else 0
                    for i, key in enumerate(cols):
                        if not key or i >= len(r):
                            continue
                        val = r[i]
                        reg = regions.get(i, {})
                        cb = tr.cells[i] if tr is not None and i < len(tr.cells) else None
                        if cb is not None:
                            open_missing.discard(i)
                        if val == "" and key in FILL and cb and tbl.bbox[3] - cb[3] < 2 and cb[3] - cb[1] < tbl.bbox[3] - tbl.bbox[1] - 2:
                            missing[i] = key                   # célula unida que continua na página seguinte
                            open_missing.add(i)
                            continue
                        if val is None and cb is None and i in open_missing:
                            missing[i] = key
                            continue
                        if not val:
                            if "top" in reg and y < reg["top"][0] - 1 and reg["top"][1]:
                                val = reg["top"][1]
                            elif "bottom" in reg and y >= reg["bottom"][0] - 1:
                                if reg["bottom"][1]:
                                    val = reg["bottom"][1]
                                elif key in FILL:
                                    missing[i] = key           # o valor está na página seguinte
                        if val:
                            raw[key] = val
                            rec[key] = norm(val)
                    gk = "desc" if "desc" in cols else "name"
                    new_group = any(cols[i] == gk and i < len(r) and r[i] for i in range(len(cols)))
                    if new_group and ri > start:
                        close_group(); group += 1; group_vals = {}
                    empty_keys = [cols[i] for i in range(min(len(cols), len(r))) if cols[i] in ("name", "size", "cost", "rrp", "unit")
                                  and r[i] == "" and i not in missing]
                    for i, k in enumerate(cols):         # células unidas: herda da linha de cima
                        if k not in FILL or i in missing:
                            continue
                        if k in rec:
                            carry[k] = rec[k]; carry["_raw_" + k] = raw[k]
                        elif k in carry:
                            cbi = tr.cells[i] if tr is not None and i < len(tr.cells) else None
                            continues = (not hdr and cbi is not None and abs(cbi[1] - tbl.bbox[1]) < 2)   # parte de cima de célula vinda da página anterior
                            merged = cbi is None or continues
                            if merged:
                                rec[k] = carry[k]; raw[k] = carry["_raw_" + k]
                            else:
                                carry.pop(k, None)
                    for k in ("name", "size", "cost", "rrp", "unit"):
                        if k in rec and k not in empty_keys:
                            group_vals[k] = (rec[k], raw[k])
                            for d in deferred:                     # valor centrado mais abaixo no mesmo modelo
                                if k in d["keys"]:
                                    d["rec"][k] = rec[k]; d["raw"][k] = raw[k]; d["keys"].discard(k)
                    if missing:
                        for i, k in missing.items():
                            carry.pop(k, None)
                        pending.append((rec, raw, pn, notes, vat, missing))
                    elif any(k not in rec for k in empty_keys):
                        deferred.append({"rec": rec, "raw": raw, "keys": set(k for k in empty_keys if k not in rec)})
                    else:
                        finalize(rec, raw, pn, notes, vat, rows, issues)
                    done = [d for d in deferred if not d["keys"]]
                    for d in done:
                        deferred.remove(d); finalize(d["rec"], d["raw"], pn, notes, vat, rows, issues)
                close_group()
        for p in pending:
            finalize(*p[:5], rows, issues)
    return rows, issues


def to_import_rows(rows):
    """um artigo por tamanho, no formato de import_rows"""
    out, i = [], 0
    for r in rows:
        base = r["name"].title() if r["name"] else r["description"]
        title = f"{base} {r['color']}".strip() if r["color"] else (f"{base} – {r['description']}" if r["name"] else base)
        for s in r["sizes"]:
            i += 1
            out.append({
                "row_index": i, "model_ref": r["model_ref"], "title": title, "brand": None, "color": r["color"] or None,
                "size": s, "supplier_sku": f"{r['model_ref']}-{s}" if s != "Único" else r["model_ref"],
                "ean": None, "cost_cents": r["cost_cents"], "rrp_cents": r["rrp_cents"], "vat_rate": r["vat_rate"],
                "category_path": r["category_path"], "description": r["description"],
            })
    return out


if __name__ == "__main__":
    rows, issues = extract(sys.argv[1])
    seen = {}
    for r in rows:
        key = r["model_ref"]
        if key in seen and seen[key]["name"] != r["name"]:
            msg = f"referência {key} repetida no PDF ({seen[key]['name']} {seen[key]['cost_cents']/100:.2f} € / {r['name']} {r['cost_cents']/100:.2f} €)"
            for x in (seen[key], r):
                if msg not in x["review"]:
                    x["review"].append(msg)
            issues.append(f"p.{r['page']} {msg}")
        seen.setdefault(key, r)
    imp = to_import_rows(rows)
    json.dump({"modelos": rows, "linhas": imp, "avisos": issues}, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
    if len(sys.argv) > 3:
        with open(sys.argv[3], "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(["Página", "Ref.", "Nome", "Descrição", "Cor", "Tamanhos", "Custo s/IVA €", "PVPR c/IVA €", "IVA %", "Disp. médico", "Categoria", "Rever"])
            for r in rows:
                w.writerow([r["page"], r["model_ref"], r["name"], r["description"], r["color"], r["size_label"],
                            f"{r['cost_cents']/100:.2f}".replace(".", ","), f"{(r['rrp_cents'] or 0)/100:.2f}".replace(".", ","),
                            r["vat_rate"], "sim" if r["medical_device"] else "", r["category_path"] or "", "; ".join(r["review"])])
    print(f"modelos/cores: {len(rows)} | artigos (com tamanhos): {len(imp)} | avisos: {len(issues)}")
    for x in issues[:20]:
        print(" -", x)
