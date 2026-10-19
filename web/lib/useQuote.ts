"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { CartLine } from "./cart";

export type Quote = { subtotal_cents: number; discount_cents: number; shipping_cents: number; total_cents: number; weight_g: number;
  problems: { erro: string; variant_id?: string; disponivel?: number }[]; lines: { variant_id: string; unit_cents: number; qty: number }[] };

export function useQuote(lines: CartLine[], region: string, promo: string) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify([lines.map((l) => [l.variant_id, l.qty]), region, promo]);
  useEffect(() => {
    if (!lines.length) { setQuote(null); return; }
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("quote_cart", { p: { items: lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty })), region, promo_code: promo || null } });
      if (alive) { setQuote(data as Quote); setLoading(false); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { quote, loading };
}
