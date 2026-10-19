import type { Row } from "./sb";

/** Mesmo cálculo da base de dados (compute_price_v2), para o exemplo no formulário. */
export function roundPrice(c: number, mode: string) {
  if (mode === "none") return c;
  const e = Math.floor(c / 100);
  const end = mode === "0.90" ? 90 : mode === "0.99" ? 99 : mode === "0.50" ? 50 : 0;
  if (mode === "1.00") return c % 100 === 0 ? c : (e + 1) * 100;
  return c <= e * 100 + end ? e * 100 + end : (e + 1) * 100 + end;
}
export function previewPrice(r: Row, cost: number | null, rrp: number | null, vat: number): number | null {
  const minP = Number(r.min_profit_cents) || 0;
  if (r.base === "rrp") {
    if (rrp == null) return null;
    let g = Math.round(rrp * (1 + (Number(r.rrp_adjust_pct) || 0) / 100));
    if (cost != null && g / (1 + vat / 100) - cost < minP) g = Math.round((cost + minP) * (1 + vat / 100));
    return roundPrice(g, r.rounding);
  }
  if (cost == null) return null;
  const pct = Number(r.pct) || 0;
  let net = r.method === "margin" ? cost / (1 - Math.min(pct, 99) / 100) : cost * (1 + pct / 100);
  if (net - cost < minP) net = cost + minP;
  return roundPrice(Math.round(net * (1 + vat / 100)), r.rounding);
}

