import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { getCategories, getProducts, groupByModel } from "@/lib/catalog";
import { categoryHref, SIZES } from "@/lib/format";

export const revalidate = 300;

export default async function Home() {
  const [products, cats] = await Promise.all([getProducts(), getCategories()]);
  const active = products.filter((p) => p.status === "active");
  const featured = groupByModel([...active.filter((p) => p.featured), ...active.filter((p) => !p.featured)]).slice(0, 8);
  const profs = cats.filter((c) => c.path.startsWith("CALÇADO>COMPRAR POR PROFISSÃO>"));
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <h1>Feitos para turnos de doze horas.</h1>
          <p className="lead">Socas hospitalares, sapatos de trabalho e meias de descanso para quem passa o dia de pé. Envio CTT para todo o país.</p>
          <div className="sizes-pick">
            <h2>Que número calças?</h2>
            <div className="size-grid">
              {SIZES.map((s) => <Link key={s} href={`/loja?tamanho=${s}`} className="size-btn" aria-label={`Ver modelos no tamanho ${s}`}>{s}</Link>)}
            </div>
          </div>
        </div>
      </section>

      {profs.length > 0 && (
        <section className="section">
          <div className="wrap">
            <div className="section-head"><h2>Escolhe pela tua profissão</h2></div>
            <div className="professions">
              {profs.map((c) => <Link key={c.id} href={categoryHref(c.path)} className="chip">{c.name}</Link>)}
            </div>
          </div>
        </section>
      )}

      <section className="section" style={{ paddingTop: 8 }}>
        <div className="wrap">
          <div className="section-head"><h2>Os mais escolhidos</h2><Link href="/loja">Ver todos</Link></div>
          <div className="grid">{featured.map((g) => <ProductCard key={g.key} g={g} />)}</div>
        </div>
      </section>

      <section className="section" style={{ background: "var(--mint)" }}>
        <div className="wrap" style={{ display: "grid", gap: 28, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
          <div><h3>Envio com CTT</h3><p className="muted" style={{ marginTop: 6 }}>Sai do armazém para tua casa ou para o serviço, com número de seguimento.</p></div>
          <div><h3>Troca de tamanho fácil</h3><p className="muted" style={{ marginTop: 6 }}>Não serviu? Pedes a troca na página da encomenda e a recolha é feita pela CTT.</p></div>
          <div><h3>MB WAY e Multibanco</h3><p className="muted" style={{ marginTop: 6 }}>Pagas no telemóvel ou por referência. Também aceitamos transferência.</p></div>
        </div>
      </section>
    </>
  );
}
