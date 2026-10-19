"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { rpc, run, sb, type Row } from "@/lib/admin/sb";
import { dateTime, euro, fromCents, toCents } from "@/lib/admin/format";
import { previewPrice } from "@/lib/admin/pricing";
import { Alert, Badge, Card, Confirm, Empty, Field, Loaded, Modal, PageHead, Tabs, useAction, useLoad } from "@/components/admin/ui";

const SCOPE: Record<string, string> = { global: "Toda a loja", supplier: "Fornecedor", brand: "Marca", category: "Categoria", product: "Produto" };
const ROUND: Record<string, string> = { "0.90": "termina em ,90", "0.99": "termina em ,99", "0.50": "termina em ,50", "1.00": "euro redondo", none: "sem arredondamento" };

async function load() {
  const c = sb();
  const [rules, suppliers, brands, categories, products, history] = await Promise.all([
    run(c.from("pricing_rules").select("*").order("created_at")),
    run(c.from("suppliers").select("id,name").order("name")),
    run(c.from("brands").select("id,name").order("name")),
    run(c.from("categories").select("id,name,path").order("path")),
    run(c.from("products").select("id,title").order("title")),
    run(c.from("price_history").select("id,old_cents,new_cents,reason,created_at,variants(option_value,products(title))").order("created_at", { ascending: false }).limit(60)),
  ]);
  return { rules, suppliers, brands, categories, products, history };
}

