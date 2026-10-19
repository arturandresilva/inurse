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

const ICONS: Record<string, React.ReactNode> = {
  truck: <path d="M3 6h11v9H3zM14 9h4l3 3v3h-7M7 18.5a1.5 1.5 0 1 0 0-.01M17 18.5a1.5 1.5 0 1 0 0-.01" />,
  swap: <path d="M4 8h13l-3-3M20 16H7l3 3" />,
  shield: <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z M8.5 12l2.5 2.5 4.5-5" />,
  heart: <path d="M12 20s-7-4.4-8.6-9.1C2.3 7.6 4.6 4.5 7.6 4.5c1.9 0 3.4 1 4.4 2.5 1-1.5 2.5-2.5 4.4-2.5 3 0 5.3 3.1 4.2 6.4C19 15.6 12 20 12 20z" />,
};
const Icon = ({ k }: { k: string }) => <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONS[k]}</svg>;

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
  const profs = cats.filter((c) => c.path.startsWith("CALÇADO>COMPRAR POR PROFISSÃO>"));
  const cname = (n: string) => n.charAt(0) + n.slice(1).toLowerCase();

  return (
    <>
      {top ? <HeroSlider c={top} labels={labels} /> : (
      <section className="hero2">
        <div className="wrap hero2-grid">
          <div>
            <p className="eyebrow">{t("Calçado profissional e meias de descanso")}</p>
            <h1>{t("Feitos para turnos de doze horas.")}</h1>
            <p className="lead">{t("Socas hospitalares, sapatos de trabalho e meias de descanso para quem passa o dia de pé. Envio CTT para todo o país.")}</p>
            <div className="hero2-cta">
              <Link className="btn" href="/c/calcado/socas">{t("Ver socas")}</Link>
              <Link className="btn ghost" href="/loja">{t("Todos os modelos")}</Link>
            </div>
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

      <section className="trust">
        <div className="wrap trust-grid">
          <div><Icon k="truck" /><div><strong>{t("Envio CTT")}</strong><span>{t("Com número de seguimento, para casa ou para o serviço")}</span></div></div>
          <div><Icon k="swap" /><div><strong>{t("Troca de tamanho fácil")}</strong><span>{t("15 dias para trocar ou devolver")}</span></div></div>
          <div><Icon k="shield" /><div><strong>{t("Pagamento seguro")}</strong><span>{t("MB WAY, Multibanco ou transferência")}</span></div></div>
          <div><Icon k="heart" /><div><strong>{t("Feito para a saúde")}</strong><span>{t("Antiderrapante, leve e fácil de lavar")}</span></div></div>
        </div>
      </section>

      {bands.map((c) => <div key={c.id} className="slider-faixa-wrap"><HeroSlider c={c} labels={labels} /></div>)}

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
          <div className="section-head"><h2>{t("Que número calças?")}</h2><span className="muted">{t("Mostramos só os modelos com o teu tamanho")}</span></div>
          <div className="size-grid">
            {SIZES.map((s) => <Link key={s} href={`/loja?tamanho=${s}`} className="size-btn" aria-label={t("Ver modelos no tamanho {s}", { s })}>{s}</Link>)}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head"><h2>{t("Os mais escolhidos")}</h2><Link href="/loja">{t("Ver todos")}</Link></div>
          <div className="grid">{featured.map((g) => <ProductCard key={g.key} g={g} t={t} locale={locale} />)}</div>
        </div>
      </section>

      {profs.length > 0 && (
        <section className="section prof-band">
          <div className="wrap">
            <div className="section-head"><h2>{t("Um modelo para cada profissão")}</h2></div>
            <div className="prof-tiles">
              {profs.map((c) => <Link key={c.id} href={categoryHref(c.path)} className="prof-tile">{loc(c, locale, "name")}<b aria-hidden="true">→</b></Link>)}
            </div>
          </div>
        </section>
      )}

      {store.count > 0 && (
        <section className="section">
          <div className="wrap">
            <div className="section-head"><h2>{t("O que dizem os clientes")}</h2><span className="muted"><Stars value={store.avg} /> {store.avg.toFixed(1).replace(".", ",")}/5</span></div>
            <div className="quotes">
              {store.list.filter((r) => r.body).slice(0, 3).map((r) => (
                <figure key={r.id} className="quote">
                  <Stars value={r.rating} />
                  <blockquote>“{r.body}”</blockquote>
                  <figcaption>{r.author} · {t("compra verificada")}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section why">
        <div className="wrap why-grid">
          <div>
            <h2>{t("Porquê comprar na iNurse?")}</h2>
            <p className="muted" style={{ marginTop: 10 }}>{t("Somos uma loja portuguesa especializada em calçado para profissionais de saúde. Escolhemos modelos testados em turnos longos e ajudamos a acertar no tamanho.")}</p>
          </div>
          <ul>
            <li><strong>{t("Aconselhamento a sério")}</strong> {t("Respondemos por email ou telefone antes e depois da compra.")}</li>
            <li><strong>{t("Marcas de confiança")}</strong> {t("Wock, Schurr e meias de descanso e compressão Nursing Care.")}</li>
            <li><strong>{t("Sem complicações")}</strong> {t("Trocas de tamanho simples e reembolso rápido.")}</li>
          </ul>
        </div>
      </section>
    </>
  );
}
