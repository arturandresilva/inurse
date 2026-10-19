"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { addToCart } from "@/lib/cart";
import { money } from "@/lib/format";
import { useT } from "@/lib/i18n/client";

type V = { id: string; option_value: string; price_cents: number; compare_at_cents: number | null; available: boolean };

export default function BuyBox({ variants, title, handle, image, initialSize, vatRate, outOfStock }: {
  variants: V[]; title: string; handle: string; image: string | null; initialSize?: string; vatRate: number; outOfStock: boolean;
}) {
  const t = useT();
  const start = variants.find((v) => v.available && (initialSize ? v.option_value.split("/").includes(initialSize) : false));
  const [sel, setSel] = useState<string | null>(start?.id ?? null);
  const [added, setAdded] = useState(false);
  const chosen = variants.find((v) => v.id === sel) ?? null;
  const prices = useMemo(() => [...new Set(variants.map((v) => v.price_cents))], [variants]);
  const shown = chosen?.price_cents ?? Math.min(...prices);
  const cmp = chosen?.compare_at_cents ?? null;

  return (
    <div>
      <p className="price" aria-live="polite">{!chosen && prices.length > 1 ? t("desde") + " " : ""}{money(shown)}{cmp && cmp > shown ? <span className="was">{money(cmp)}</span> : null}</p>
      <p className="vat">{t("IVA incluído ({v}%). Portes calculados no carrinho.", { v: vatRate })}</p>
      {outOfStock ? (
        <p className="problem" style={{ marginTop: 20 }}>{t("Esta cor está esgotada de momento.")}</p>
      ) : (
        <>
          <fieldset className="size-choice" style={{ border: 0, padding: 0 }}>
            <legend>{t("Escolhe o tamanho")}</legend>
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
          <p className="muted" style={{ fontSize: ".92rem", marginBottom: 16 }}>{t("Dúvidas no número?")} <Link href="/p/guia-de-tamanhos">{t("Guia de tamanhos")}</Link></p>
          <button className="btn block" disabled={!chosen} onClick={() => {
            if (!chosen) return;
            addToCart({ variant_id: chosen.id, qty: 1, title, size: chosen.option_value, price_cents: chosen.price_cents, image, handle });
            setAdded(true);
          }}>{chosen ? t("Adicionar ao carrinho") : t("Escolhe um tamanho")}</button>
          {added && <p className="added" role="status">{t("Adicionado.")} <Link href="/carrinho">{t("Ver carrinho")}</Link></p>}
        </>
      )}
    </div>
  );
}
