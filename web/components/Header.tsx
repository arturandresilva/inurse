import Link from "next/link";
import CartLink from "./CartLink";
import AccountLink from "./AccountLink";
import LangSwitch from "./LangSwitch";
import Logo from "./Logo";
import { getCategories, getProducts, groupByModel } from "@/lib/catalog";
import { categoryHref, money } from "@/lib/format";
import { loc } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { supabase } from "@/lib/supabase";

async function freeFrom(): Promise<number> {
  const { data } = await supabase.from("settings").select("value").eq("key", "public.shipping").maybeSingle();
  const z = (data?.value?.zones ?? []).find((x: { region: string }) => x.region === "Continente");
  return Number(z?.free_from_cents ?? 0);
}

export default async function Header() {
  const [{ t, locale }, cats, products, free] = await Promise.all([getT(), getCategories(), getProducts(), freeFrom()]);
  const name = (c: (typeof cats)[number]) => { const n = loc(c, locale, "name"); return n.charAt(0) + n.slice(1).toLowerCase(); };
  const types = cats.filter((c) => c.path.startsWith("CALÇADO>") && c.path.split(">").length === 2 && !c.path.includes("COMPRAR POR"));
  const others = cats.filter((c) => !c.parent_id && c.path !== "CALÇADO");
  const profs = cats.filter((c) => c.path.startsWith("CALÇADO>COMPRAR POR PROFISSÃO>"));
  const models = groupByModel(products.filter((p) => p.status === "active" && p.model)).sort((a, b) => b.items.length - a.items.length).slice(0, 14)
    .sort((a, b) => a.name.localeCompare(b.name));
  const perks = [
    free > 0 ? t("Portes grátis acima de {v}", { v: money(free) }) : t("Envio CTT para todo o país"),
    t("Trocas e devoluções em 15 dias"),
    t("Pagamento MB WAY, Multibanco ou transferência"),
  ];
  const menu = (
    <>
      <div>
        <h3>{t("Categorias")}</h3>
        <ul>
          {[...types, ...others].map((c) => <li key={c.id}><Link href={categoryHref(c.path)}>{name(c)}</Link></li>)}
          <li><Link href="/loja">{t("Ver tudo")}</Link></li>
        </ul>
      </div>
      {profs.length > 0 && (
        <div>
          <h3>{t("Por profissão")}</h3>
          <ul>{profs.map((c) => <li key={c.id}><Link href={categoryHref(c.path)}>{loc(c, locale, "name")}</Link></li>)}</ul>
        </div>
      )}
      <div className="mega-models">
        <h3>{t("Por modelo")}</h3>
        <ul>{models.map((g) => <li key={g.key}><Link href={`/produto/${g.lead.handle}`}>{g.name}</Link></li>)}</ul>
      </div>
    </>
  );
  return (
    <>
      <div className="announce"><div className="wrap">{perks.map((p) => <span key={p}>{p}</span>)}</div></div>
      <header className="top">
        <div className="wrap">
          <details className="mnav">
            <summary aria-label={t("Menu")}><span /><span /><span /></summary>
            <div className="mnav-panel">
              <form action="/loja" role="search" className="search"><input name="q" type="search" placeholder={t("Pesquisar modelos")} aria-label={t("Pesquisar")} /></form>
              {menu}
              <LangSwitch />
            </div>
          </details>
          <Link href="/" className="logo" aria-label={t("iNurse, página inicial")}><Logo height={30} /></Link>
          <nav className="mainnav" aria-label={t("Categorias")}>
            <div className="mega-wrap">
              <Link href="/loja" className="mega-trigger">{t("Loja")} <span aria-hidden="true">▾</span></Link>
              <div className="mega"><div className="wrap mega-inner">{menu}</div></div>
            </div>
            {types.slice(0, 3).map((c) => <Link key={c.id} href={categoryHref(c.path)}>{name(c)}</Link>)}
            {others.slice(0, 1).map((c) => <Link key={c.id} href={categoryHref(c.path)}>{name(c)}</Link>)}
          </nav>
          <form action="/loja" className="search" role="search">
            <label htmlFor="q" className="sr-only">{t("Pesquisar")}</label>
            <input id="q" name="q" type="search" placeholder={t("Pesquisar modelos")} />
          </form>
          <div className="top-actions">
            <LangSwitch />
            <AccountLink />
            <CartLink />
          </div>
        </div>
      </header>
    </>
  );
}
