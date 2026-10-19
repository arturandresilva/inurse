"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { callFunction, rpc, run, sb, type Row } from "@/lib/admin/sb";
import { dateTime, euro, fromCents, ORDER_STATUS, ORDER_TONE, PAYMENT, RETURN_STATUS, toCents } from "@/lib/admin/format";
import { Alert, Badge, Card, Confirm, Field, Loaded, Modal, PageHead, useAction, useLoad } from "@/components/admin/ui";

async function load(number: number) {
  const c = sb();
  const o = await run<Row | null>(c.from("orders").select("*, order_items(*), shipments(*), payments(*), invoices(*), returns(id,number,status,reason,created_at)").eq("number", number).maybeSingle());
  if (!o) throw new Error(`A encomenda #${number} não existe.`);
  const [events, pickups, suppliers, ctt, invoicing] = await Promise.all([
    run(c.from("order_events").select("*").eq("order_id", o.id).order("created_at", { ascending: false })),
    run(c.from("pickup_addresses").select("id,label,supplier_id,is_default_pickup").eq("active", true).order("label")),
    run(c.from("suppliers").select("id,name")),
    run<Row | null>(c.from("settings").select("value").eq("key", "ctt").maybeSingle()),
    run<Row | null>(c.from("settings").select("value").eq("key", "invoicing").maybeSingle()),
  ]);
  return { o, events, pickups, suppliers, cttEnabled: !!ctt?.value?.enabled, invoicing: (invoicing?.value ?? {}) as Row };
}

const NEXT: Record<string, [string, string][]> = {
  pending_payment: [["paid", "Marcar como paga"]],
  paid: [["processing", "Em preparação"]],
  processing: [],
  shipped: [["delivered", "Marcar como entregue"]],
  delivered: [],
};

