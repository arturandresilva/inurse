import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import Stars from "@/components/Stars";
import Finder from "@/components/Finder";
import HeroSlider from "@/components/HeroSlider";
import HeroParticles from "@/components/HeroParticles";
import { getCategories, getProducts, groupByModel, image, type Product } from "@/lib/catalog";
import { categoryHref, SIZES } from "@/lib/format";
import { loc } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { getStoreReviews } from "@/lib/reviews";
import { getHome } from "@/lib/home";

const I: Record<string, React.ReactNode> = {
  truck: <path d="M3 6h11v9H3zM14 9h4l3 3v3h-7M7 18.5a1.5 1.5 0 1 0 0-.01M17 18.5a1.5 1.5 0 1 0 0-.01" />,
  swap: <path d="M4 8h13l-3-3M20 16H7l3 3" />,
  shield: <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z M8.5 12l2.5 2.5 4.5-5" />,
  grip: <path d="M4 17c3-1 5-4 8-4s5 3 8 4M6 13l1-2M10 11l.5-2M14 11l-.5-2M18 13l-1-2" />,
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  clock: <path d="M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />,
  feather: <path d="M20 4c-6 0-12 4-13 13l-3 3M7 17h7M10 13h6M13 9h5" />,
};
const Icon = ({ k, s = 22 }: { k: string; s?: number }) => <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{I[k]}</svg>;

