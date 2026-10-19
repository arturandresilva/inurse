"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { addToCart } from "@/lib/cart";
import { money } from "@/lib/format";

type V = { id: string; option_value: string; price_cents: number; compare_at_cents: number | null; available: boolean };

export default function BuyBox({ variants, title, handle, image, initialSize, vatRate, outOfStock }: {
  variants: V[]; title: string; handle: string; image: string | null; initialSize?: string; vatRate: number; outOfStock: boolean;
}) {
  const start = variants.find((v) => v.available && (initialSize ? v.option_value.split("/").includes(initialSize) : false));
  const [sel, setSel] = useState<string | null>(start?.id ?? null);
  const [added, setAdded] = useState(false);
  const chosen = variants.find((v) => v.id === sel) ?? null;
  const prices = useMemo(() => [...new Set(variants.map((v) => v.price_cents))], [variants]);
  const shown = chosen?.price_cents ?? Math.min(...prices);
  const cmp = chosen?.compare_at_cents ?? null;

  return (
    <div>
      <p className="price" aria-live="polite">{!chosen && prices.length > 1 ? "desde " : ""}{money(shown)}{cmp && cmp > shown ? <span className="was">{money(cmp)}</span> : null}</p>
      <p className="vat">IVA incluído ({vatRate}%). Portes calculados no carrinho.</p>
      {outOfStock ? (
        <p className="problem" style={{ marginTop: 20 }}>Este modelo está esgotado de momento.</p>
      ) : (
        <>
          <fieldset className="size-choice" style={{ border: 0, padding: 0 }}>
            <legend>Escolhe o tamanho</legend>
            <div className="opts">
              {variants.map((v) => (
                <label key={v.id}>
                  <input type="radio" name="tamanho" value={v.id} disabled={!v.available} checked={sel === v.id}
                    onChange={() => { setSel(v.id); setAdded(false); }} />
                  <span>{v.option_value}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="muted" style={{ fontSize: ".92rem", marginBottom: 16 }}>Dúvidas no número? <Link href="/p/guia-de-tamanhos">Guia de tamanhos</Link></p>
          <button className="btn block" disabled={!chosen} onClick={() => {
            if (!chosen) return;
            addToCart({ variant_id: chosen.id, qty: 1, title, size: chosen.option_value, price_cents: chosen.price_cents, image, handle });
            setAdded(true);
          }}>{chosen ? "Adicionar ao carrinho" : "Escolhe um tamanho"}</button>
          {added && <p className="added" role="status">Adicionado. <Link href="/carrinho">Ver carrinho</Link></p>}
        </>
      )}
    </div>
  );
}
