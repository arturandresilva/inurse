import Link from "next/link";
import { image, minPrice, sellable, type Product } from "@/lib/catalog";
import { money } from "@/lib/format";

export default function ProductCard({ p, size }: { p: Product; size?: string }) {
  const img = image(p);
  const vs = size ? p.variants.filter((v) => v.option_value.split("/").includes(size)) : p.variants;
  const from = minPrice(p);
  const cmp = Math.max(0, ...p.variants.map((v) => v.compare_at_cents ?? 0));
  const out = p.status === "out_of_stock" || !vs.some(sellable);
  const many = new Set(p.variants.map((v) => v.price_cents)).size > 1;
  return (
    <Link href={`/produto/${p.handle}${size ? `?tamanho=${size}` : ""}`} className="prod">
      <div className="ph">{img ? <img src={img} alt="" loading="lazy" /> : null}</div>
      <h3>{p.title}</h3>
      <div className="meta">
        <span className="price">{many ? "desde " : ""}{money(from)}{cmp > from ? <span className="was">{money(cmp)}</span> : null}</span>
        {out ? <span className="tag-out">Esgotado</span> : <span>{p.variants.length} tamanhos</span>}
      </div>
    </Link>
  );
}