export default async function Home() {
  const { t, locale } = await getT();
  const [products, cats, store, home] = await Promise.all([getProducts(), getCategories(), getStoreReviews(6), getHome(locale)]);
  const top = home.campaigns.find((c) => c.placement === "topo");
  const bands = home.campaigns.filter((c) => c.placement === "faixa");
  const labels = { prev: t("Anterior"), next: t("Seguinte"), go: t("Ir para o diapositivo"), pause: t("Pausar"), play: t("Continuar") };
  const active = products.filter((p) => p.status === "active");
  const groups = groupByModel([...active.filter((p) => p.featured), ...active.filter((p) => !p.featured)]);
  const featured = groups.slice(0, 8);
  const inCat = (path: string) => { const ids = new Set(cats.filter((c) => c.path === path || c.path.startsWith(path + ">")).map((c) => c.id)); return active.filter((p: Product) => p.product_categories.some((pc) => ids.has(pc.category_id))); };
  const cname = (n: string) => n.charAt(0) + n.slice(1).toLowerCase();
  const tiles = [...cats.filter((c) => c.path.startsWith("CALÇADO>") && c.path.split(">").length === 2 && !c.path.includes("COMPRAR POR")), ...cats.filter((c) => !c.parent_id && c.path !== "CALÇADO")]
    .map((c) => { const ps = inCat(c.path); const img = home.settings.tiles[c.id] || (ps.find((p) => image(p)) ? image(ps.find((p) => image(p))!) : null);
      return { c, img, n: groupByModel(ps).length, name: cname(loc(c, locale, "name")) }; })
    .filter((x) => x.n > 0).slice(0, 4);
  // fotos do holograma do destaque: as escolhidas no backoffice ou as de referência (recortadas, em /holo)
  const holo = { soca: home.settings.hero_images[0] || "/holo/soca.png", meia: home.settings.hero_images[1] || "/holo/meia.png" };
  const profs = cats.filter((c) => c.path.startsWith("CALÇADO>COMPRAR POR PROFISSÃO>"));
  const quotes = store.list.filter((r) => r.body).slice(0, 3);

  return (
    <>
      {top ? <HeroSlider c={top} labels={labels} /> : (
        <section className="h4">
          <div className="wrap h4-grid">
            <div className="h4-copy">
              <p className="pill"><span aria-hidden="true">♥</span> {t("Para quem cuida")}</p>
              <h1>{t("Conforto para turnos longos.")}</h1>
              <p className="h4-sub">{t("Socas, sapatilhas e meias escolhidas para profissionais de saúde.")}</p>
              <form action="/loja" role="search" className="hero-search">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
                <input name="q" type="search" placeholder={t("Procurar modelo, marca ou cor")} aria-label={t("Pesquisar")} />
                <button className="btn">{t("Procurar")}</button>
              </form>
              <nav className="quick" aria-label={t("Categorias")}>
                {tiles.map(({ c, name }) => <Link key={c.id} href={categoryHref(c.path)}>{name}</Link>)}
                <Link href="/loja">{t("Ver tudo")} →</Link>
              </nav>
            </div>
            <div className="h4-art" aria-hidden="true">
              <HeroParticles labels={{ logo: "iNurse", soca: t("Socas"), meia: t("Meias de descanso") }} images={holo} />
              <div className="h4-chip c1"><Icon k="grip" s={18} /> {t("Sola antiderrapante")}</div>
              <div className="h4-chip c2">{store.count > 0 ? <><Stars value={store.avg} /> <b>{store.avg.toFixed(1).replace(".", ",")}</b></> : <><Icon k="swap" s={18} /> {t("Troca de tamanho fácil")}</>}</div>
            </div>
          </div>
        </section>
      )}

      <section className="trust2" aria-label={t("Vantagens")}>
        <div className="wrap trust2-row">
          <span><Icon k="truck" s={20} /> <b>{t("Envio CTT")}</b> {t("para todo o país")}</span>
          <span><Icon k="swap" s={20} /> <b>{t("15 dias")}</b> {t("para trocar")}</span>
          <span><Icon k="shield" s={20} /> <b>{t("Pagamento seguro")}</b> MB WAY · Multibanco</span>
          {store.count > 0 && <span><Stars value={store.avg} /> <b>{store.avg.toFixed(1).replace(".", ",")}/5</b> {t("{n} avaliações", { n: store.count })}</span>}
        </div>
      </section>

      {bands.map((c) => <div key={c.id} className="slider-faixa-wrap"><HeroSlider c={c} labels={labels} /></div>)}

      <section className="sec">
        <div className="wrap">
          <div className="sec-head"><div><p className="eyebrow2">{t("Os favoritos de quem trabalha por turnos")}</p><h2>{t("Os mais escolhidos")}</h2></div><Link className="more" href="/loja">{t("Ver todos")} →</Link></div>
          <div className="grid">{featured.map((g) => <ProductCard key={g.key} g={g} t={t} locale={locale} />)}</div>
        </div>
      </section>

      <section className="sec finder-sec">
        <div className="wrap finder-wrap">
          <div className="finder-intro">
            <p className="eyebrow2">{t("Em 10 segundos")}</p>
            <h2>{t("Encontra o teu par")}</h2>
            <p className="muted">{t("Mostramos só os modelos que temos no teu número.")}</p>
          </div>
          <Finder cats={tiles.map(({ c, name }) => ({ href: categoryHref(c.path), name }))} sizes={SIZES} />
        </div>
      </section>

      {tiles.length > 0 && (
        <section className="sec">
          <div className="wrap">
            <div className="sec-head"><div><p className="eyebrow2">{t("Categorias")}</p><h2>{t("Compra por categoria")}</h2></div></div>
            <div className={`bento n${tiles.length}`}>
              {tiles.map(({ c, img, n, name }, i) => (
                <Link key={c.id} href={categoryHref(c.path)} className={`bento-tile t${i}`}>
                  <div className="bento-txt"><strong>{name}</strong><span>{n === 1 ? t("1 modelo") : t("{n} modelos", { n })}</span><b className="bento-go" aria-hidden="true">→</b></div>
                  {img ? <img src={img} alt="" loading="lazy" /> : null}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="sec why2">
        <div className="wrap">
          <div className="sec-head"><div><p className="eyebrow2 on-dark">{t("Feito para o dia a dia no serviço")}</p><h2>{t("Pensado para turnos de 12 horas")}</h2></div></div>
          <div className="why2-grid">
            <div><Icon k="grip" s={28} /><strong>{t("Aderência")}</strong><p>{t("Solas antiderrapantes para pisos lisos e molhados.")}</p></div>
            <div><Icon k="drop" s={28} /><strong>{t("Fácil de limpar")}</strong><p>{t("Materiais que se lavam depressa entre turnos.")}</p></div>
            <div><Icon k="feather" s={28} /><strong>{t("Leveza")}</strong><p>{t("Menos peso em cada passo, do primeiro ao último.")}</p></div>
            <div><Icon k="clock" s={28} /><strong>{t("Horas de pé")}</strong><p>{t("Meias de descanso e compressão para pernas cansadas.")}</p></div>
          </div>
        </div>
      </section>

      {profs.length > 0 && (
        <section className="sec">
          <div className="wrap">
            <div className="sec-head"><div><p className="eyebrow2">{t("Para cada função")}</p><h2>{t("Compra por profissão")}</h2></div></div>
            <div className="prof2">
              {profs.map((c) => <Link key={c.id} href={categoryHref(c.path)}>{loc(c, locale, "name")}<span aria-hidden="true">→</span></Link>)}
            </div>
          </div>
        </section>
      )}

      {quotes.length > 0 && (
        <section className="sec">
          <div className="wrap">
            <div className="sec-head"><div><p className="eyebrow2">{t("Compras verificadas")}</p><h2>{t("O que dizem os clientes")}</h2></div><span className="muted"><Stars value={store.avg} /> {store.avg.toFixed(1).replace(".", ",")}/5</span></div>
            <div className="quotes2">
              {quotes.map((r) => (
                <figure key={r.id}><Stars value={r.rating} /><blockquote>“{r.body}”</blockquote><figcaption>{r.author} · {t("compra verificada")}</figcaption></figure>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="sec promise2">
        <div className="wrap promise2-card">
          <div><h2>{t("Compra sem risco")}</h2><p>{t("Não serviu? Trocas o número ou devolves em 15 dias. Respondemos por email a qualquer dúvida.")}</p></div>
          <div className="promise2-actions"><Link className="btn" href="/loja">{t("Começar a comprar")}</Link><Link className="btn ghost" href="/p/guia-de-tamanhos">{t("Guia de tamanhos")}</Link></div>
        </div>
      </section>
    </>
  );
}