export default function Pricing() {
  const s = useLoad(load);
  const [tab, setTab] = useState("rules");
  const [edit, setEdit] = useState<Row | null>(null);
  const [sim, setSim] = useState<Row[] | null>(null);
  const { busy, act } = useAction();

  const scopeName = (d: Awaited<ReturnType<typeof load>>, r: Row) => {
    if (r.scope === "global") return "Toda a loja";
    const list = r.scope === "supplier" ? d.suppliers : r.scope === "brand" ? d.brands : r.scope === "category" ? d.categories : d.products;
    const it = list.find((x) => x.id === r.scope_id);
    return `${SCOPE[r.scope]}: ${it?.name ?? it?.title ?? it?.path ?? "?"}`;
  };

  return (
    <>
      <PageHead title="Preços e margens" sub="Escolhe, por loja, fornecedor, marca, categoria ou produto, se o preço vem da tua margem sobre o custo ou do PVPR do fornecedor. A regra mais específica ganha.">
        <button className="a-btn" disabled={busy} onClick={() => act(async () => setSim(await rpc<Row[]>("apply_pricing", { p_products: null, p_dry_run: true })))}>Simular em todo o catálogo</button>
        <button className="a-btn primary" onClick={() => setEdit({ scope: "global", base: "cost", method: "margin", pct: 40, rounding: "0.90", min_profit_cents: 0, priority: 0, rrp_adjust_pct: 0, active: true })}>Nova regra</button>
      </PageHead>
      <Tabs tabs={[["rules", "Regras"], ["history", "Histórico de preços"]]} value={tab} onChange={setTab} />
      <Loaded s={s}>
        {(d) => tab === "history" ? (
          <Card className="flush">
            {d.history.length === 0 ? <Empty title="Sem alterações de preço" /> : (
              <table className="a-table">
                <thead><tr><th>Data</th><th>Produto</th><th>Tam.</th><th className="num">Antes</th><th className="num">Depois</th><th>Origem</th></tr></thead>
                <tbody>{d.history.map((h) => (
                  <tr key={h.id}><td className="nowrap a-muted">{dateTime(h.created_at)}</td><td>{h.variants?.products?.title}</td><td>{h.variants?.option_value}</td>
                    <td className="num">{euro(h.old_cents)}</td><td className="num">{euro(h.new_cents)}</td>
                    <td><Badge tone={h.reason === "agente" ? "info" : "muted"}>{({ regra: "regra", manual: "à mão", importacao: "importação", agente: "agente (aprovado)" } as Record<string, string>)[h.reason] ?? h.reason}</Badge></td></tr>
                ))}</tbody>
              </table>
            )}
          </Card>
        ) : (
          <>
            {d.rules.filter((r) => r.active).length === 0 && <Alert tone="warn">Sem regras ativas: os preços só mudam à mão. Cria pelo menos uma regra para “Toda a loja”.</Alert>}
            <Card className="flush">
              {d.rules.length === 0 ? <Empty title="Sem regras">Exemplo: margem de 40% sobre o custo para toda a loja, e PVPR do fornecedor para as meias.</Empty> : (
                <div className="a-table-wrap">
                  <table className="a-table">
                    <thead><tr><th>Regra</th><th>Aplica-se a</th><th>Preço</th><th>Arredondar</th><th className="num">Lucro mín.</th><th className="num">Exemplo</th><th>Estado</th><th></th></tr></thead>
                    <tbody>
                      {d.rules.map((r) => {
                        const ex = previewPrice(r, 3000, 5990, 23);
                        return (
                          <tr key={r.id}>
                            <td><strong>{r.name}</strong>{r.priority ? <div className="a-small a-muted">prioridade {r.priority}</div> : null}</td>
                            <td>{scopeName(d, r)}</td>
                            <td>{r.base === "rrp" ? `PVPR ${Number(r.rrp_adjust_pct) ? `${Number(r.rrp_adjust_pct) > 0 ? "+" : ""}${Number(r.rrp_adjust_pct)}%` : "do fornecedor"}` : `${r.method === "margin" ? "Margem" : "Markup"} ${Number(r.pct)}% sobre o custo`}</td>
                            <td>{ROUND[r.rounding]}</td>
                            <td className="num">{r.min_profit_cents ? euro(r.min_profit_cents) : "—"}</td>
                            <td className="num a-small" title={r.base === "rrp" ? "PVPR 59,90 € (custo 30 €)" : "Custo 30 € s/IVA, IVA 23%"}>{euro(ex)}</td>
                            <td><Badge tone={r.active ? "ok" : "muted"}>{r.active ? "Ativa" : "Inativa"}</Badge></td>
                            <td className="nowrap">
                              <button className="a-btn sm" onClick={() => setEdit(r)}>Editar</button>{" "}
                              <Confirm className="a-btn sm danger" text={`Apagar a regra “${r.name}”? Os preços atuais mantêm-se.`} onYes={() => act(async () => { await run(sb().from("pricing_rules").delete().eq("id", r.id)); await s.reload(); }, "Regra apagada.")}>Apagar</Confirm>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card title="Como funciona">
              <ul className="a-md" style={{ margin: 0 }}>
                <li><strong>Margem sobre o custo</strong>: preço sem IVA = custo ÷ (1 − margem). Com 40% e custo 30 €, vendes a 50 € + IVA = 61,50 € → <strong>61,90 €</strong>.</li>
                <li><strong>Markup</strong>: preço sem IVA = custo × (1 + %). Mais simples, dá preços mais baixos que a margem com a mesma %.</li>
                <li><strong>PVPR</strong>: usa o preço recomendado da folha do fornecedor (com IVA), com ajuste opcional (ex.: −5% para ficar abaixo da concorrência). Tamanhos sem PVPR não mudam.</li>
                <li>O <strong>lucro mínimo</strong> impede que um artigo barato fique com lucro de cêntimos.</li>
                <li>Preços marcados como <strong>fixos</strong> no produto nunca são alterados pelas regras. Nada muda sem carregares em “Aplicar”.</li>
              </ul>
            </Card>
          </>
        )}
      </Loaded>

      <Modal title={edit?.id ? "Editar regra" : "Nova regra de preço"} open={!!edit} onClose={() => setEdit(null)} wide>
        {edit && s.data && <RuleForm r={edit} d={s.data} busy={busy} onSave={(row) => act(async () => {
          if (edit.id) await run(sb().from("pricing_rules").update(row).eq("id", edit.id));
          else await run(sb().from("pricing_rules").insert(row));
          setEdit(null); await s.reload();
          setSim(await rpc<Row[]>("apply_pricing", { p_products: null, p_dry_run: true }));
        }, "Regra guardada. Vê abaixo o efeito antes de aplicar.")} />}
      </Modal>

      <Modal title="Simulação: preços que mudam" open={sim !== null} onClose={() => setSim(null)} wide>
        {sim && (sim.length === 0 ? <Alert tone="ok">Todos os preços já estão de acordo com as regras.</Alert> : <SimTable sim={sim} busy={busy} onApply={() => act(async () => {
          const r = await rpc<Row[]>("apply_pricing", { p_products: null, p_dry_run: false });
          setSim(null); await s.reload();
          return r;
        }, `Preços atualizados (${sim.length} tamanhos).`)} />)}
      </Modal>
    </>
  );
}

function SimTable({ sim, busy, onApply }: { sim: Row[]; busy: boolean; onApply: () => void }) {
  const up = sim.filter((x) => x.new_cents > x.old_cents).length;
  const products = new Set(sim.map((x) => x.product_title)).size;
  return (
    <>
      <p style={{ marginBottom: 10 }}><strong>{sim.length}</strong> tamanhos em <strong>{products}</strong> produtos: {up} sobem, {sim.length - up} descem.</p>
      <div className="a-table-wrap" style={{ maxHeight: 420, overflow: "auto" }}>
        <table className="a-table">
          <thead><tr><th>Produto</th><th>Tam.</th><th className="num">Custo</th><th className="num">Atual</th><th className="num">Novo</th><th>Regra</th></tr></thead>
          <tbody>{sim.slice(0, 400).map((r) => (
            <tr key={r.variant_id}><td>{r.product_title}</td><td>{r.option_value}</td><td className="num">{euro(r.cost_cents)}</td>
              <td className="num">{euro(r.old_cents)}</td><td className="num"><strong>{euro(r.new_cents)}</strong> {r.new_cents > r.old_cents ? "↑" : "↓"}</td><td className="a-small">{r.rule_name}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <div className="a-formfoot"><button className="a-btn primary" disabled={busy} onClick={onApply}>Aplicar {sim.length} alterações</button></div>
    </>
  );
}

function RuleForm({ r, d, busy, onSave }: { r: Row; d: Awaited<ReturnType<typeof load>>; busy: boolean; onSave: (row: Row) => void }) {
  const [f, setF] = useState<Row>({ ...r, min_profit: fromCents(r.min_profit_cents) });
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const list = f.scope === "supplier" ? d.suppliers.map((x) => [x.id, x.name]) : f.scope === "brand" ? d.brands.map((x) => [x.id, x.name])
    : f.scope === "category" ? d.categories.map((x) => [x.id, x.path.replace(/>/g, " › ")]) : f.scope === "product" ? d.products.map((x) => [x.id, x.title]) : [];
  const row = useMemo(() => ({
    name: String(f.name ?? "").trim(), scope: f.scope, scope_id: f.scope === "global" ? null : f.scope_id || null, base: f.base,
    method: f.method, pct: Number(String(f.pct).replace(",", ".")) || 0, rrp_adjust_pct: Number(String(f.rrp_adjust_pct).replace(",", ".")) || 0,
    rounding: f.rounding, min_profit_cents: toCents(f.min_profit) ?? 0, priority: Number(f.priority) || 0, active: !!f.active,
  }), [f]);
  const ex = (cost: number, rrp: number, vat: number) => euro(previewPrice(row, cost, rrp, vat));
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (!row.name) return alert("Dá um nome à regra.");
      if (row.scope !== "global" && !row.scope_id) return alert("Escolhe a que se aplica.");
      onSave(row);
    }}>
      <div className="a-form">
        <Field label="Nome"><input value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="ex.: Meias pelo PVPR" required /></Field>
        <Field label="Aplica-se a">
          <select value={f.scope} onChange={(e) => { set("scope", e.target.value); set("scope_id", null); }}>
            {Object.entries(SCOPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        {f.scope !== "global" && <Field label={SCOPE[f.scope]}>
          <select value={f.scope_id ?? ""} onChange={(e) => set("scope_id", e.target.value)} required>
            <option value="">Escolher…</option>
            {list.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
        </Field>}
        <Field label="O preço vem de" wide>
          <div className="a-inline">
            <label className="a-check"><input type="radio" name="base" checked={f.base === "cost"} onChange={() => set("base", "cost")} /> A minha margem sobre o custo</label>
            <label className="a-check"><input type="radio" name="base" checked={f.base === "rrp"} onChange={() => set("base", "rrp")} /> PVPR do fornecedor</label>
          </div>
        </Field>
        {f.base === "cost" ? <>
          <Field label="Cálculo">
            <select value={f.method} onChange={(e) => set("method", e.target.value)}>
              <option value="margin">Margem (% do preço sem IVA)</option>
              <option value="markup">Markup (% sobre o custo)</option>
            </select>
          </Field>
          <Field label="Percentagem"><input inputMode="decimal" value={f.pct ?? ""} onChange={(e) => set("pct", e.target.value)} /></Field>
        </> : (
          <Field label="Ajuste ao PVPR (%)" hint="0 = igual ao PVPR; −5 = 5% abaixo"><input inputMode="decimal" value={f.rrp_adjust_pct ?? 0} onChange={(e) => set("rrp_adjust_pct", e.target.value)} /></Field>
        )}
        <Field label="Arredondar">
          <select value={f.rounding} onChange={(e) => set("rounding", e.target.value)}>
            {Object.entries(ROUND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Lucro mínimo por unidade (€, s/IVA)"><input inputMode="decimal" value={f.min_profit ?? ""} onChange={(e) => set("min_profit", e.target.value)} /></Field>
        <Field label="Prioridade" hint="Desempata regras do mesmo nível"><input type="number" value={f.priority ?? 0} onChange={(e) => set("priority", e.target.value)} /></Field>
      </div>
      <label className="a-check" style={{ marginTop: 12 }}><input type="checkbox" checked={!!f.active} onChange={(e) => set("active", e.target.checked)} /> Ativa</label>
      <Alert tone="info">
        Exemplos: soca com custo 30,00 € {f.base === "rrp" ? "e PVPR 59,90 € " : ""}→ <strong>{ex(3000, 5990, 23)}</strong> ·
        meia com custo 4,50 € {f.base === "rrp" ? "e PVPR 9,90 € " : ""}(IVA 6%) → <strong>{ex(450, 990, 6)}</strong>
      </Alert>
      <div className="a-formfoot">
        <Link className="a-btn ghost" href="/admin/produtos">Ver produtos</Link>
        <button className="a-btn primary" disabled={busy}>Guardar e simular</button>
      </div>
    </form>
  );
}
