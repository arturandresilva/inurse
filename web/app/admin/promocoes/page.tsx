"use client";
import { useState } from "react";
import { run, sb, type Row } from "@/lib/admin/sb";
import { date, euro, fromCents, toCents } from "@/lib/admin/format";
import { Badge, Card, Confirm, Empty, Field, Loaded, Modal, PageHead, useAction, useLoad } from "@/components/admin/ui";

const KIND: Record<string, string> = { percent: "Percentagem", fixed: "Valor fixo", free_shipping: "Portes grátis" };
const local = (d: string | null) => (d ? new Date(d).toISOString().slice(0, 16) : "");

function state(p: Row): [string, "ok" | "warn" | "muted"] {
  const now = Date.now();
  if (!p.active) return ["Desativada", "muted"];
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return ["Agendada", "warn"];
  if (p.ends_at && new Date(p.ends_at).getTime() < now) return ["Terminou", "muted"];
  if (p.max_uses && p.uses >= p.max_uses) return ["Esgotada", "muted"];
  return ["Ativa", "ok"];
}

export default function Promotions() {
  const s = useLoad(() => run(sb().from("promotions").select("*").order("created_at", { ascending: false })));
  const [edit, setEdit] = useState<Row | null>(null);
  const { busy, act } = useAction();

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? "").trim();
    const kind = g("kind");
    const row = {
      name: g("name"), code: g("code") ? g("code").toUpperCase().replace(/\s+/g, "") : null, kind,
      value: kind === "free_shipping" ? 0 : kind === "fixed" ? (toCents(g("value")) ?? 0) / 100 : Number(g("value").replace(",", ".")) || 0,
      min_order_cents: toCents(g("min_order")) ?? 0,
      starts_at: g("starts_at") ? new Date(g("starts_at")).toISOString() : null,
      ends_at: g("ends_at") ? new Date(g("ends_at")).toISOString() : null,
      max_uses: g("max_uses") ? Number(g("max_uses")) : null,
      active: f.get("active") === "on",
    };
    act(async () => {
      if (!row.name) throw new Error("Dá um nome à promoção.");
      if (kind === "percent" && (row.value <= 0 || row.value > 90)) throw new Error("A percentagem deve estar entre 1 e 90.");
      if (edit?.id) await run(sb().from("promotions").update(row).eq("id", edit.id));
      else await run(sb().from("promotions").insert(row));
      setEdit(null); await s.reload();
    }, "Promoção guardada.");
  }

  return (
    <>
      <PageHead title="Promoções" sub="Códigos de desconto para o carrinho. Os agentes de marketing também propõem promoções — tu aprovas.">
        <button className="a-btn primary" onClick={() => setEdit({ kind: "percent", active: true })}>Nova promoção</button>
      </PageHead>
      <Loaded s={s}>
        {(rows) => (
          <Card className="flush">
            {rows.length === 0 ? <Empty title="Sem promoções">Cria um código, por exemplo ENFERMEIRO10.</Empty> : (
              <div className="a-table-wrap">
                <table className="a-table">
                  <thead><tr><th>Nome</th><th>Código</th><th>Desconto</th><th>Mínimo</th><th>Período</th><th className="num">Usos</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {rows.map((p) => {
                      const [l, t] = state(p);
                      return (
                        <tr key={p.id}>
                          <td><strong>{p.name}</strong></td>
                          <td>{p.code ? <code>{p.code}</code> : <span className="a-muted">sem código</span>}</td>
                          <td>{p.kind === "percent" ? `${Number(p.value)}%` : p.kind === "fixed" ? euro(Math.round(Number(p.value) * 100)) : "Portes grátis"}</td>
                          <td>{p.min_order_cents ? euro(p.min_order_cents) : "—"}</td>
                          <td className="a-small">{p.starts_at || p.ends_at ? `${date(p.starts_at)} → ${date(p.ends_at)}` : "Sem limite"}</td>
                          <td className="num">{p.uses}{p.max_uses ? ` / ${p.max_uses}` : ""}</td>
                          <td><Badge tone={t}>{l}</Badge></td>
                          <td className="nowrap">
                            <button className="a-btn sm" onClick={() => setEdit(p)}>Editar</button>{" "}
                            <Confirm className="a-btn sm danger" text={`Apagar a promoção “${p.name}”?`} onYes={() => act(async () => { await run(sb().from("promotions").delete().eq("id", p.id)); await s.reload(); }, "Promoção apagada.")}>Apagar</Confirm>
                          </td>
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
      <Modal title={edit?.id ? "Editar promoção" : "Nova promoção"} open={!!edit} onClose={() => setEdit(null)}>
        {edit && <PromoForm p={edit} busy={busy} onSubmit={save} />}
      </Modal>
    </>
  );
}

function PromoForm({ p, busy, onSubmit }: { p: Row; busy: boolean; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) {
  const [kind, setKind] = useState<string>(p.kind ?? "percent");
  return (
    <form onSubmit={onSubmit}>
      <div className="a-grid-2">
        <Field label="Nome (interno)"><input name="name" defaultValue={p.name ?? ""} required /></Field>
        <Field label="Código" hint="O cliente escreve-o no carrinho."><input name="code" defaultValue={p.code ?? ""} style={{ textTransform: "uppercase" }} required /></Field>
        <Field label="Tipo">
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        {kind !== "free_shipping" && <Field label={kind === "percent" ? "Desconto (%)" : "Desconto (€)"}>
          <input name="value" inputMode="decimal" defaultValue={p.value == null ? "" : kind === "fixed" ? fromCents(Math.round(Number(p.value) * 100)) : String(p.value)} required /></Field>}
        <Field label="Compra mínima (€)"><input name="min_order" inputMode="decimal" defaultValue={fromCents(p.min_order_cents)} /></Field>
        <Field label="Máximo de usos"><input name="max_uses" type="number" min={1} defaultValue={p.max_uses ?? ""} /></Field>
        <Field label="Começa"><input name="starts_at" type="datetime-local" defaultValue={local(p.starts_at)} /></Field>
        <Field label="Acaba"><input name="ends_at" type="datetime-local" defaultValue={local(p.ends_at)} /></Field>
      </div>
      <label className="a-check" style={{ marginTop: 12 }}><input type="checkbox" name="active" defaultChecked={p.active !== false} /> Ativa</label>
      <div className="a-formfoot"><button className="a-btn primary" disabled={busy}>Guardar</button></div>
    </form>
  );
}
