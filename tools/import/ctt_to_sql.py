"""Converte as exportações da Loja Online CTT (CSV ';', UTF-8 BOM) em SQL de importação.

Uso: python3 -I ctt_to_sql.py produtos.csv clientes.csv pasta_saida/
Gera: 002_seed_catalog.sql, 003_seed_customers.sql, relatorio_importacao.txt
"""
import csv, json, re, sys, unicodedata, uuid
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

NS = uuid.UUID("6f1c2a8e-0000-4000-8000-000000000001")
uid = lambda *k: str(uuid.uuid5(NS, "|".join(k)))

def q(v):
    if v is None or v == "":
        return "null"
    return "'" + str(v).replace("'", "''") + "'"

def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "produto"

def read(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))

def gross_cents(net, vat):
    return int((Decimal(net) * (1 + Decimal(vat) / 100) * 100).quantize(Decimal("1"), ROUND_HALF_UP))

def catalog(rows):
    products, cur = [], None
    for r in rows:
        if r["Title"]:
            cur = {"row": r, "variants": [], "images": []}
            products.append(cur)
        if cur is None:
            continue
        if r["Option1 Value"]:
            cur["variants"].append(r)
        if r["Image"]:
            cur["images"].append(r["Image"])
    return products

def build_catalog(products):
    out, cats, used, report = [], {}, set(), []
    for p in products:
        for c in p["row"]["Categories"].split(","):
            c = c.strip()
            parts = c.split(">") if c else []
            for i in range(len(parts)):
                path = ">".join(parts[: i + 1])
                cats.setdefault(path, (">".join(parts[:i]) or None, parts[i]))
    out.append("-- Categorias")
    for pos, (path, (parent, name)) in enumerate(sorted(cats.items(), key=lambda x: x[0].count(">"))):
        out.append(
            f"insert into categories (id,parent_id,name,slug,path,position) values "
            f"({q(uid('cat',path))},{q(uid('cat',parent)) if parent else 'null'},{q(name)},{q(slugify(name))},{q(path)},{pos});"
        )
    out.append("\n-- Produtos, variantes e imagens")
    n_var = n_img = 0
    for pos, p in enumerate(products):
        r = p["row"]
        vat = r["Tax"] or "23"
        handle = slugify(r["Title"])
        base, i = handle, 2
        while handle in used:
            handle, i = f"{base}-{i}", i + 1
        used.add(handle)
        pid = uid("prod", r["Handle"])
        tags = [t.strip() for t in r["Tags"].split(",") if t.strip()]
        tags_sql = "array[" + ",".join(q(t) for t in tags) + "]::text[]" if tags else "'{}'"
        weight = int(r["Weight"]) if r["Weight"] not in ("", "0") else None
        out.append(
            "insert into products (id,handle,legacy_handle,title,excerpt,description_html,brand,tags,status,vat_rate,"
            "weight_g,featured,option_name,seo_title,seo_description,position) values ("
            f"{q(pid)},{q(handle)},{q(r['Handle'])},{q(r['Title'])},{q(r['Excerpt'])},{q(r['Description'])},"
            f"{q(r['Brand'])},{tags_sql},{q(r['Status'] or 'active')},{vat},{weight if weight else 'null'},"
            f"{'true' if r['Featured']=='true' else 'false'},{q(r['Option1 Name'] or 'Tamanho')},"
            f"{q(r['Page Title'])},{q(r['Meta Description'])},{pos});"
        )
        for c in {c.strip() for c in r["Categories"].split(",") if c.strip()}:
            out.append(f"insert into product_categories values ({q(pid)},{q(uid('cat',c))});")
        seen = set()
        for vpos, v in enumerate(p["variants"]):
            ov = v["Option1 Value"]
            if ov in seen:
                report.append(f"Tamanho repetido ignorado: {r['Title']} / {ov}")
                continue
            seen.add(ov)
            stock = v["Stock"] if v["Stock"] != "" else "null"
            out.append(
                "insert into variants (id,product_id,option_value,sku,price_cents,stock,allow_backorder,active,position) values ("
                f"{q(uid('var',r['Handle'],ov))},{q(pid)},{q(ov)},{q(v['SKU'])},{gross_cents(v['Price'] or r['Price'], vat)},"
                f"{stock},{'true' if v['Stock Backorder']=='true' else 'false'},{'true' if v['Option Active']!='false' else 'false'},{vpos});"
            )
            n_var += 1
        for ipos, url in enumerate(p["images"]):
            out.append(f"insert into product_images (product_id,url,position) values ({q(pid)},{q(url)},{ipos});")
            n_img += 1
        if not p["variants"]:
            report.append(f"Produto sem variantes: {r['Title']}")
    return out, len(cats), n_var, n_img, report

