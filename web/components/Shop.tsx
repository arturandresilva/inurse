import Link from "next/link";
import ProductCard from "./ProductCard";
import { getCategories, getProducts, groupByModel, searchProducts, sellable, type Category } from "@/lib/catalog";
import { categoryHref, SIZES, sizeMatches } from "@/lib/format";
import { loc } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";

type Props = { category?: Category | null; size?: string; q?: string; basePath: string };

export default async function Shop({ category, size, q, basePath }: Props) {
  const [all, cats, { t, locale }] = await Promise.all([getProducts(), getCategories(), getT()]);
  const label = (c: Category) => { const n = loc(c, locale, "name"); return n === n.toUpperCase() ? n.charAt(0) + n.slice(1).toLowerCase() : n; };
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

  const groups = groupByModel(products);
  const tops = cats.filter((c) => !c.parent_id && c.path !== "CALÇADO");
  const calcado = cats.filter((c) => c.path.startsWith("CALÇADO>") && c.path.split(">").length === 2 && !c.path.includes("COMPRAR POR"));
  const profs = cats.filter((c) => c.path.startsWith("CALÇADO>COMPRAR POR PROFISSÃO>"));
  const qs = (s?: string) => { const u = new URLSearchParams(); if (q) u.set("q", q); if (s) u.set("tamanho", s); const t = u.toString(); return t ? `?${t}` : ""; };
  const title = q ? t("Resultados para \"{q}\"", { q }) : category ? label(category) : size ? t("Tamanho {s}", { s: size }) : t("Todos os modelos");

  return (
    <div className="wrap shop">
      <aside className="filters" aria-label={t("Filtros")}>
        <h2>{t("Tamanho")}</h2>
        <div className="fsizes">
          {SIZES.map((s) => (
            <Link key={s} href={`${basePath}${qs(size === s ? undefined : s)}`} aria-current={size === s}>{s}</Link>
          ))}
        </div>
        <h2>{t("Calçado")}</h2>
        <ul>
          {calcado.map((c) => <li key={c.id}><Link href={categoryHref(c.path) + qs(size)} aria-current={category?.id === c.id}>{label(c)}</Link></li>)}
        </ul>
        {profs.length > 0 && (<>
          <h2>{t("Por profissão")}</h2>
          <ul>{profs.map((c) => <li key={c.id}><Link href={categoryHref(c.path) + qs(size)} aria-current={category?.id === c.id}>{label(c)}</Link></li>)}</ul>
        </>)}
        {tops.length > 0 && (<>
          <h2>{t("Outros")}</h2>
          <ul>{tops.map((c) => <li key={c.id}><Link href={categoryHref(c.path) + qs(size)} aria-current={category?.id === c.id}>{label(c)}</Link></li>)}</ul>
        </>)}
      </aside>
      <section>
        <p className="crumbs"><Link href="/">{t("Início")}</Link> / <Link href="/loja">{t("Loja")}</Link>{category ? <> / {label(category)}</> : null}</p>
        <div className="section-head"><h1 style={{ fontSize: "clamp(1.8rem,3.5vw,2.6rem)" }}>{title}</h1><span className="muted">{groups.length === 1 ? t("1 modelo") : t("{n} modelos", { n: groups.length })}</span></div>
        {groups.length ? (
          <div className="grid">{groups.map((g) => <ProductCard key={g.key} g={g} size={size} t={t} locale={locale} />)}</div>
        ) : (
          <div className="empty">
            <h2>{t("Nada encontrado")}</h2>
            <p className="muted">{t("Experimenta outro tamanho ou categoria, ou")} <Link href="/loja">{t("vê todos os modelos")}</Link>.</p>
          </div>
        )}
      </section>
    </div>
  );
}
