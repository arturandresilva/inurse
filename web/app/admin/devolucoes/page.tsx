"use client";
import Link from "next/link";
import { useState } from "react";
import { rpc, run, sb, type Row } from "@/lib/admin/sb";
import { dateTime, euro, fromCents, RETURN_REASON, RETURN_STATUS, toCents, type Tone } from "@/lib/admin/format";
import { Alert, Badge, Card, Empty, Field, Loaded, Modal, PageHead, Tabs, useAction, useLoad } from "@/components/admin/ui";

const TONE: Record<string, Tone> = { requested: "warn", approved: "info", label_sent: "info", in_transit: "info", received: "info", refunded: "ok", exchanged: "ok", rejected: "muted", cancelled: "muted" };
const OPEN = ["requested", "approved", "label_sent", "in_transit", "received"];

async function load() {
  const c = sb();
  const [rows, ret] = await Promise.all([
    run(c.from("returns").select("*, orders(id,number,email,status,total_cents,shipping_address,order_items(id,title,option_value,unit_price_cents,quantity)), pickup_addresses(label,line1,zip,city)").order("created_at", { ascending: false }).limit(200)),
    run<Row | null>(c.from("pickup_addresses").select("label,line1,zip,city").eq("is_return_address", true).eq("active", true).maybeSingle()),
  ]);
  return { rows, ret };
}

