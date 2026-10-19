"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Summary from "@/components/Summary";
import { onCartChange, readCart, writeCart, type CartLine } from "@/lib/cart";
import { money } from "@/lib/format";
import { useQuote } from "@/lib/useQuote";

export default function CartPage() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => { const u = () => setLines(readCart()); u(); setReady(true); return onCartChange(u); }, []);
  const { quote, loading } = useQuote(lines, "Continente", "");
  const setQty = (id: string, qty: number) => writeCart(lines.map((l) => (l.variant_id === id ? { ...l, qty: Math.max(1, Math.min(20, qty)) } : l)));
  const remove = (id: string) => writeCart(lines.filter((l) => l.variant_id !== id));

  if (ready && !lines.length) return (
    <div className="wrap prose">
      <h1>O carrinho está vazio</h1>
      <p className="muted">Escolhe o teu número e vê os modelos disponíveis.</p>
      <p style={{ marginTop: 20 }}><Link className="btn" href="/loja">Ver a loja</Link></p>
    </div>
  );
  const blocked = (quote?.problems?.length ?? 0) > 0;
  return (
    <div className="wrap cart">
      <section>
        <h1 style={{ fontSize: "clamp(2rem,4vw,2.8rem)" }}>Carrinho</h1>
        <ul className="lines">
          {lines.map((l) => {
            const prob = quote?.problems?.find((p) => p.variant_id === l.variant_id);
            return (
              <li key={l.variant_id} className="line">
                <div className="ph">{l.image ? <img src={l.image} alt="" /> : null}</div>
                <div>
                  <Link href={`/produto/${l.handle}`} style={{ fontWeight: 700, textDecoration: "none" }}>{l.title}</Link>
                  <p className="muted">Tamanho {l.size}</p>
                  <div>
                    <span className="qty">
                      <button aria-label="Diminuir quantidade" onClick={() => setQty(l.variant_id, l.qty - 1)}>−</button>
                      <span aria-live="polite">{l.qty}</span>
                      <button aria-label="Aumentar quantidade" onClick={() => setQty(l.variant_id, l.qty + 1)}>+</button>
                    </span>
                    <button className="linkbtn" onClick={() => remove(l.variant_id)}>Remover</button>
                  </div>
                  {prob && <p className="problem">{prob.erro}</p>}
                </div>
                <strong>{money((quote?.lines.find((q) => q.variant_id === l.variant_id)?.unit_cents ?? l.price_cents) * l.qty)}</strong>
              </li>
            );
          })}
        </ul>
      </section>
      <Summary quote={quote} loading={loading}>
        <p className="muted" style={{ fontSize: ".9rem", marginBottom: 14 }}>Portes para Portugal Continental. Açores e Madeira calculados no checkout.</p>
        {blocked ? <button className="btn block" disabled>Corrige o carrinho para continuar</button> : <Link className="btn block" href="/checkout">Finalizar compra</Link>}
      </Summary>
    </div>
  );
}
