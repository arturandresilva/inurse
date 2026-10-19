import Link from "next/link";
import { colorLabel, image, minPrice, sellable, type ModelGroup } from "@/lib/catalog";
import { money } from "@/lib/format";

// Uma ficha por modelo: fotografia da cor principal e as outras cores em miniatura
export default function ProductCard({ g, size }: { g: ModelGroup; size?: string }) {
  const p = g.lead;
  const img = image(p);
  const all = g.items.flatMap((x) => x.variants);
  const from = Math.min(...g.items.map(minPrice));
  const cmp = Math.max(0, ...all.map((v) => v.compare_at_cents ?? 0));
  const out = g.items.every((x) => x.status === "out_of_stock" || !(size ? x.variants.filter((v) => v.option_value.split("/").includes(size)) : x.variants).some(sellable));
  const many = new Set(all.map((v) => v.price_cents)).size > 1;
  const colors = g.items.length;
  const shown = g.items.slice(0, 5);
  return (
    <Link href={`/produto/${p.handle}${size ? `?tamanho=${size}` : ""}`} className="prod">
      <div className="ph">{img ? <img src={img} alt="" loading="lazy" /> : null}</div>
      <h3>{g.name}</h3>
      {colors > 1 && (
        <div className="swatches" aria-label={`${colors} cores`}>
          {shown.map((x) => {
            const u = image(x);
            return <span key={x.id} className="sw" title={colorLabel(x)}>{u ? <img src={u} alt="" loading="lazy" /> : null}</span>;
          })}
          {colors > shown.length && <span className="sw-more">+{colors - shown.length}</span>}
        </div>
      )}
      <div className="meta">
        <span className="price">{many ? "desde " : ""}{money(from)}{cmp > from ? <span className="was">{money(cmp)}</span> : null}</span>
        {out ? <span className="tag-out">Esgotado</span> : <span>{colors > 1 ? `${colors} cores` : `${p.variants.length} tamanhos`}</span>}
      </div>
    </Link>
  );
}
