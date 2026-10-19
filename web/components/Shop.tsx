import Link from "next/link";
import ProductCard from "./ProductCard";
import { getCategories, getProducts, searchProducts, sellable, type Category } from "@/lib/catalog";
import { categoryHref, categoryLabel, SIZES, sizeMatches } from "@/lib/format";

type Props = { category?: Category | null; size?: string; q?: string; basePath: string };

export default async function Shop({ category, size, q, basePath }: Props) {
  const [all, cats] = await Promise.all([getProducts(), getCategories()]);
  let products = all;
  if (category) {
    const ids = new Set(cats.filter((c) => c.path === category.path || c.path.startsWith(category.path + ">")).map((c) => c.id));
    products = products.filter((p) => p.product_categories.some((pc) => ids.has(pc.category_id)));
  }
  if (q) {
    const hits = new Set(await searchProducts(q));
    const ql = q.toLowerCase();
    products = products.filter((p) => hits.has(p.id) || p.title.toLowerCase().includes(ql));
  }
  if (size) products = products.filter((p) => p.variants.some((v) => sizeMatches(v.option_value, size) && sellable(v)) && p.status === "active");

  const tops = cats.filter((c) => !c.parent_id && c.path !== "CALÇADO");
  const calcado = cats.filter((c) => c.path.startsWith("CALÇADO>") && c.path.split(">").length === 2 && !c.path.includes("COMPRAR POR"));
  const profs = cats.filter((c) => c.path.startsWith("CALÇADO>COMPRAR POR PROFISSÃO>"));
  const qs = (s?: string) => { const u = new URLSearchParams(); if (q) u.set("q", q); if (s) u.set("tamanho", s); const t = u.toString(); return t ? `?${t}` : ""; };
  const title = q ? `Resultados para "${q}"` : category ? categoryLabel(category.name) : size ? `Tamanho ${size}` : "Todos os produtos";

  return (
    <div className="wrap shop">
      <aside className="filters" aria-label="Filtros">
        <h2>Tamanho</h2>
        <div className="fsizes">
          {SIZES.map((s) => (
            <Link key={s} href={`${basePath}${qs(size === s ? undefined : s)}`} aria-current={size === s}>{s}</Link>
          ))}
        </div>
        <h2>Calçado</h2>
        <ul>
          {calcado.map((c) => <li key={c.id}><Link href={categoryHref(c.path) + qs(size)} aria-current={category?.id === c.id}>{categoryLabel(c.name)}</Link></li>)}
        </ul>
        {profs.length > 0 && (<>
          <h2>Por profissão</h2>
          <ul>{profs.map((c) => <li key={c.id}><Link href={categoryHref(c.path) + qs(size)} aria-current={category?.id === c.id}>{c.name}</Link></li>)}</ul>
        </>)}
        {tops.length > 0 && (<>
          <h2>Outros</h2>
          <ul>{tops.map((c) => <li key={c.id}><Link href={categoryHref(c.path) + qs(size)} aria-current={category?.id === c.id}>{categoryLabel(c.name)}</Link></li>)}</ul>
        </>)}
      </aside>
      <section>
        <p className="crumbs"><Link href="/">Início</Link> / <Link href="/loja">Loja</Link>{category ? <> / {categoryLabel(category.name)}</> : null}</p>
        <div className="section-head"><h1 style={{ fontSize: "clamp(1.8rem,3.5vw,2.6rem)" }}>{title}</h1><span className="muted">{products.length} produtos</span></div>
        {products.length ? (
          <div className="grid">{products.map((p) => <ProductCard key={p.id} p={p} size={size} />)}</div>
        ) : (
          <div className="empty">
            <h2>Nada encontrado</h2>
            <p className="muted">Experimenta outro tamanho ou categoria, ou <Link href="/loja">vê todos os produtos</Link>.</p>
          </div>
        )}
      </section>
    </div>
  );
}
