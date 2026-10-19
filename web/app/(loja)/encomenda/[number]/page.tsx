import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/format";
import ReturnForm from "@/components/ReturnForm";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("A tua encomenda"), robots: { index: false } };
}

type Order = { number: number; status: string; payment_method: string; total_cents: number; subtotal_cents: number; shipping_cents: number;
  discount_cents: number; iban: string | null; items: { id: string; title: string; option_value: string; quantity: number; unit_price_cents: number }[];
  tracking?: { carrier: string; code: string }[]; returns?: { number: number; status: string; kind: string; tracking_code: string | null; label_url: string | null }[]; return_until?: string | null;
  shipping_address: { name: string; line1: string; line2?: string; zip: string; city: string } };

const RSTATUS: Record<string, string> = { requested: "recebido, em análise", approved: "aprovado", label_sent: "etiqueta enviada", in_transit: "a caminho",
  received: "recebido no armazém", refunded: "reembolsado", exchanged: "troca enviada", rejected: "recusado", cancelled: "cancelado" };
const STATUS: Record<string, string> = { pending_payment: "A aguardar pagamento", paid: "Paga — em preparação", processing: "Em preparação",
  shipped: "Enviada", delivered: "Entregue", cancelled: "Cancelada", refunded: "Reembolsada" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ number }, { t: token }, { t }] = await Promise.all([params, searchParams, getT()]);
  if (!token || !/^\d+$/.test(number) || !/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const { data } = await supabase.rpc("get_order_public", { p_number: Number(number), p_token: token });
  const o = data as Order | null;
  if (!o) notFound();
  return (
    <div className="wrap prose">
      <h1>{t("Encomenda n.º {n}", { n: o.number })}</h1>
      <p className="muted">{t("Estado")}: <strong style={{ color: "var(--navy)" }}>{t(STATUS[o.status] ?? o.status)}</strong></p>
      {o.status === "pending_payment" && (
        <div className="notice" style={{ margin: "24px 0" }}>
          {o.payment_method === "transfer" ? (
            <>
              <h2 style={{ fontSize: "1.3rem", marginBottom: 8 }}>{t("Pagamento por transferência")}</h2>
              <p>{t("Transfere")} <strong>{money(o.total_cents)}</strong> {t("para o IBAN")} <strong>{o.iban ?? t("(indicado por email)")}</strong> {t("e indica a referência")} <strong>{o.number}</strong>. {t("Enviamos a encomenda assim que o pagamento for confirmado.")}</p>
            </>
          ) : (
            <p>{t("Vais receber as instruções de pagamento ({m}) no teu email.", { m: o.payment_method === "mbway" ? "MB WAY" : t("referência Multibanco") })} {t("Enviamos a encomenda assim que o pagamento for confirmado.")}</p>
          )}
        </div>
      )}
      <h2 style={{ fontSize: "1.3rem", margin: "24px 0 10px" }}>{t("Artigos")}</h2>
      <ul>{o.items.map((i, k) => <li key={k}>{i.quantity} × {i.title} ({t("tam.")} {i.option_value}) — {money(i.unit_price_cents * i.quantity)}</li>)}</ul>
      <p>{t("Portes")}: {o.shipping_cents ? money(o.shipping_cents) : t("grátis")}{o.discount_cents ? ` · ${t("Desconto")}: −${money(o.discount_cents)}` : ""}</p>
      <p><strong>{t("Total")}: {money(o.total_cents)}</strong></p>
      <h2 style={{ fontSize: "1.3rem", margin: "24px 0 10px" }}>{t("Entrega")}</h2>
      <p>{o.shipping_address.name}<br />{o.shipping_address.line1} {o.shipping_address.line2}<br />{o.shipping_address.zip} {o.shipping_address.city}</p>
      {(o.tracking ?? []).length > 0 && (<>
        <h2 style={{ fontSize: "1.3rem", margin: "24px 0 10px" }}>{t("Seguimento")}</h2>
        <ul>{o.tracking!.map((x) => <li key={x.code}>{x.carrier}: <a href={`https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=${encodeURIComponent(x.code)}`} target="_blank" rel="noopener">{x.code}</a></li>)}</ul>
      </>)}
      {(o.returns ?? []).length > 0 && (<>
        <h2 style={{ fontSize: "1.3rem", margin: "24px 0 10px" }}>{t("Trocas e devoluções")}</h2>
        <ul>{o.returns!.map((r) => <li key={r.number}>{t("Pedido n.º {n}", { n: r.number })} ({t(r.kind)}): {t(RSTATUS[r.status] ?? r.status)}{r.label_url ? <> · <a href={r.label_url} target="_blank" rel="noopener">{t("etiqueta CTT")}</a></> : null}{r.tracking_code ? ` · ${r.tracking_code}` : ""}</li>)}</ul>
      </>)}
      {["shipped", "delivered"].includes(o.status) && !(o.returns ?? []).some((r) => !["rejected", "cancelled"].includes(r.status))
        && (!o.return_until || new Date(o.return_until) >= new Date()) && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>{t("O tamanho não serve?")}</h2>
          <ReturnForm number={o.number} token={token} items={o.items} />
        </div>
      )}
      <p style={{ marginTop: 24 }}>{t("Guarda esta página: é por aqui que acompanhas a encomenda e pedes uma troca.")} <Link href="/loja">{t("Continuar a comprar")}</Link></p>
    </div>
  );
}
