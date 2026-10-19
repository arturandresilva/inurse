// Formatação e conversões do backoffice (valores em cêntimos na base de dados)
const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const num = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 });
export const euro = (cents: number | null | undefined) => (cents == null ? "—" : eur.format(cents / 100));
export const euroN = (v: number | null | undefined) => (v == null ? "—" : eur.format(v));
export const pct = (v: number | null | undefined) => (v == null ? "—" : `${num.format(v)} %`);
export const n1 = (v: number | null | undefined) => (v == null ? "—" : num.format(v));

/** "12,90" | "12.90" | "12" → 1290 ; vazio → null */
export function toCents(s: string | number | null | undefined): number | null {
  if (s == null) return null;
  const t = String(s).trim().replace(/\s|€/g, "");
  if (!t) return null;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const v = Number(norm);
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}
export const fromCents = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

const dtf = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
const dtt = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const date = (d: string | null | undefined) => (d ? dtf.format(new Date(d)) : "—");
export const dateTime = (d: string | null | undefined) => (d ? dtt.format(new Date(d)) : "—");
export function ago(d: string | null | undefined) {
  if (!d) return "—";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `há ${Math.floor(s / 86400)} dias`;
  return date(d);
}
export const isoDay = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export const ORDER_STATUS: Record<string, string> = {
  pending_payment: "A aguardar pagamento",
  paid: "Paga",
  processing: "Em preparação",
  shipped: "Enviada",
  delivered: "Entregue",
  cancelled: "Cancelada",
  refunded: "Reembolsada",
};
export const ORDER_TONE: Record<string, Tone> = {
  pending_payment: "warn", paid: "info", processing: "info", shipped: "ok", delivered: "ok", cancelled: "muted", refunded: "muted",
};
export const PAYMENT: Record<string, string> = { mbway: "MB WAY", multibanco: "Multibanco", transfer: "Transferência" };
export const PRODUCT_STATUS: Record<string, string> = { active: "Ativo", out_of_stock: "Esgotado", draft: "Rascunho", archived: "Arquivado" };
export const PRODUCT_TONE: Record<string, Tone> = { active: "ok", out_of_stock: "warn", draft: "muted", archived: "muted" };
export const RETURN_STATUS: Record<string, string> = {
  requested: "Pedido", approved: "Aprovada", label_sent: "Etiqueta enviada", in_transit: "Em trânsito", received: "Recebida",
  refunded: "Reembolsada", exchanged: "Trocada", rejected: "Recusada", cancelled: "Cancelada",
};
export const RETURN_REASON: Record<string, string> = {
  tamanho: "Tamanho", defeito: "Defeito", engano_envio: "Engano no envio", nao_gostou: "Não gostou", outro: "Outro",
};
export type Tone = "ok" | "warn" | "err" | "info" | "muted";