export default function OrderPage() {
  const { number } = useParams<{ number: string }>();
  const s = useLoad(() => load(Number(number)), [number]);
  const { busy, act } = useAction();
  const [shipOpen, setShipOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [note, setNote] = useState("");

  const status = (o: Row, st: string, msg: string) =>
    act(async () => {
      await rpc("set_order_status", { p_order: o.id, p_status: st, p_note: null });
      await s.reload();
      // paga → fatura logo (em segundo plano; se falhar, o agendador tenta de novo e o erro fica no cartão "Fatura")
      const inv = s.data?.invoicing;
      if (st === "paid" && inv?.auto_invoice !== false && inv?.account) {
        callFunction("faturas", { order_id: o.id }).catch(() => null).finally(() => s.reload());
      }
    }, msg);
  const invoice = (o: Row, body: Row, msg: string) =>
    act(async () => {
      const r = await callFunction<Row>("faturas", { order_id: o.id, ...body });
      await s.reload();
      if (r?.skipped) throw new Error(r.reason);
    }, msg);

  return (
    <Loaded s={s}>
      {({ o, events, pickups, suppliers, cttEnabled }) => {
        const supName = (id: string | null) => suppliers.find((x) => x.id === id)?.name ?? "—";
        const items: Row[] = o.order_items;
        const disc = o.subtotal_cents ? o.discount_cents / o.subtotal_cents : 0;
        const revNet = Math.round(items.reduce((a, i) => a + (i.unit_price_cents * i.quantity * (1 - disc)) / (1 + Number(i.vat_rate) / 100), 0) + o.shipping_cents / 1.23);
        const cogs = items.reduce((a, i) => a + (i.unit_cost_cents ?? 0) * i.quantity, 0);
        const missingCost = items.some((i) => i.unit_cost_cents == null);
        const other = o.cost_supplier_shipping_cents + o.cost_payment_fee_cents + o.cost_carrier_cents + o.cost_packaging_cents;
        const profit = revNet - cogs - other;
        const open = !["cancelled", "refunded"].includes(o.status);
        const canShip = ["paid", "processing", "shipped"].includes(o.status);
        const addr = o.shipping_address ?? {};
        return (
          <>
            <PageHead back="/admin/encomendas" title={<>Encomenda #{o.number} <Badge tone={ORDER_TONE[o.status]}>{ORDER_STATUS[o.status]}</Badge></>}
              sub={`${dateTime(o.created_at)} · ${PAYMENT[o.payment_method] ?? "—"}${o.paid_at ? ` · paga a ${dateTime(o.paid_at)}` : ""}`}>
              {(NEXT[o.status] ?? []).map(([st, label]) => (
                <button key={st} className={`a-btn${st === "paid" ? " primary" : ""}`} disabled={busy} onClick={() => status(o, st, `Encomenda ${ORDER_STATUS[st].toLowerCase()}.`)}>{label}</button>
              ))}
              {canShip && <button className="a-btn primary" disabled={busy} onClick={() => setShipOpen(true)}>{o.shipments.length ? "Adicionar envio" : "Registar envio"}</button>}
              {["shipped", "delivered", "paid", "processing"].includes(o.status) && (
                <Confirm text={`Marcar a encomenda #${o.number} como reembolsada? O stock controlado é reposto.`} onYes={() => status(o, "refunded", "Encomenda marcada como reembolsada.")}>Reembolsar</Confirm>
              )}
              {["pending_payment", "paid", "processing"].includes(o.status) && (
                <Confirm className="a-btn danger" text={`Cancelar a encomenda #${o.number}? O stock controlado é reposto e não é possível reabrir.`} onYes={() => status(o, "cancelled", "Encomenda cancelada.")}>Cancelar</Confirm>
              )}
            </PageHead>

            {o.status === "pending_payment" && o.payment_method === "transfer" && (
              <Alert tone="warn">Pagamento por transferência: confirma no banco que recebeste {euro(o.total_cents)} com a referência <strong>#{o.number}</strong> e marca como paga.</Alert>
            )}
            {o.status === "pending_payment" && o.payment_method !== "transfer" && (
              <Alert tone="info">Quando o gateway de pagamentos estiver ligado, MB WAY e Multibanco passam a “paga” automaticamente.</Alert>
            )}

            <div className="a-cols">
              <div>
                <Card title="Artigos" className="flush">
                  <div className="a-table-wrap">
                    <table className="a-table">
                      <thead><tr><th>Artigo</th><th>Tam.</th><th className="num">Qtd.</th><th className="num">Preço</th><th className="num">Total</th><th className="num">Custo s/IVA</th><th>Fornecedor</th></tr></thead>
                      <tbody>
                        {items.map((i) => (
                          <tr key={i.id}>
                            <td>{i.title}{i.sku && <div className="a-small a-muted">{i.sku}</div>}</td>
                            <td>{i.option_value}</td>
                            <td className="num">{i.quantity}</td>
                            <td className="num">{euro(i.unit_price_cents)}</td>
                            <td className="num">{euro(i.unit_price_cents * i.quantity)}</td>
                            <td className="num">{i.unit_cost_cents == null ? <span className="a-badge warn">sem custo</span> : euro(i.unit_cost_cents * i.quantity)}</td>
                            <td>{supName(i.supplier_id)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: "8px 20px 16px", maxWidth: 380, marginLeft: "auto" }} className="a-lines">
                    <div className="a-line"><span>Subtotal</span><span>{euro(o.subtotal_cents)}</span></div>
                    {o.discount_cents > 0 && <div className="a-line"><span>Desconto</span><span>−{euro(o.discount_cents)}</span></div>}
                    <div className="a-line"><span>Portes{o.shipping_method?.label ? ` · ${o.shipping_method.label}` : ""}{o.weight_g ? ` (${(o.weight_g / 1000).toFixed(2).replace(".", ",")} kg)` : ""}</span><span>{o.shipping_cents ? euro(o.shipping_cents) : "Grátis"}</span></div>
                    <div className="a-line total"><span>Total (c/IVA)</span><span>{euro(o.total_cents)}</span></div>
                  </div>
                </Card>

                <Card title="Envios">
                  {o.shipments.length === 0 ? <p className="a-muted">{canShip ? "Ainda sem envio registado." : "Só se regista o envio depois de paga."}</p> : (
                    <div className="a-table-wrap">
                      <table className="a-table">
                        <thead><tr><th>Transportadora</th><th>Seguimento</th><th>Recolha</th><th>Estado</th><th>Data</th></tr></thead>
                        <tbody>
                          {o.shipments.map((sh: Row) => (
                            <tr key={sh.id}>
                              <td>{sh.carrier} {sh.service}</td>
                              <td>{sh.tracking_code ? <a href={`https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=${encodeURIComponent(sh.tracking_code)}`} target="_blank" rel="noreferrer">{sh.tracking_code}</a> : "—"}</td>
                              <td>{sh.pickup_address?.label ?? "—"}</td>
                              <td>{sh.status}</td>
                              <td className="nowrap">{dateTime(sh.shipped_at ?? sh.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>

                <Card title="Histórico e notas">
                  <form className="a-inline" style={{ marginBottom: 14 }} onSubmit={(e) => {
                    e.preventDefault();
                    act(async () => { await rpc("add_order_note", { p_order: o.id, p_text: note }); setNote(""); await s.reload(); }, "Nota guardada.");
                  }}>
                    <input style={{ flex: 1, width: "auto" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota interna (não é enviada ao cliente)" aria-label="Nota interna" />
                    <button className="a-btn" disabled={busy || !note.trim()}>Guardar nota</button>
                  </form>
                  <ul className="a-timeline">
                    {events.map((e) => <li key={e.id}><time>{dateTime(e.created_at)}</time><span>{e.message}</span></li>)}
                    <li><time>{dateTime(o.created_at)}</time><span>Encomenda recebida na loja{o.notes ? ` — nota do cliente: “${o.notes}”` : ""}</span></li>
                  </ul>
                </Card>
              </div>

              <div>
                <Card title="Cliente">
                  <dl className="a-kv">
                    <dt>Nome</dt><dd>{addr.name ?? "—"}</dd>
                    <dt>Email</dt><dd><a href={`mailto:${o.email}`}>{o.email}</a></dd>
                    <dt>Telefone</dt><dd>{addr.phone ?? "—"}</dd>
                    <dt>NIF</dt><dd>{o.nif ?? "Consumidor final"}</dd>
                  </dl>
                  {o.customer_id && <p style={{ marginTop: 10 }}><Link className="a-btn sm" href={`/admin/clientes/${o.customer_id}`}>Ficha do cliente</Link></p>}
                </Card>
                <Card title="Entrega">
                  <p>{addr.name}<br />{addr.line1}{addr.line2 ? <><br />{addr.line2}</> : null}<br />{addr.zip} {addr.city}<br />{addr.region}</p>
                  {o.billing_address && <><h3 style={{ marginTop: 14 }}>Faturação</h3><p>{o.billing_address.name}<br />{o.billing_address.line1}<br />{o.billing_address.zip} {o.billing_address.city}</p></>}
                </Card>
                <Card title="Fatura" actions={(() => {
                  const fin = o.invoices.find((i: Row) => i.status === "final");
                  if (fin) return <button className="a-btn sm" disabled={busy} onClick={() => invoice(o, { email: true }, `Fatura reenviada para ${o.email}.`)}>Reenviar ao cliente</button>;
                  if (["paid", "processing", "shipped", "delivered"].includes(o.status)) return <button className="a-btn sm primary" disabled={busy} onClick={() => invoice(o, { force: true }, "Fatura emitida.")}>Emitir fatura</button>;
                  return null;
                })()}>
                  {o.invoices.length ? o.invoices.map((i: Row) => (
                    <div key={i.id} className="a-invoice">
                      <p>
                        <strong>{i.number ?? "Fatura-recibo"}</strong>{" "}
                        <Badge tone={i.status === "final" ? "ok" : i.status === "error" ? "err" : "warn"}>{i.status === "final" ? "Emitida" : i.status === "error" ? "Falhou" : "A emitir"}</Badge>
                        {i.total_cents != null && <> · {euro(i.total_cents)}</>}
                      </p>
                      <p className="a-hint">
                        {i.pdf_url && <><a href={i.pdf_url} target="_blank" rel="noreferrer">Abrir PDF</a> · </>}
                        {i.permalink && <><a href={i.permalink} target="_blank" rel="noreferrer">Ver no InvoiceXpress</a> · </>}
                        {i.sent_to ? `enviada para ${i.sent_to}` : i.status === "final" ? "ainda não enviada ao cliente" : ""}
                      </p>
                      {i.error && <p className="a-hint" style={{ color: "var(--a-err)" }}>{i.error}</p>}
                      {i.status === "final" && ["cancelled", "refunded"].includes(o.status) && <p className="a-hint" style={{ color: "var(--a-warn)" }}>Encomenda {o.status === "refunded" ? "reembolsada" : "cancelada"} depois de faturada: emite a nota de crédito desta fatura no InvoiceXpress.</p>}
                    </div>
                  )) : <p className="a-muted">{o.status === "pending_payment" ? "A fatura é emitida quando a encomenda estiver paga." : s.data?.invoicing?.account ? "Ainda por emitir." : "Por emitir. Liga o InvoiceXpress em Configurações → Faturação."}</p>}
                </Card>
                <Card title="Margem desta encomenda" actions={open && <button className="a-btn sm" onClick={() => setCostOpen(true)}>Corrigir custos</button>}>
                  <div className="a-lines">
                    <div className="a-line"><span>Vendas s/IVA</span><span>{euro(revNet)}</span></div>
                    <div className="a-line"><span>Mercadoria</span><span>−{euro(cogs)}</span></div>
                    <div className="a-line"><span>Envio CTT</span><span>−{euro(o.cost_carrier_cents)}</span></div>
                    {o.cost_supplier_shipping_cents > 0 && <div className="a-line"><span>Portes do fornecedor</span><span>−{euro(o.cost_supplier_shipping_cents)}</span></div>}
                    <div className="a-line"><span>Comissão pagamento</span><span>−{euro(o.cost_payment_fee_cents)}</span></div>
                    {o.cost_packaging_cents > 0 && <div className="a-line"><span>Embalagem</span><span>−{euro(o.cost_packaging_cents)}</span></div>}
                    <div className={`a-line total ${profit >= 0 ? "pos" : "neg"}`}><span>Margem</span><span>{euro(profit)}</span></div>
                  </div>
                  <p className="a-hint" style={{ marginTop: 8 }}>
                    {o.costs_confirmed ? "Custos confirmados com as faturas." : "Custos estimados (tabela de portes e comissões). Corrige quando chegarem as faturas."}
                    {missingCost && " Há artigos sem custo registado: a margem está inflacionada."}
                  </p>
                </Card>
                {o.returns.length > 0 && (
                  <Card title="Devoluções">
                    {o.returns.map((r: Row) => <p key={r.id}><Link href={`/admin/devolucoes#${r.id}`}>Devolução #{r.number}</Link> · {RETURN_STATUS[r.status]}</p>)}
                  </Card>
                )}
              </div>
            </div>

            <Modal title="Registar envio" open={shipOpen} onClose={() => setShipOpen(false)}>
              <ShipForm order={o} pickups={pickups} cttEnabled={cttEnabled} busy={busy} onSubmit={(p) => act(async () => {
                await rpc("add_shipment", { p_order: o.id, p });
                setShipOpen(false); await s.reload();
              }, "Envio registado e encomenda marcada como enviada.")} />
            </Modal>
            <Modal title="Custos reais da encomenda (sem IVA)" open={costOpen} onClose={() => setCostOpen(false)}>
              <form onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const p = Object.fromEntries(["carrier", "supplier_shipping", "payment_fee", "packaging"].map((k) => [k, toCents(String(f.get(k)))]));
                act(async () => { await rpc("set_order_costs", { p_order: o.id, p }); setCostOpen(false); await s.reload(); }, "Custos atualizados.");
              }}>
                <div className="a-grid-2">
                  <Field label="Envio CTT (€)"><input name="carrier" inputMode="decimal" defaultValue={fromCents(o.cost_carrier_cents)} /></Field>
                  <Field label="Portes do fornecedor (€)"><input name="supplier_shipping" inputMode="decimal" defaultValue={fromCents(o.cost_supplier_shipping_cents)} /></Field>
                  <Field label="Comissão de pagamento (€)"><input name="payment_fee" inputMode="decimal" defaultValue={fromCents(o.cost_payment_fee_cents)} /></Field>
                  <Field label="Embalagem (€)"><input name="packaging" inputMode="decimal" defaultValue={fromCents(o.cost_packaging_cents)} /></Field>
                </div>
                <div className="a-formfoot"><button className="a-btn primary" disabled={busy}>Guardar custos</button></div>
              </form>
            </Modal>
          </>
        );
      }}
    </Loaded>
  );
}

function ShipForm({ order, pickups, cttEnabled, busy, onSubmit }: { order: Row; pickups: Row[]; cttEnabled: boolean; busy: boolean; onSubmit: (p: Row) => void }) {
  const sup = order.order_items.find((i: Row) => i.supplier_id)?.supplier_id ?? null;
  const def = pickups.find((p) => p.supplier_id === sup && p.is_default_pickup) ?? pickups.find((p) => !p.supplier_id && p.is_default_pickup) ?? pickups[0];
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.currentTarget)) as Row;
      onSubmit({ ...f, weight_g: f.weight_kg ? Math.round(Number(String(f.weight_kg).replace(",", ".")) * 1000) : null });
    }}>
      {order.shipping_method?.label && <Alert tone="info">O cliente escolheu: <strong>{order.shipping_method.label}</strong>{order.shipping_method.delivery === "ponto" ? " (levantamento num ponto de recolha)" : ""}.</Alert>}
      {!cttEnabled && <Alert tone="info">A API CTT ainda não está ligada: cria a guia no portal CTT e cola aqui o código de seguimento. Depois de ligada, a etiqueta e o pedido de recolha são criados neste ecrã.</Alert>}
      {pickups.length === 0 && <Alert tone="warn">Ainda não tens moradas de recolha. <Link href="/admin/envios?tab=moradas">Adicionar</Link></Alert>}
      <div className="a-grid-2">
        <Field label="Recolha em">
          <select name="pickup_address_id" defaultValue={def?.id ?? ""}>
            <option value="">—</option>
            {pickups.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Código de seguimento"><input name="tracking_code" placeholder="ex.: EA123456789PT" autoFocus /></Field>
        <Field label="Transportadora"><input name="carrier" defaultValue={order.shipping_method?.carrier ?? "CTT Expresso"} /></Field>
        <Field label="Serviço"><input name="service" defaultValue={order.shipping_method?.service ?? "48h"} /></Field>
        <Field label="Peso (kg)"><input name="weight_kg" inputMode="decimal" defaultValue={order.weight_g ? (order.weight_g / 1000).toString().replace(".", ",") : ""} /></Field>
        <Field label="Volumes"><input name="parcels" type="number" min={1} defaultValue={1} /></Field>
        <Field label="Data da recolha"><input name="pickup_date" type="date" /></Field>
      </div>
      <div className="a-formfoot"><button className="a-btn primary" disabled={busy}>Registar envio</button></div>
    </form>
  );
}
