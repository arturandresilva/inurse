import Link from "next/link";
import { CookiePrefsLink } from "@/components/CookieNotice";
import Logo from "./Logo";
import { getLegal, getSocial, phoneLabel } from "@/lib/legal";
import { getT } from "@/lib/i18n/server";

export default async function Footer() {
  const [{ t }, l, social] = await Promise.all([getT(), getLegal(), getSocial()]);
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="cols">
          <div>
            <Logo height={28} light />
            <p style={{ marginTop: 10, maxWidth: "40ch" }}>{t("Calçado profissional e meias de descanso para quem passa o turno de pé. Enviamos para todo o país com CTT.")}</p>
            <p className="foot-contact">
              <a href={`mailto:${l.email}`}>{l.email}</a><br />
              <a href={`tel:+351${l.phone.replace(/\D/g, "")}`}>{phoneLabel(l.phone)}</a> <span className="foot-note">{t("(chamada para rede móvel nacional)")}</span>
            </p>
            {Object.keys(social).length > 0 && (
              <p className="foot-social">
                {(Object.entries(social) as [keyof typeof SOCIAL_ICONS, string][]).map(([k, url]) => (
                  <a key={k} href={url} target="_blank" rel="noopener noreferrer" aria-label={SOCIAL_ICONS[k][0]} title={SOCIAL_ICONS[k][0]}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={SOCIAL_ICONS[k][1]} /></svg>
                  </a>
                ))}
              </p>
            )}
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

const SOCIAL_ICONS = {
  instagram: ["Instagram", "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm5.5-1.5h.01"],
  facebook: ["Facebook", "M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6.5v3.5H9V21h3.5v-7.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z"],
  tiktok: ["TikTok", "M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.4 2.6 2.2 4.4 5 4.6"],
  pinterest: ["Pinterest", "M12 3a9 9 0 0 0-3.3 17.4c0-1 .1-2 .4-3l1.2-5s-.3-.7-.3-1.6c0-1.5.9-2.6 2-2.6.9 0 1.4.7 1.4 1.5 0 .9-.6 2.3-.9 3.6-.3 1.1.6 2 1.7 2 2 0 3.4-2.6 3.4-5.6 0-2.3-1.6-4-4.4-4-3.2 0-5.2 2.4-5.2 5 0 .9.3 1.6.7 2.1"],
  youtube: ["YouTube", "M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3z"],
} as const;
