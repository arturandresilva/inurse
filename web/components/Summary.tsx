import { money } from "@/lib/format";
import type { Quote } from "@/lib/useQuote";
import { useT } from "@/lib/i18n/client";

export default function Summary({ quote, loading, children }: { quote: Quote | null; loading: boolean; children?: React.ReactNode }) {
  const t = useT();
  return (
    <aside className="summary" aria-busy={loading}>
      <h2>{t("Resumo")}</h2>
      <dl>
        <dt>{t("Artigos")}</dt><dd>{money(quote?.subtotal_cents ?? 0)}</dd>
        {quote && quote.discount_cents > 0 && (<><dt>{t("Desconto")}</dt><dd>−{money(quote.discount_cents)}</dd></>)}
        <dt>{t("Portes")}</dt><dd>{quote ? (quote.shipping_cents === 0 ? t("Grátis") : money(quote.shipping_cents)) : "—"}</dd>
        <dt className="total">{t("Total")}</dt><dd className="total">{money(quote?.total_cents ?? 0)}</dd>
      </dl>
      {quote?.problems?.map((p, i) => <p key={i} className="problem">{p.erro === "stock insuficiente" ? t("Stock insuficiente (disponível: {n})", { n: p.disponivel ?? 0 }) : t(p.erro)}</p>)}
      {children}
    </aside>
  );
}
