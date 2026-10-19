import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BuyBox from "@/components/BuyBox";
import FavoriteButton from "@/components/FavoriteButton";
import Gallery from "@/components/Gallery";
import ReviewList from "@/components/ReviewList";
import Stars from "@/components/Stars";
import { getProductReviews } from "@/lib/reviews";
import { colorLabel, getCategories, getModelColors, getProduct, image, sellable } from "@/lib/catalog";
import { categoryHref, SITE_URL, stripHtml } from "@/lib/format";
import { loc } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";


export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const [p, { locale }] = await Promise.all([getProduct((await params).handle), getT()]);
  if (!p) return {};
  const desc = loc(p, locale, "seo_description") || loc(p, locale, "excerpt") || stripHtml(loc(p, locale, "description_html")) || `${p.title} · iNurse`;
  return {
    title: loc(p, locale, "seo_title") || p.title, description: desc,
    alternates: { canonical: `/produto/${p.handle}` },
    openGraph: { title: p.title, description: desc, images: p.product_images[0]?.url ? [p.product_images[0].url] : [] },
  };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ tamanho?: string }> }) {
  const [{ handle }, sp] = await Promise.all([params, searchParams]);
  const p = await getProduct(handle);
  if (!p) notFound();
  const [cats, colors, rv, { t, locale }] = await Promise.all([getCategories(), getModelColors(p), getProductReviews(p), getT()]);
  const excerpt = loc(p, locale, "excerpt");
  const description = loc(p, locale, "description_html");
  const cname = (n: string) => (n === n.toUpperCase() ? n.charAt(0) + n.slice(1).toLowerCase() : n);
  const main = cats.find((c) => p.product_categories.some((pc) => pc.category_id === c.id) && c.path.split(">").length === 2 && !c.path.includes("COMPRAR POR"));
  const images = p.product_images.map((i) => i.url);
  const out = p.status === "out_of_stock" || !p.variants.some(sellable);
  const prices = p.variants.map((v) => v.price_cents);
  const ld = {
    "@context": "https://schema.org", "@type": "Product", name: p.title, image: images, description: stripHtml(p.description_html, 500),
    brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined, sku: p.handle,
    aggregateRating: rv.count ? { "@type": "AggregateRating", ratingValue: rv.avg.toFixed(1), reviewCount: rv.count } : undefined,
    offers: { "@type": "AggregateOffer", priceCurrency: "EUR", lowPrice: (Math.min(...prices) / 100).toFixed(2), highPrice: (Math.max(...prices) / 100).toFixed(2),
      offerCount: p.variants.length, availability: out ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", url: `${SITE_URL}/produto/${p.handle}` },
  };
  return (
    <div className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <div className="pdp">
        <Gallery images={images} alt={p.title} />
        <div className="buy">
          <p className="crumbs"><Link href="/loja">{t("Loja")}</Link>{main ? <> / <Link href={categoryHref(main.path)}>{cname(loc(main, locale, "name"))}</Link></> : null}</p>
          {p.brand && <p className="brand">{p.brand}</p>}
          <h1>{p.model ?? p.title}</h1>
          {rv.count > 0 && <a href="#avaliacoes" className="rating-link"><Stars value={rv.avg} /> {rv.avg.toFixed(1).replace(".", ",")} · {rv.count === 1 ? t("1 avaliação") : t("{n} avaliações", { n: rv.count })}</a>}
          {excerpt && <p className="muted" style={{ marginTop: 10 }}>{excerpt}</p>}
          {p.model && (
            <div className="color-choice">
              <p className="color-name"><span className="muted">{t("Cor")}:</span> <strong>{colorLabel(p, locale, t)}</strong></p>
              {colors.length > 1 && (
                <nav className="colors" aria-label={t("Escolher a cor")}>
                  {colors.map((c) => {
                    const u = image(c);
                    const off = c.status === "out_of_stock" || !c.variants.some(sellable);
                    return (
                      <Link key={c.id} href={`/produto/${c.handle}${sp.tamanho ? `?tamanho=${sp.tamanho}` : ""}`} scroll={false}
                        className={`color${c.id === p.id ? " on" : ""}${off ? " off" : ""}`} aria-current={c.id === p.id ? "page" : undefined}
                        title={`${colorLabel(c, locale, t)}${off ? ` (${t("esgotado")})` : ""}`} aria-label={`${colorLabel(c, locale, t)}${off ? `, ${t("esgotado")}` : ""}`}>
                        {u ? <img src={u} alt="" loading="lazy" /> : <span>{colorLabel(c, locale, t).slice(0, 2)}</span>}
                      </Link>
                    );
                  })}
                </nav>
              )}
            </div>
          )}
          <BuyBox title={p.model && p.color ? `${p.model} · ${colorLabel(p, locale, t)}` : p.title} handle={p.handle} image={images[0] ?? null} initialSize={sp.tamanho} vatRate={Number(p.vat_rate)} outOfStock={out}
            variants={p.variants.map((v) => ({ id: v.id, option_value: v.option_value, price_cents: v.price_cents, compare_at_cents: v.compare_at_cents, available: sellable(v) && p.status === "active" }))} />
          <FavoriteButton productId={p.id} handle={p.handle} />
          <ul className="promise">
            <li>{t("Envio CTT com número de seguimento")}</li>
            <li>{t("Troca de tamanho fácil em 15 dias")}</li>
            <li>{t("Pagamento por MB WAY, Multibanco ou transferência")}</li>
          </ul>
          {description && (
            <div className="desc">
              <h2>{t("Sobre este modelo")}</h2>
              <div dangerouslySetInnerHTML={{ __html: description }} />
            </div>
          )}
        </div>
      </div>
      <ReviewList s={rv} t={t} locale={locale} title={t("Avaliações de quem comprou")} empty={t("Ainda não há avaliações deste modelo. Depois de receber a encomenda, enviamos-lhe um email para dar a sua opinião.")} />
    </div>
  );
}
