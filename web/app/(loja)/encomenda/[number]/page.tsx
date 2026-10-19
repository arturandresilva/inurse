import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { money } from "@/lib/format";
import ReturnForm from "@/components/ReturnForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "A tua encomenda", robots: { index: false } };

type Order = { number: number; status: string; payment_method: string; total_cents: number; subtotal_cents: number; shipping_cents: number;
  discount_cents: number; iban: string | null; items: { id: string; title: string; option_value: string; quantity: number; unit_price_cents: number }[];
  tracking?: { carrier: string; code: string }[]; returns?: { number: number; status: string; kind: string; tracking_code: string | null; label_url: string | null }[]; return_until?: string | null;
  shipping_address: { name: string; line1: string; line2?: string; zip: string; city: string } };

const RSTATUS: Record<string, string> = { requested: "recebido, em análise", approved: "aprovado", label_sent: "etiqueta enviada", in_transit: "a caminho",
  received: "recebido no armazém", refunded: "reembolsado", exchanged: "troca enviada", rejected: "recusado", cancelled: "cancelado" };
const STATUS: Record<string, string> = { pending_payment: "A aguardar pagamento", paid: "Paga — em preparação", processing: "Em preparação",
  shipped: "Enviada", delivered: "Entregue", cancelled: "Cancelada", refunded: "Reembolsada" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ number }, { t }] = await Promise.all([params, searchParams]);
  if (!t || !/^\d+$/.test(number) || !/^[0-9a-f-]{36}$/i.test(t)) notFound();
  const { data } = await supabase.rpc("get_order_public", { p_number: Number(number), p_token: t });
  const o = data as Order | null;
  if (!o) notFound();
  return (
    <div className="wrap prose">
      <h1>Encomenda n.º {o.number}</h1>
      <p className="muted">Estado: <strong style={{ color: "var(--navy)" }}>{STATUS[o.status] ?? o.status}</strong></p>
      {o.status === "pending_payment" && (
        <div className="notice" style={{ margin: "24px 0" }}>
          {o.payment_method === "transfer" ? (
            <>
              <h2 style={{ fontSize: "1.3rem", marginBottom: 8 }}>Pagamento por transferência</h2>
              <p>Transfere <strong>{money(o.total_cents)}</strong> para o IBAN <strong>{o.iban ?? "(indicado por email)"}</strong> e indica a referência <strong>{o.number}</strong>. Enviamos a encomenda assim que o pagamento for confirmado.</p>
            </>
          ) : (
            <p>Vais receber as instruções de pagamento ({o.payment_method === "mbway" ? "MB WAY" : "referência Multibanco"}) no teu email. Enviamos a encomenda assim que o pagamento for confirmado.</p>
          )}
        </div>
      )}
      <h2 style={{ fontSize: "1.3rem", margin: "24px 0 10px" }}>Artigos</h2>
      <ul>{o.items.map((i, k) => <li key={k}>{i.quantity} × {i.title} (tam. {i.option_value}) — {money(i.unit_price_cents * i.quantity)}</li>)}</ul>
      <p>Portes: {o.shipping_cents ? money(o.shipping_cents) : "grátis"}{o.discount_cents ? ` · Desconto: −${money(o.discount_cents)}` : ""}</p>
      <p><strong>Total: {money(o.total_cents)}</strong></p>
      <h2 style={{ fontSize: "1.3rem", margin: "24px 0 10px" }}>Entrega</h2>
      <p>{o.shipping_address.name}<br />{o.shipping_address.line1} {o.shipping_address.line2}<br />{o.shipping_address.zip} {o.shipping_address.city}</p>
      {(o.tracking ?? []).length > 0 && (<>
        <h2 style={{ fontSize: "1.3rem", margin: "24px 0 10px" }}>Seguimento</h2>
        <ul>{o.tracking!.map((x) => <li key={x.code}>{x.carrier}: <a href={`https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=${encodeURIComponent(x.code)}`} target="_blank" rel="noopener">{x.code}</a></li>)}</ul>
      </>)}
      {(o.returns ?? []).length > 0 && (<>
        <h2 style={{ fontSize: "1.3rem", margin: "24px 0 10px" }}>Trocas e devoluções</h2>
        <ul>{o.returns!.map((r) => <li key={r.number}>Pedido n.º {r.number} ({r.kind}): {RSTATUS[r.status] ?? r.status}{r.label_url ? <> · <a href={r.label_url} target="_blank" rel="noopener">etiqueta CTT</a></> : null}{r.tracking_code ? ` · ${r.tracking_code}` : ""}</li>)}</ul>
      </>)}
      {["shipped", "delivered"].includes(o.status) && !(o.returns ?? []).some((r) => !["rejected", "cancelled"].includes(r.status))
        && (!o.return_until || new Date(o.return_until) >= new Date()) && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>O tamanho não serve?</h2>
          <ReturnForm number={o.number} token={t} items={o.items} />
        </div>
      )}
      <p style={{ marginTop: 24 }}>Guarda esta página: é por aqui que acompanhas a encomenda e pedes uma troca. <Link href="/loja">Continuar a comprar</Link></p>
    </div>
  );
}