export default function Returns() {
  const s = useLoad(load);
  const [tab, setTab] = useState("open");
  const [edit, setEdit] = useState<{ r: Row; to: string } | null>(null);
  const { busy, act } = useAction();

  async function move(r: Row, to: string, extra: Row = {}, refundOrder = false) {
    await act(async () => {
      await run(sb().from("returns").update({ status: to, updated_at: new Date().toISOString(), ...extra }).eq("id", r.id));
      await run(sb().from("order_events").insert({ order_id: r.order_id, kind: "devolucao", message: `Devolução #${r.number}: ${RETURN_STATUS[to].toLowerCase()}${extra.tracking_code ? ` · ${extra.tracking_code}` : ""}${extra.refund_cents ? ` · reembolso ${euro(extra.refund_cents)}` : ""}` }));
      if (refundOrder) await rpc("set_order_status", { p_order: r.order_id, p_status: "refunded", p_note: `devolução #${r.number}` });
      setEdit(null); await s.reload();
    }, `Devolução #${r.number}: ${RETURN_STATUS[to].toLowerCase()}.`);
  }

  return (
    <>
      <PageHead title="Devoluções" sub="Pedidos feitos pelos clientes na página da encomenda (até 14 dias depois do envio). Voltam para a tua morada principal de devoluções." />
      <Loaded s={s}>
        {({ rows, ret }) => {
          const list = rows.filter((r) => (tab === "open" ? OPEN.includes(r.status) : !OPEN.includes(r.status)));
          return (
            <>
              {!ret && <Alert tone="warn">Ainda não definiste a morada principal de devoluções. <Link href="/admin/envios?tab=moradas">Definir agora</Link></Alert>}
              {ret && <p className="a-muted a-small" style={{ marginBottom: 12 }}>Morada de devoluções: <strong>{ret.label}</strong> — {ret.line1}, {ret.zip} {ret.city}</p>}
              <Tabs tabs={[["open", `Em curso (${rows.filter((r) => OPEN.includes(r.status)).length})`], ["closed", "Fechadas"]]} value={tab} onChange={setTab} />
              {list.length === 0 ? <Card><Empty title={tab === "open" ? "Sem devoluções em curso" : "Sem devoluções fechadas"} /></Card> : list.map((r) => {
                const o = r.orders ?? {};
                const items: Row[] = (r.items ?? []).map((it: Row) => ({ ...it, line: (o.order_items ?? []).find((x: Row) => x.id === it.order_item_id) }));
                const value = items.reduce((a, it) => a + (it.line?.unit_price_cents ?? 0) * (it.quantity ?? 1), 0);
                return (
                  <section key={r.id} id={r.id} className="a-proposal">
                    <header>
                      <div>
                        <h3>Devolução #{r.number} · <Link href={`/admin/encomendas/${o.number}`}>encomenda #{o.number}</Link></h3>
                        <div className="meta"><Badge tone={TONE[r.status]}>{RETURN_STATUS[r.status]}</Badge>
                          <span>{r.kind === "troca" ? "Troca" : "Reembolso"} · {RETURN_REASON[r.reason]}</span><span>{o.shipping_address?.name ?? o.email}</span><span>{dateTime(r.created_at)}</span></div>
                      </div>
                      <div className="a-actions">
                        {r.status === "requested" && <><button className="a-btn sm primary" disabled={busy} onClick={() => move(r, "approved")}>Aprovar</button>
                          <button className="a-btn sm danger" disabled={busy} onClick={() => setEdit({ r, to: "rejected" })}>Recusar</button></>}
                        {r.status === "approved" && <button className="a-btn sm primary" onClick={() => setEdit({ r, to: "label_sent" })}>Enviar etiqueta</button>}
                        {["label_sent", "in_transit"].includes(r.status) && <button className="a-btn sm primary" disabled={busy} onClick={() => move(r, "received")}>Recebida</button>}
                        {r.status === "received" && (r.kind === "troca"
                          ? <button className="a-btn sm primary" onClick={() => setEdit({ r, to: "exchanged" })}>Troca enviada</button>
                          : <button className="a-btn sm primary" onClick={() => setEdit({ r, to: "refunded" })}>Reembolsar</button>)}
                      </div>
                    </header>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {items.map((it, i) => <li key={i}>{it.quantity ?? 1}× {it.line?.title ?? "artigo"} — tam. {it.line?.option_value}{it.exchange_variant_id ? " (troca por outro tamanho)" : ""}</li>)}
                    </ul>
                    {r.customer_notes && <p className="a-small">“{r.customer_notes}”</p>}
                    <p className="a-small a-muted">Valor dos artigos {euro(value)}{r.tracking_code ? ` · seguimento ${r.tracking_code}` : ""}{r.refund_cents ? ` · reembolsado ${euro(r.refund_cents)}` : ""}{r.internal_notes ? ` · nota: ${r.internal_notes}` : ""}</p>
                  </section>
                );
              })}
            </>
          );
        }}
      </Loaded>
      <Modal title={edit ? `Devolução #${edit.r.number}: ${RETURN_STATUS[edit.to].toLowerCase()}` : ""} open={!!edit} onClose={() => setEdit(null)}>
        {edit && (
          <form onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const g = (k: string) => String(f.get(k) ?? "").trim();
            const extra: Row = {};
            if (g("internal_notes")) extra.internal_notes = g("internal_notes");
            if (edit.to === "label_sent") { extra.tracking_code = g("tracking_code") || null; extra.label_url = g("label_url") || null; extra.shipping_cost_cents = toCents(g("cost")); }
            if (edit.to === "refunded") { extra.refund_cents = toCents(g("refund")); extra.restock = f.get("restock") === "on"; }
            move(edit.r, edit.to, extra, f.get("refund_order") === "on");
          }}>
            {edit.to === "label_sent" && <>
              <Alert tone="info">Cria a devolução no portal CTT (devolução fácil) e envia ao cliente o código ou a etiqueta. Com a API ligada, este passo fica automático.</Alert>
              <div className="a-grid-2">
                <Field label="Código de seguimento"><input name="tracking_code" /></Field>
                <Field label="Custo da devolução s/IVA (€)"><input name="cost" inputMode="decimal" /></Field>
                <Field label="Link da etiqueta (opcional)" wide><input name="label_url" type="url" /></Field>
              </div>
            </>}
            {edit.to === "refunded" && <>
              <div className="a-grid-2">
                <Field label="Valor reembolsado (€)"><input name="refund" inputMode="decimal" defaultValue={fromCents(edit.r.orders?.total_cents)} required /></Field>
              </div>
              <label className="a-check" style={{ marginTop: 10 }}><input type="checkbox" name="restock" /> O artigo volta ao stock</label>
              <label className="a-check"><input type="checkbox" name="refund_order" defaultChecked /> Marcar a encomenda como reembolsada (reembolso total)</label>
              <p className="a-hint">Faz a transferência ao cliente e emite a nota de crédito no InvoiceXpress.</p>
            </>}
            <Field label="Nota interna"><textarea name="internal_notes" rows={2} style={{ minHeight: 60 }} defaultValue={edit.r.internal_notes ?? ""} /></Field>
            <div className="a-formfoot"><button className={`a-btn ${edit.to === "rejected" ? "danger" : "primary"}`} disabled={busy}>Confirmar</button></div>
          </form>
        )}
      </Modal>
    </>
  );
}
