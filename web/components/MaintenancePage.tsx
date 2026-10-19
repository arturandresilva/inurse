import Logo from "./Logo";
import type { Maintenance } from "@/lib/maintenance";
import type { Legal } from "@/lib/legal";
import type { T } from "@/lib/i18n";

// Página mostrada aos clientes enquanto a loja está em manutenção
export default function MaintenancePage({ m, legal, t, locale }: { m: Maintenance; legal: Legal; t: T; locale: string }) {
  const when = m.until ? new Date(m.until) : null;
  const fmt = when && when.getTime() > Date.now()
    ? when.toLocaleString({ pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" }[locale] ?? "pt-PT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" })
    : null;
  const phone = legal.phone.replace(/\D/g, "").replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
  return (
    <main className="maint">
      <div className="maint-card">
        <Logo height={34} />
        <svg className="maint-ico" viewBox="0 0 24 24" width="44" height="44" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.8 1.8 0 0 0 2.6 2.6l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.3-.5-.5-2.3z" />
        </svg>
        <h1>{t("Estamos a melhorar a loja")}</h1>
        <p className="lead">{m.message || t("A loja está temporariamente em manutenção. Voltamos dentro de pouco tempo.")}</p>
        {fmt && <p className="maint-when">{t("Previsão de regresso: {d}", { d: fmt })}</p>}
        <p className="muted">{t("Já fez uma encomenda? Pode continuar a vê-la pelo link do email. Para qualquer dúvida:")}</p>
        <p className="maint-contacts"><a href={`mailto:${legal.email}`}>{legal.email}</a>{phone && <> · <a href={`tel:+351${legal.phone.replace(/\D/g, "")}`}>{phone}</a></>}</p>
      </div>
    </main>
  );
}
