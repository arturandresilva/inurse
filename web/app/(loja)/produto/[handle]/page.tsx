import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BuyBox from "@/components/BuyBox";
import FavoriteButton from "@/components/FavoriteButton";
import Gallery from "@/components/Gallery";
import { colorLabel, getCategories, getModelColors, getProduct, image, sellable } from "@/lib/catalog";
import { categoryHref, categoryLabel, SITE_URL, stripHtml } from "@/lib/format";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const p = await getProduct((await params).handle);
  if (!p) return {};
  const desc = p.seo_description || p.excerpt || stripHtml(p.description_html) || `${p.title} na iNurse.`;
  return {
    title: p.seo_title || p.title, description: desc,
    alternates: { canonical: `/produto/${p.handle}` },
    openGraph: { title: p.title, description: desc, images: p.product_images[0]?.url ? [p.product_images[0].url] : [] },
  };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ tamanho?: string }> }) {
  const [{ handle }, sp] = await Promise.all([params, searchParams]);
  const p = await getProduct(handle);
  if (!p) notFound();
  const [cats, colors] = await Promise.all([getCategories(), getModelColors(p)]);
  const main = cats.find((c) => p.product_categories.some((pc) => pc.category_id === c.id) && c.path.split(">").length === 2 && !c.path.includes("COMPRAR POR"));
  const images = p.product_images.map((i) => i.url);
  const out = p.status === "out_of_stock" || !p.variants.some(sellable);
  const prices = p.variants.map((v) => v.price_cents);
  const ld = {
    "@context": "https://schema.org", "@type": "Product", name: p.title, image: images, description: stripHtml(p.description_html, 500),
    brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined, sku: p.handle,
    offers: { "@type": "AggregateOffer", priceCurrency: "EUR", lowPrice: (Math.min(...prices) / 100).toFixed(2), highPrice: (Math.max(...prices) / 100).toFixed(2),
      offerCount: p.variants.length, availability: out ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", url: `${SITE_URL}/produto/${p.handle}` },
  };
  return (
    <div className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <div className="pdp">
        <Gallery images={images} alt={p.title} />
        <div className="buy">
          <p className="crumbs"><Link href="/loja">Loja</Link>{main ? <> / <Link href={categoryHref(main.path)}>{categoryLabel(main.name)}</Link></> : null}</p>
          {p.brand && <p className="brand">{p.brand}</p>}
          <h1>{p.model ?? p.title}</h1>
          {p.excerpt && <p className="muted" style={{ marginTop: 10 }}>{p.excerpt}</p>}
          {p.model && (
            <div className="color-choice">
              <p className="color-name"><span className="muted">Cor:</span> <strong>{colorLabel(p)}</strong></p>
              {colors.length > 1 && (
                <nav className="colors" aria-label="Escolher a cor">
                  {colors.map((c) => {
                    const u = image(c);
                    const off = c.status === "out_of_stock" || !c.variants.some(sellable);
                    return (
                      <Link key={c.id} href={`/produto/${c.handle}${sp.tamanho ? `?tamanho=${sp.tamanho}` : ""}`} scroll={false}
                        className={`color${c.id === p.id ? " on" : ""}${off ? " off" : ""}`} aria-current={c.id === p.id ? "page" : undefined}
                        title={`${colorLabel(c)}${off ? " (esgotado)" : ""}`} aria-label={`${colorLabel(c)}${off ? ", esgotado" : ""}`}>
                        {u ? <img src={u} alt="" loading="lazy" /> : <span>{colorLabel(c).slice(0, 2)}</span>}
                      </Link>
                    );
                  })}
                </nav>
              )}
            </div>
          )}
          <BuyBox title={p.title} handle={p.handle} image={images[0] ?? null} initialSize={sp.tamanho} vatRate={Number(p.vat_rate)} outOfStock={out}
            variants={p.variants.map((v) => ({ id: v.id, option_value: v.option_value, price_cents: v.price_cents, compare_at_cents: v.compare_at_cents, available: sellable(v) && p.status === "active" }))} />
          <FavoriteButton productId={p.id} handle={p.handle} />
          <ul className="promise">
            <li>Envio CTT com número de seguimento</li>
            <li>Troca de tamanho com recolha em casa</li>
            <li>Pagamento por MB WAY, Multibanco ou transferência</li>
          </ul>
          {p.description_html && (
            <div className="desc">
              <h2>Sobre este modelo</h2>
              <div dangerouslySetInnerHTML={{ __html: p.description_html }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