REGION = {"Portugal - Continental": "Continente", "Portugal - Açores": "Açores", "Portugal - Madeira": "Madeira"}

def dedupe_customers(rows, report):
    """Junta registos com o mesmo email (ignora maiúsculas/espaços): fica o mais recente, soma o histórico."""
    by = {}
    for r in rows:
        k = r["Email"].strip().lower()
        if k in by:
            a = by[k]
            keep, other = (r, a) if r["Created At"] > a["Created At"] else (a, r)
            keep = dict(keep)
            keep["Total Spent"] = str(Decimal(a["Total Spent"] or "0") + Decimal(r["Total Spent"] or "0"))
            keep["Total Orders"] = str(int(a["Total Orders"] or 0) + int(r["Total Orders"] or 0))
            for f, v in other.items():
                if not keep.get(f) and v:
                    keep[f] = v
            by[k] = keep
            report.append(f"Cliente duplicado juntado: {k}")
        else:
            by[k] = r
    return list(by.values())

def build_customers(rows):
    out = []
    for r in rows:
        cid = uid("cust", r["Email"].lower())
        spent = int((Decimal(r["Total Spent"] or "0") * 100).quantize(Decimal("1"), ROUND_HALF_UP))
        out.append(
            "insert into customers (id,email,name,company,nif,phone,newsletter,legacy_total_spent_cents,legacy_total_orders,created_at) values ("
            f"{q(cid)},{q(r['Email'].strip().lower())},{q(r['Name'])},{q(r['Company'])},{q(r['Fiscal id'])},"
            f"{q(r['Delivery Phone'] or r['Billing Phone'])},{'true' if r['Subscribe Newsletter']=='true' else 'false'},"
            f"{spent},{int(r['Total Orders'] or 0)},{q(r['Created At'])});"
        )
        for kind, pre in (("delivery", "Delivery"), ("billing", "Billing")):
            if not r[f"{pre} Address"]:
                continue
            cc = {"PRT": "PT"}.get(r[f"{pre} Country Code"], r[f"{pre} Country Code"][:2] or "PT")
            out.append(
                "insert into addresses (customer_id,kind,name,phone,line1,line2,zip,city,region,country_code) values ("
                f"{q(cid)},{q(kind)},{q(r[pre+' Name'])},{q(r[pre+' Phone'])},{q(r[pre+' Address'])},"
                f"{q(r[pre+' Address Extra'])},{q(r[pre+' Zip Code'])},{q(r[pre+' City'])},"
                f"{q(REGION.get(r[pre+' Country'], r[pre+' Country']))},{q(cc)});"
            )
    return out

def main(prod_csv, cli_csv, outdir):
    outdir = Path(outdir); outdir.mkdir(parents=True, exist_ok=True)
    products = catalog(read(prod_csv))
    cat_sql, n_cat, n_var, n_img, report = build_catalog(products)
    customers = dedupe_customers(read(cli_csv), report)
    (outdir / "002_seed_catalog.sql").write_text("begin;\n" + "\n".join(cat_sql) + "\ncommit;\n", encoding="utf-8")
    (outdir / "003_seed_customers.sql").write_text("begin;\n" + "\n".join(build_customers(customers)) + "\ncommit;\n", encoding="utf-8")
    summary = {
        "produtos": len(products), "categorias": n_cat, "variantes": n_var, "imagens": n_img,
        "clientes": len(customers), "avisos": report,
    }
    (outdir / "relatorio_importacao.txt").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k != "avisos"}, ensure_ascii=False), "avisos:", len(report))
    for a in report[:20]:
        print(" -", a)

if __name__ == "__main__":
    main(*sys.argv[1:4])
