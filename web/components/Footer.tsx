import Link from "next/link";
import { CookiePrefsLink } from "@/components/CookieNotice";
import Logo from "./Logo";
import { getLegal, phoneLabel } from "@/lib/legal";
import { getT } from "@/lib/i18n/server";

export default async function Footer() {
  const [{ t }, l] = await Promise.all([getT(), getLegal()]);
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="cols">
          <div>
            <Logo height={28} mono="#fff" />
            <p style={{ marginTop: 10, maxWidth: "40ch" }}>{t("Calçado profissional e meias de descanso para quem passa o turno de pé. Enviamos para todo o país com CTT.")}</p>
            <p className="foot-contact">
              <a href={`mailto:${l.email}`}>{l.email}</a><br />
              <a href={`tel:+351${l.phone.replace(/\D/g, "")}`}>{phoneLabel(l.phone)}</a> <span className="foot-note">{t("(chamada para rede móvel nacional)")}</span>
            </p>
          </div>
          <div>
            <h2>{t("Loja")}</h2>
            <ul>
              <li><Link href="/c/calcado/socas">{t("Socas")}</Link></li>
              <li><Link href="/c/calcado/sapatilhas">{t("Sapatilhas")}</Link></li>
              <li><Link href="/c/meias">{t("Meias")}</Link></li>
              <li><Link href="/loja">{t("Todos os modelos")}</Link></li>
              <li><Link href="/conta">{t("A minha conta")}</Link></li>
            </ul>
          </div>
          <div>
            <h2>{t("Ajuda")}</h2>
            <ul>
              <li><Link href="/p/envios">{t("Envios e portes")}</Link></li>
              <li><Link href="/p/trocas-e-devolucoes">{t("Trocas e devoluções")}</Link></li>
              <li><Link href="/p/guia-de-tamanhos">{t("Guia de tamanhos")}</Link></li>
              <li><Link href="/p/contactos">{t("Contactos")}</Link></li>
            </ul>
          </div>
          <div>
            <h2>{t("Informação legal")}</h2>
            <ul>
              <li><Link href="/p/termos-e-condicoes">{t("Termos e condições")}</Link></li>
              <li><Link href="/p/privacidade">{t("Política de privacidade e cookies")}</Link></li>
              <li><Link href="/livre-resolucao">{t("Direito de livre resolução")}</Link></li>
              <li><CookiePrefsLink /></li>
              <li><a href="https://www.livroreclamacoes.pt" target="_blank" rel="noopener noreferrer">{t("Livro de Reclamações")}</a></li>
              <li><a href="https://www.consumidor.gov.pt/resolucao-de-litigios.aspx" target="_blank" rel="noopener noreferrer">{t("Resolução alternativa de litígios")}</a></li>
            </ul>
          </div>
        </div>
        <div className="legal">
          <span>© {new Date().getFullYear()} iNurse</span>
          <span className="pay-badges" aria-label={t("Métodos de pagamento")}><b>MB WAY</b><b>Multibanco</b><b>{t("Transferência")}</b></span>
        </div>
      </div>
    </footer>
  );
}
