import Link from "next/link";
import CartLink from "./CartLink";

export default function Header() {
  return (
    <header className="top">
      <div className="wrap">
        <Link href="/" className="logo" aria-label="iNurse, página inicial">i<span>Nurse</span></Link>
        <nav aria-label="Categorias">
          <Link href="/c/calcado/socas">Socas</Link>
          <Link href="/c/calcado/sapatos">Sapatos</Link>
          <Link href="/c/calcado/sapatilhas">Sapatilhas</Link>
          <Link href="/c/meias">Meias</Link>
          <Link href="/loja">Tudo</Link>
        </nav>
        <form action="/loja" className="search" role="search">
          <label htmlFor="q" className="sr-only">Pesquisar</label>
          <input id="q" name="q" type="search" placeholder="Pesquisar" />
        </form>
        <CartLink />
      </div>
    </header>
  );
}
