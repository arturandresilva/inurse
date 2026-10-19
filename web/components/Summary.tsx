import { money } from "@/lib/format";
import type { Quote } from "@/lib/useQuote";

export default function Summary({ quote, loading, children }: { quote: Quote | null; loading: boolean; children?: React.ReactNode }) {
  return (
    <aside className="summary" aria-busy={loading}>
      <h2>Resumo</h2>
      <dl>
        <dt>Artigos</dt><dd>{money(quote?.subtotal_cents ?? 0)}</dd>
        {quote && quote.discount_cents > 0 && (<><dt>Desconto</dt><dd>−{money(quote.discount_cents)}</dd></>)}
        <dt>Portes</dt><dd>{quote ? (quote.shipping_cents === 0 ? "Grátis" : money(quote.shipping_cents)) : "—"}</dd>
        <dt className="total">Total</dt><dd className="total">{money(quote?.total_cents ?? 0)}</dd>
      </dl>
      {quote?.problems?.map((p, i) => <p key={i} className="problem">{p.erro === "stock insuficiente" ? `Stock insuficiente (disponível: ${p.disponivel})` : p.erro}</p>)}
      {children}
    </aside>
  );
}
