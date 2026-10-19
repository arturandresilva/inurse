"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { run, sb, type Row } from "@/lib/admin/sb";
import { date, dateTime, euro, ORDER_STATUS, ORDER_TONE } from "@/lib/admin/format";
import { Badge, Card, Field, Loaded, PageHead, Stat, useAction, useLoad } from "@/components/admin/ui";

async function load(id: string) {
  const c = sb();
  const [cu, ov, orders, addresses] = await Promise.all([
    run<Row | null>(c.from("customers").select("*").eq("id", id).maybeSingle()),
    run<Row | null>(c.from("customer_overview").select("total_orders,total_spent_cents,last_order_at").eq("id", id).maybeSingle()),
    run(c.from("orders").select("id,number,status,total_cents,created_at").eq("customer_id", id).order("created_at", { ascending: false })),
    run(c.from("addresses").select("*").eq("customer_id", id)),
  ]);
  if (!cu) throw new Error("Cliente não encontrado.");
  return { cu, ov, orders, addresses };
}

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const s = useLoad(() => load(id), [id]);
  const { busy, act } = useAction();
  return (
    <Loaded s={s}>
      {({ cu, ov, orders, addresses }) => (
        <>
          <PageHead back="/admin/clientes" title={cu.name || cu.email} sub={`Cliente desde ${date(cu.created_at)}${cu.newsletter ? " · subscreve a newsletter" : ""}`} />
          <div className="a-stats">
            <Stat label="Encomendas" value={ov?.total_orders ?? 0} hint={cu.legacy_total_orders ? `${cu.legacy_total_orders} na loja CTT` : undefined} />
            <Stat label="Total gasto" value={euro(ov?.total_spent_cents ?? 0)} />
            <Stat label="Última compra" value={date(ov?.last_order_at)} />
          </div>
          <div className="a-cols">
            <div>
              <Card title="Encomendas nesta loja" className="flush">
                {orders.length === 0 ? <p className="a-muted" style={{ padding: "0 20px 16px" }}>Ainda sem encomendas na loja nova.</p> : (
                  <table className="a-table">
                    <thead><tr><th>Nº</th><th>Data</th><th>Estado</th><th className="num">Total</th></tr></thead>
                    <tbody>{orders.map((o) => (
                      <tr key={o.id}><td><Link href={`/admin/encomendas/${o.number}`}>#{o.number}</Link></td><td>{dateTime(o.created_at)}</td>
                        <td><Badge tone={ORDER_TONE[o.status]}>{ORDER_STATUS[o.status]}</Badge></td><td className="num">{euro(o.total_cents)}</td></tr>
                    ))}</tbody>
                  </table>
                )}
              </Card>
              <Card title="Moradas">
                {addresses.length === 0 ? <p className="a-muted">Sem moradas guardadas.</p> : (
                  <div className="a-grid-2">{addresses.map((a) => (
                    <div key={a.id}><h3>{a.kind === "billing" ? "Faturação" : "Entrega"}</h3>
                      <p>{a.name}<br />{a.line1}{a.line2 ? <>, {a.line2}</> : null}<br />{a.zip} {a.city}<br />{a.region}{a.phone ? <><br />{a.phone}</> : null}</p></div>
                  ))}</div>
                )}
              </Card>
            </div>
            <Card title="Dados">
              <form className="a-form" style={{ gridTemplateColumns: "1fr" }} onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const v = (k: string) => String(f.get(k) ?? "").trim() || null;
                act(async () => {
                  await run(sb().from("customers").update({ name: v("name"), phone: v("phone"), nif: v("nif"), company: v("company"), internal_notes: v("internal_notes"), newsletter: f.get("newsletter") === "on" }).eq("id", cu.id));
                  await s.reload();
                }, "Cliente guardado.");
              }}>
                <Field label="Email"><input value={cu.email} readOnly /></Field>
                <Field label="Nome"><input name="name" defaultValue={cu.name ?? ""} /></Field>
                <Field label="Telefone"><input name="phone" defaultValue={cu.phone ?? ""} /></Field>
                <Field label="NIF"><input name="nif" defaultValue={cu.nif ?? ""} inputMode="numeric" /></Field>
                <Field label="Empresa / instituição"><input name="company" defaultValue={cu.company ?? ""} /></Field>
                <label className="a-check"><input type="checkbox" name="newsletter" defaultChecked={cu.newsletter} /> Aceita receber a newsletter</label>
                <Field label="Notas internas"><textarea name="internal_notes" defaultValue={cu.internal_notes ?? ""} /></Field>
                <div className="a-formfoot"><button className="a-btn primary" disabled={busy}>Guardar</button></div>
              </form>
            </Card>
          </div>
        </>
      )}
    </Loaded>
  );
}
