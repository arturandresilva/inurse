"""Gera JSON compacto (catálogo + clientes) para carregar em blocos via SQL (import_catalog / import_customers)."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from ctt_to_sql import read, catalog, slugify, gross_cents, dedupe_customers, REGION  # noqa

IMG = "https://cdn.lojasonlinectt.pt/usercontent/artur/media/images/"

def main(prod_csv, cli_csv, outdir):
    out = Path(outdir); out.mkdir(parents=True, exist_ok=True)
    prods, used = [], set()
    for pos, p in enumerate(catalog(read(prod_csv))):
        r = p["row"]; vat = r["Tax"] or "23"
        h = slugify(r["Title"]); b, i = h, 2
        while h in used: h, i = f"{b}-{i}", i + 1
        used.add(h)
        base_sku = None
        vs, seen = [], set()
        for v in p["variants"]:
            if v["Option1 Value"] in seen: continue
            seen.add(v["Option1 Value"])
            vs.append([v["Option1 Value"], v["SKU"], gross_cents(v["Price"] or r["Price"], vat)])
        desc = r["Description"]
        prods.append({
            "lh": r["Handle"], "h": h, "t": r["Title"], "ex": r["Excerpt"] if r["Excerpt"] not in desc else "",
            "d": desc, "b": r["Brand"], "tg": [t.strip() for t in r["Tags"].split(",") if t.strip()],
            "st": r["Status"] or "active", "vat": float(vat), "w": int(r["Weight"] or 0) or None,
            "f": r["Featured"] == "true", "st_t": r["Page Title"], "st_d": r["Meta Description"],
            "c": [c.strip() for c in r["Categories"].split(",") if c.strip()],
            "v": vs, "i": p["images"], "p": pos,
        })
    custs = []
    for r in dedupe_customers(read(cli_csv), []):
        addr = []
        for kind, pre in (("delivery", "Delivery"), ("billing", "Billing")):
            if r[f"{pre} Address"]:
                addr.append([kind, r[pre+" Name"], r[pre+" Phone"], r[pre+" Address"], r[pre+" Address Extra"],
                             r[pre+" Zip Code"], r[pre+" City"], REGION.get(r[pre+" Country"], r[pre+" Country"])])
        if len(addr) == 2 and addr[0][1:] == addr[1][1:]:
            addr[1] = ["billing="]   # igual à de entrega
        custs.append([r["Email"].strip().lower(), r["Name"], r["Company"], r["Fiscal id"],
                      r["Delivery Phone"] or r["Billing Phone"], r["Subscribe Newsletter"] == "true",
                      round(float(r["Total Spent"] or 0) * 100), int(r["Total Orders"] or 0), r["Created At"], addr])
    for name, data, n in (("catalog", prods, 25), ("customers", custs, 110)):
        for k in range(0, len(data), n):
            (out / f"{name}_{k//n:02d}.json").write_text(json.dumps(data[k:k+n], ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for f in sorted(out.glob("*.json")):
        print(f.name, f.stat().st_size)

if __name__ == "__main__":
    main(*sys.argv[1:4])
