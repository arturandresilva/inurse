import Link from "next/link";
import { colorLabel, image, minPrice, sellable, type ModelGroup } from "@/lib/catalog";
import { money } from "@/lib/format";
import type { Locale, T } from "@/lib/i18n";

// Uma ficha por modelo: fotografia da cor principal (a segunda fotografia aparece ao passar o rato) e as outras cores em miniatura
export default function ProductCard({ g, size, t, locale }: { g: ModelGroup; size?: string; t: T; locale: Locale }) {
  const p = g.lead;
  const img = image(p);
  const img2 = p.product_images[1]?.url ?? null;
  const all = g.items.flatMap((x) => x.variants);
  const from = Math.min(...g.items.map(minPrice));
  const cmp = Math.max(0, ...all.map((v) => v.compare_at_cents ?? 0));
  const out = g.items.every((x) => x.status === "out_of_stock" || !(size ? x.variants.filter((v) => v.option_value.split("/").includes(size)) : x.variants).some(sellable));
  const many = new Set(all.map((v) => v.price_cents)).size > 1;
  const colors = g.items.length;
  const shown = g.items.slice(0, 5);
  const off = cmp > from ? Math.round((1 - from / cmp) * 100) : 0;
  return (
    <Link href={`/produto/${p.handle}${size ? `?tamanho=${size}` : ""}`} className="prod">
      <div className={`ph${img2 ? " has-alt" : ""}`}>
        {img ? <img src={img} alt="" loading="lazy" /> : null}
        {img2 ? <img className="alt" src={img2} alt="" loading="lazy" /> : null}
        {off > 0 && <span className="badge sale">−{off}%</span>}
        {out && <span className="badge out">{t("Esgotado")}</span>}
      </div>
      {p.brand && <p className="prod-brand">{p.brand}</p>}
      <h3>{g.name}</h3>
      {colors > 1 && (
        <div className="swatches" aria-label={t("{n} cores", { n: colors })}>
          {shown.map((x) => {
            const u = image(x);
            return <span key={x.id} className="sw" title={colorLabel(x, locale, t)}>{u ? <img src={u} alt="" loading="lazy" /> : null}</span>;
          })}
          {colors > shown.length && <span className="sw-more">+{colors - shown.length}</span>}
        </div>
      )}
      <div className="meta">
        <span className="price">{many ? t("desde") + " " : ""}{money(from)}{cmp > from ? <span className="was">{money(cmp)}</span> : null}</span>
        <span>{colors > 1 ? t("{n} cores", { n: colors }) : t("{n} tamanhos", { n: p.variants.length })}</span>
      </div>
    </Link>
  );
}
