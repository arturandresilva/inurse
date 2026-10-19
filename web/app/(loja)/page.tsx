import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import Stars from "@/components/Stars";
import { getCategories, getProducts, groupByModel, image, type Product } from "@/lib/catalog";
import { categoryHref, SIZES } from "@/lib/format";
import { loc } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { getStoreReviews } from "@/lib/reviews";
import { getHome } from "@/lib/home";
import HeroSlider from "@/components/HeroSlider";


export default async function Home() {
  const { t, locale } = await getT();
  const [products, cats, store, home] = await Promise.all([getProducts(), getCategories(), getStoreReviews(6), getHome(locale)]);
  const top = home.campaigns.find((c) => c.placement === "topo");
  const bands = home.campaigns.filter((c) => c.placement === "faixa");
  const labels = { prev: t("Anterior"), next: t("Seguinte"), go: t("Ir para o diapositivo"), pause: t("Pausar"), play: t("Continuar") };
  const active = products.filter((p) => p.status === "active");
  const groups = groupByModel([...active.filter((p) => p.featured), ...active.filter((p) => !p.featured)]);
  const featured = groups.slice(0, 8);
  const heroImgs = (home.settings.hero_images.length ? home.settings.hero_images : groups.map((g) => image(g.lead)).filter(Boolean)).slice(0, 3) as string[];
  const inCat = (path: string) => { const ids = new Set(cats.filter((c) => c.path === path || c.path.startsWith(path + ">")).map((c) => c.id)); return active.find((p: Product) => p.product_categories.some((pc) => ids.has(pc.category_id)) && image(p)); };
  const tiles = [...cats.filter((c) => c.path.startsWith("CALÇADO>") && c.path.split(">").length === 2 && !c.path.includes("COMPRAR POR")), ...cats.filter((c) => !c.parent_id && c.path !== "CALÇADO")]
    .map((c) => ({ c, img: home.settings.tiles[c.id] || (inCat(c.path) ? image(inCat(c.path)!) : null) })).slice(0, 4);
  const cname = (n: string) => n.charAt(0) + n.slice(1).toLowerCase();

  return (
    <>
      {top ? <HeroSlider c={top} labels={labels} /> : (
      <section className="hero3">
        <div className="wrap hero3-grid">
          <div>
            <h1>{t("Calçado e meias para profissionais de saúde")}</h1>
            <form action="/loja" role="search" className="hero-search">
              <input name="q" type="search" placeholder={t("Procurar modelo, marca ou cor")} aria-label={t("Pesquisar")} />
              <button className="btn">{t("Procurar")}</button>
            </form>
            <nav className="quick" aria-label={t("Categorias")}>
              {tiles.map(({ c }) => <Link key={c.id} href={categoryHref(c.path)}>{cname(loc(c, locale, "name"))}</Link>)}
              <Link href="/loja">{t("Ver tudo")}</Link>
            </nav>
            {store.count > 0 && (
              <p className="hero2-rating"><Stars value={store.avg} /> <strong>{store.avg.toFixed(1).replace(".", ",")}/5</strong> · {t("{n} avaliações de clientes", { n: store.count })}</p>
            )}
          </div>
          <div className="hero2-art" aria-hidden="true">
            {heroImgs.map((src, i) => <div key={src} className={`blob b${i}`}><img src={src} alt="" /></div>)}
          </div>
        </div>
      </section>
      )}

      {bands.map((c) => <div key={c.id} className="slider-faixa-wrap"><HeroSlider c={c} labels={labels} /></div>)}

      <section className="section">
        <div className="wrap">
          <div className="section-head"><h2>{t("Os mais escolhidos")}</h2><Link href="/loja">{t("Ver todos")}</Link></div>
          <div className="grid">{featured.map((g) => <ProductCard key={g.key} g={g} t={t} locale={locale} />)}</div>
        </div>
      </section>

      {tiles.length > 0 && (
        <section className="section">
          <div className="wrap">
            <div className="section-head"><h2>{t("Compra por categoria")}</h2><Link href="/loja">{t("Ver tudo")}</Link></div>
            <div className="cat-tiles">
              {tiles.map(({ c, img }) => (
                <Link key={c.id} href={categoryHref(c.path)} className="cat-tile">
                  <div className="ph">{img ? <img src={img} alt="" loading="lazy" /> : null}</div>
                  <span>{cname(loc(c, locale, "name"))} <b aria-hidden="true">→</b></span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section sizes-band">
        <div className="wrap">
          <div className="section-head"><h2>{t("Que número calças?")}</h2></div>
          <div className="size-grid">
            {SIZES.map((s) => <Link key={s} href={`/loja?tamanho=${s}`} className="size-btn" aria-label={t("Ver modelos no tamanho {s}", { s })}>{s}</Link>)}
          </div>
        </div>
      </section>
    </>
  );
}
