"use client";
import Link from "next/link";
import { useState } from "react";
import { run, sb, type Row } from "@/lib/admin/sb";
import { euro, fromCents, toCents } from "@/lib/admin/format";
import { Badge, Card, Empty, Field, Loaded, Modal, PageHead, useAction, useLoad } from "@/components/admin/ui";

async function load() {
  const c = sb();
  const [suppliers, products, pickups, jobs] = await Promise.all([
    run(c.from("suppliers").select("*").order("name")),
    run(c.from("products").select("supplier_id").not("supplier_id", "is", null)),
    run(c.from("pickup_addresses").select("id,label,supplier_id,is_default_pickup,active")),
    run(c.from("import_jobs").select("supplier_id,file_name,applied_at").eq("status", "applied").order("applied_at", { ascending: false })),
  ]);
  return { suppliers, products, pickups, jobs };
}

export default function Suppliers() {
  const s = useLoad(load);
  const [edit, setEdit] = useState<Row | null>(null);
  const { busy, act } = useAction();
  return (
    <>
      <PageHead title="Fornecedores" sub="Quem te vende os artigos, as condições comerciais e de onde a CTT recolhe as encomendas.">
        <button className="a-btn primary" onClick={() => setEdit({ dropship: true, active: true, conditions: {} })}>Novo fornecedor</button>
      </PageHead>
      <Loaded s={s}>
        {(d) => (
          <Card className="flush">
            {d.suppliers.length === 0 ? <Empty title="Sem fornecedores" /> : (
              <div className="a-table-wrap">
                <table className="a-table">
                  <thead><tr><th>Fornecedor</th><th>Contacto</th><th className="num">Produtos</th><th>Recolha CTT</th><th>Última tabela</th><th>Envio</th><th></th></tr></thead>
                  <tbody>
                    {d.suppliers.map((x) => {
                      const n = d.products.filter((p) => p.supplier_id === x.id).length;
                      const pick = d.pickups.find((p) => p.supplier_id === x.id && p.is_default_pickup && p.active);
                      const job = d.jobs.find((j) => j.supplier_id === x.id);
                      return (
                        <tr key={x.id}>
                          <td><strong>{x.name}</strong>{!x.active && <> <Badge>inativo</Badge></>}{x.notes && <div className="a-small a-muted">{x.notes}</div>}</td>
                          <td className="a-small">{x.email ?? "—"}{x.phone ? <><br />{x.phone}</> : null}</td>
                          <td className="num"><Link href={`/admin/produtos`}>{n}</Link></td>
                          <td>{pick ? pick.label : <Link href="/admin/envios?tab=moradas" className="a-badge warn">definir</Link>}</td>
                          <td className="a-small">{job ? job.file_name : <Link href="/admin/importar">importar</Link>}</td>
                          <td className="a-small">{x.dropship ? "Direto ao cliente" : "Para a loja"}{x.lead_time_days ? ` · ${x.lead_time_days} dias` : ""}</td>
                          <td><button className="a-btn sm" onClick={() => setEdit(x)}>Editar</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </Loaded>
      <Modal title={edit?.id ? `Editar ${edit.name}` : "Novo fornecedor"} open={!!edit} onClose={() => setEdit(null)} wide>
        {edit && <SupplierForm x={edit} busy={busy} onSave={(row) => act(async () => {
          if (edit.id) await run(sb().from("suppliers").update(row).eq("id", edit.id));
          else await run(sb().from("suppliers").insert(row));
          setEdit(null); await s.reload();
        }, "Fornecedor guardado.")} />}
      </Modal>
    </>
  );
}

function SupplierForm({ x, busy, onSave }: { x: Row; busy: boolean; onSave: (row: Row) => void }) {
  const c: Row = x.conditions ?? {};
  const [tiers, setTiers] = useState<Row[]>(() => (c.shipping_tiers ?? []).map((t: Row) => ({ up: fromCents(t.up_to_cents), cost: fromCents(t.cost_cents) })));
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const g = (k: string) => String(f.get(k) ?? "").trim();
      const shipping_tiers = tiers.map((t) => ({ up_to_cents: toCents(t.up), cost_cents: toCents(t.cost) }))
        .filter((t) => t.up_to_cents != null && t.cost_cents != null).sort((a, b) => a.up_to_cents! - b.up_to_cents!);
      onSave({
        name: g("name"), email: g("email") || null, phone: g("phone") || null, website: g("website") || null,
        lead_time_days: g("lead_time_days") ? Number(g("lead_time_days")) : null, dropship: f.get("dropship") === "on",
        notes: g("notes") || null, active: f.get("active") === "on",
        conditions: { ...c, shipping_tiers, payment_terms: g("payment_terms") || null,
          payment_discount_pct: g("payment_discount_pct") ? Number(g("payment_discount_pct").replace(",", ".")) : null,
          charges_dropship_shipping: f.get("charges_dropship_shipping") === "on" },
      });
    }}>
      <div className="a-form">
        <Field label="Nome"><input name="name" defaultValue={x.name ?? ""} required /></Field>
        <Field label="Email de encomendas"><input name="email" type="email" defaultValue={x.email ?? ""} /></Field>
        <Field label="Telefone"><input name="phone" defaultValue={x.phone ?? ""} /></Field>
        <Field label="Site"><input name="website" defaultValue={x.website ?? ""} /></Field>
        <Field label="Prazo de entrega ao cliente (dias)"><input name="lead_time_days" type="number" min={0} defaultValue={x.lead_time_days ?? ""} /></Field>
        <Field label="Condições de pagamento"><input name="payment_terms" defaultValue={c.payment_terms ?? ""} placeholder="ex.: pronto pagamento" /></Field>
        <Field label="Desconto pronto pagamento (%)"><input name="payment_discount_pct" inputMode="decimal" defaultValue={c.payment_discount_pct ?? ""} /></Field>
        <Field label="Notas" wide><textarea name="notes" rows={2} style={{ minHeight: 60 }} defaultValue={x.notes ?? ""} /></Field>
      </div>
      <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
        <label className="a-check"><input type="checkbox" name="dropship" defaultChecked={x.dropship !== false} /> Envia diretamente ao cliente (recolha CTT no armazém)</label>
        <label className="a-check"><input type="checkbox" name="charges_dropship_shipping" defaultChecked={!!c.charges_dropship_shipping} /> Cobra portes nas compras com envio direto ao cliente</label>
        <label className="a-check"><input type="checkbox" name="active" defaultChecked={x.active !== false} /> Ativo</label>
      </div>
      <h3 style={{ margin: "18px 0 6px" }}>Portes cobrados pelo fornecedor (compras para a tua morada)</h3>
      <p className="a-hint" style={{ marginBottom: 8 }}>Por escalão de valor da compra, sem IVA. Ex.: até 49,99 € paga 5,00 €; até 74,99 € paga 3,00 €; acima disso grátis.</p>
      <table className="a-table" style={{ maxWidth: 460 }}>
        <thead><tr><th>Compra até (€)</th><th>Portes (€)</th><th></th></tr></thead>
        <tbody>
          {tiers.map((t, i) => (
            <tr key={i}>
              <td><input className="money" value={t.up} onChange={(e) => setTiers((xs) => xs.map((y, j) => (j === i ? { ...y, up: e.target.value } : y)))} aria-label="Compra até" /></td>
              <td><input className="money" value={t.cost} onChange={(e) => setTiers((xs) => xs.map((y, j) => (j === i ? { ...y, cost: e.target.value } : y)))} aria-label="Portes" /></td>
              <td><button type="button" className="a-btn sm ghost" onClick={() => setTiers((xs) => xs.filter((_, j) => j !== i))}>Remover</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="a-btn sm" style={{ marginTop: 8 }} onClick={() => setTiers((xs) => [...xs, { up: "", cost: "" }])}>+ Escalão</button>
      {tiers.length > 0 && <p className="a-hint">Acima de {euro(toCents(tiers[tiers.length - 1]?.up))}: portes grátis.</p>}
      <div className="a-formfoot"><button className="a-btn primary" disabled={busy}>Guardar</button></div>
    </form>
  );
}
