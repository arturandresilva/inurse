import Link from "next/link";
import { CookiePrefsLink } from "@/components/CookieNotice";
import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="cols">
          <div>
            <Logo height={26} mono="#fff" />
            <p style={{ marginTop: 8, maxWidth: "42ch" }}>Calçado profissional e meias de descanso para quem passa o turno de pé. Enviamos para todo o país com CTT.</p>
          </div>
          <div>
            <h2>Ajuda</h2>
            <ul>
              <li><Link href="/p/envios">Envios e portes</Link></li>
              <li><Link href="/p/trocas-e-devolucoes">Trocas e devoluções</Link></li>
              <li><Link href="/p/guia-de-tamanhos">Guia de tamanhos</Link></li>
              <li><Link href="/p/contactos">Contactos</Link></li>
            </ul>
          </div>
          <div>
            <h2>Informação legal</h2>
            <ul>
              <li><Link href="/p/termos-e-condicoes">Termos e condições</Link></li>
              <li><Link href="/p/privacidade">Política de privacidade e cookies</Link></li>
              <li><CookiePrefsLink /></li>
              <li><a href="https://www.livroreclamacoes.pt" target="_blank" rel="noopener noreferrer">Livro de Reclamações</a></li>
              <li><a href="https://www.consumidor.gov.pt/resolucao-de-litigios.aspx" target="_blank" rel="noopener noreferrer">Resolução alternativa de litígios</a></li>
            </ul>
          </div>
        </div>
        <div className="legal">
          <span>© {new Date().getFullYear()} iNurse</span>
          <span>Pagamentos: MB WAY · Multibanco · Transferência</span>
        </div>
      </div>
    </footer>
  );
}
