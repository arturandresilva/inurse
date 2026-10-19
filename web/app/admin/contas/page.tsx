"use client";
import Link from "next/link";
import { useState } from "react";
import { callFunction, rpc, run, sb, type Row } from "@/lib/admin/sb";
import { date, dateTime, euro, euroN, fromCents, isoDay, n1, toCents } from "@/lib/admin/format";
import { md } from "@/lib/admin/markdown";
import { Alert, Card, Confirm, Empty, Field, Loaded, Modal, PageHead, Stat, useAction, useLoad } from "@/components/admin/ui";

const CAT: Record<string, string> = {
  plataforma: "Plataforma e alojamento", dominio: "Domínio", pagamentos: "Pagamentos (gateway)", faturacao: "Faturação", contabilidade: "Contabilidade",
  marketing: "Marketing", publicidade: "Publicidade", transportes: "Transportes", embalagens: "Embalagens", ia: "Inteligência artificial",
  fornecedor: "Fornecedor", impostos: "Impostos e taxas", outros: "Outros",
};
const REC: Record<string, string> = { once: "Pontual", monthly: "Mensal", yearly: "Anual" };

function period(k: string): [string, string, string] {
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
  if (k === "last") return [isoDay(new Date(y, m - 1, 1)), isoDay(new Date(y, m, 0)), "Mês passado"];
  if (k === "q") return [isoDay(new Date(y, m - 2, 1)), isoDay(now), "Últimos 3 meses"];
  if (k === "year") return [isoDay(new Date(y, 0, 1)), isoDay(now), `Ano ${y}`];
  return [isoDay(new Date(y, m, 1)), isoDay(now), "Este mês"];
}

export default function Accounts() {
  const [k, setK] = useState("month");
  const [from, to, label] = period(k);
  const s = useLoad(async () => {
    const c = sb();
    const [pl, months, expenses, report] = await Promise.all([
      rpc<Row>("profit_and_loss", { p_from: from, p_to: to }),
      rpc<Row[]>("profit_by_month", { p_months: 6 }),
      run(c.from("expenses").select("*").order("starts_on", { ascending: false })),
      run<Row | null>(c.from("reports").select("*").eq("agent_key", "contabilista").order("created_at", { ascending: false }).limit(1).maybeSingle()),
    ]);
    return { pl, months, expenses, report };
  }, [k]);
  const [edit, setEdit] = useState<Row | null>(null);
  const [asking, setAsking] = useState(false);
  const { busy, act } = useAction();

  return (
    <>
      <PageHead title="Contabilista" sub="Quanto a loja vende, quanto custa e se estás a ganhar ou a perder dinheiro. Valores sem IVA (o IVA cobrado é do Estado).">
        <select value={k} onChange={(e) => setK(e.target.value)} aria-label="Período" style={{ width: "auto" }}>
          <option value="month">Este mês</option><option value="last">Mês passado</option><option value="q">Últimos 3 meses</option><option value="year">Este ano</option>
        </select>
        <button className="a-btn" disabled={busy || asking} onClick={() => act(async () => {
          setAsking(true);
          try { const r = await callFunction<Row>("agentes", { agent: "contabilista" }); if (r.skipped) throw new Error(r.reason); await s.reload(); }
          finally { setAsking(false); }
        }, "O Contabilista fez a análise.")}>{asking ? "A analisar…" : "Pedir análise ao Contabilista"}</button>
      </PageHead>
      <Loaded s={s}>
        {({ pl, months, expenses, report }) => {
          const res = Number(pl.resultado_eur);
          const max = Math.max(1, ...months.map((m) => Math.abs(Number(m.r?.resultado_eur ?? 0))));
          return (
            <>
              <div className="a-stats">
                <Stat label={`Resultado · ${label}`} value={euroN(res)} tone={res >= 0 ? "ok" : "err"} hint={res >= 0 ? "a ganhar dinheiro" : "a perder dinheiro"} />
                <Stat label="Vendas (s/IVA)" value={euroN(pl.vendas_sem_iva_eur)} hint={`${pl.encomendas} encomendas`} />
                <Stat label="Margem bruta" value={euroN(pl.margem_bruta_eur)} hint={pl.margem_bruta_pct != null ? `${n1(pl.margem_bruta_pct)}% das vendas` : undefined} />
                <Stat label="Custos fixos do período" value={euroN(Number(pl.despesas_fixas_eur) + Number(pl.custo_ia_eur))} />
                {pl.ponto_equilibrio_encomendas_mes != null && <Stat label="Encomendas/mês para cobrir custos" value={pl.ponto_equilibrio_encomendas_mes} />}
              </div>
              {pl.unidades_sem_custo_registado > 0 && <Alert tone="warn">{pl.unidades_sem_custo_registado} unidades vendidas sem custo registado: o resultado está otimista. Importa a tabela do fornecedor ou indica o custo nos produtos.</Alert>}

              <div className="a-cols">
                <Card title={`Conta de resultados · ${label}`}>
                  <div className="a-lines">
                    <div className="a-line"><span>Vendas com IVA</span><span>{euroN(pl.vendas_com_iva_eur)}</span></div>
                    <div className="a-line"><span><strong>Vendas sem IVA</strong></span><span><strong>{euroN(pl.vendas_sem_iva_eur)}</strong></span></div>
                    <div className="a-line neg"><span>Custo da mercadoria</span><span>−{euroN(pl.custo_mercadoria_eur)}</span></div>
                    <div className="a-line neg"><span>Envios CTT</span><span>−{euroN(pl.envios_transportadora_eur)}</span></div>
                    {Number(pl.portes_fornecedor_eur) > 0 && <div className="a-line neg"><span>Portes de fornecedores</span><span>−{euroN(pl.portes_fornecedor_eur)}</span></div>}
                    <div className="a-line neg"><span>Comissões de pagamento</span><span>−{euroN(pl.comissoes_pagamento_eur)}</span></div>
                    {Number(pl.embalagens_eur) > 0 && <div className="a-line neg"><span>Embalagens</span><span>−{euroN(pl.embalagens_eur)}</span></div>}
                    <div className="a-line"><span><strong>Margem bruta</strong></span><span><strong>{euroN(pl.margem_bruta_eur)}</strong></span></div>
                    {Object.entries((pl.despesas_por_categoria_eur ?? {}) as Record<string, number>).map(([c, v]) => (
                      <div key={c} className="a-line neg"><span>{CAT[c] ?? c}</span><span>−{euroN(v)}</span></div>
                    ))}
                    {Number(pl.custo_ia_eur) > 0 && <div className="a-line neg"><span>Agentes IA (API)</span><span>−{euroN(pl.custo_ia_eur)}</span></div>}
                    <div className={`a-line total ${res >= 0 ? "pos" : "neg"}`}><span>Resultado</span><span>{euroN(res)}</span></div>
                  </div>
                  {Number(pl.reembolsos_com_iva_eur) > 0 && <p className="a-hint" style={{ marginTop: 8 }}>Reembolsos no período (não contam como vendas): {euroN(pl.reembolsos_com_iva_eur)}</p>}
                </Card>
                <Card title="Últimos 6 meses">
                  <div className="a-bars" style={{ ["--n" as string]: months.length } as React.CSSProperties}>
                    {months.map((m) => {
                      const v = Number(m.r?.resultado_eur ?? 0);
                      return (
                        <div key={m.mes} className="a-bar" title={`${m.mes}: vendas ${euroN(m.r?.vendas_sem_iva_eur)} · resultado ${euroN(v)}`}>
                          <div className="col"><div className={`fill${v < 0 ? " neg" : ""}`} style={{ height: `${(Math.abs(v) / max) * 100}%` }} /></div>
                          <strong>{euroN(v).replace(/,\d\d/, "")}</strong>
                          <span>{new Date(`${m.mes}-01T12:00`).toLocaleDateString("pt-PT", { month: "short" })}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="a-hint">Resultado por mês (verde = lucro, vermelho = prejuízo).</p>
                </Card>
              </div>

              <Card title="Custos da loja" actions={<button className="a-btn sm primary" onClick={() => setEdit({ category: "outros", recurrence: "monthly", vat_rate: 23, starts_on: isoDay(new Date()) })}>Novo custo</button>} className="flush">
                {expenses.length === 0 ? <Empty title="Sem custos registados">Regista o que pagas todos os meses (domínio, InvoiceXpress, gateway, contabilista, publicidade…).</Empty> : (
                  <div className="a-table-wrap">
                    <table className="a-table">
                      <thead><tr><th>Custo</th><th>Categoria</th><th>Repete</th><th className="num">Valor s/IVA</th><th className="num">Por mês</th><th>Desde</th><th></th></tr></thead>
                      <tbody>{expenses.map((e) => (
                        <tr key={e.id} style={e.ends_on && e.ends_on < isoDay(new Date()) ? { opacity: 0.55 } : undefined}>
                          <td><strong>{e.description}</strong>{e.vendor && <div className="a-small a-muted">{e.vendor}</div>}</td>
                          <td>{CAT[e.category]}</td><td>{REC[e.recurrence]}</td>
                          <td className="num">{euro(e.amount_cents)}</td>
                          <td className="num">{e.recurrence === "monthly" ? euro(e.amount_cents) : e.recurrence === "yearly" ? euro(Math.round(e.amount_cents / 12)) : "—"}</td>
                          <td className="a-small">{date(e.starts_on)}{e.ends_on ? ` → ${date(e.ends_on)}` : ""}</td>
                          <td className="nowrap"><button className="a-btn sm" onClick={() => setEdit(e)}>Editar</button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card title="Última análise do Contabilista" actions={report && <span className="a-small a-muted">{dateTime(report.created_at)}</span>}>
                {report ? <div className="a-md" dangerouslySetInnerHTML={{ __html: md(report.body_md) }} /> : <p className="a-muted">Ainda sem análises. O Contabilista trabalha nos dias 1 e 15 de cada mês, ou quando pedires. <Link href="/admin/agentes">Ver a equipa</Link></p>}
              </Card>
            </>
          );
        }}
      </Loaded>

      <Modal title={edit?.id ? "Editar custo" : "Novo custo"} open={!!edit} onClose={() => setEdit(null)}>
        {edit && (
          <form onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const g = (x: string) => String(f.get(x) ?? "").trim();
            const row = { description: g("description"), category: g("category"), amount_cents: toCents(g("amount")) ?? 0, vat_rate: Number(g("vat_rate")) || 0,
              recurrence: g("recurrence"), starts_on: g("starts_on") || isoDay(new Date()), ends_on: g("ends_on") || null, vendor: g("vendor") || null, notes: g("notes") || null };
            act(async () => {
              if (edit.id) await run(sb().from("expenses").update(row).eq("id", edit.id));
              else await run(sb().from("expenses").insert(row));
              setEdit(null); await s.reload();
            }, "Custo guardado.");
          }}>
            <div className="a-grid-2">
              <Field label="Descrição" wide><input name="description" defaultValue={edit.description ?? ""} required /></Field>
              <Field label="Categoria"><select name="category" defaultValue={edit.category}>{Object.entries(CAT).map(([k2, l]) => <option key={k2} value={k2}>{l}</option>)}</select></Field>
              <Field label="Fornecedor do serviço"><input name="vendor" defaultValue={edit.vendor ?? ""} /></Field>
              <Field label="Valor sem IVA (€)"><input name="amount" inputMode="decimal" defaultValue={fromCents(edit.amount_cents)} required /></Field>
              <Field label="IVA (%)"><input name="vat_rate" inputMode="decimal" defaultValue={edit.vat_rate ?? 23} /></Field>
              <Field label="Repete"><select name="recurrence" defaultValue={edit.recurrence}>{Object.entries(REC).map(([k2, l]) => <option key={k2} value={k2}>{l}</option>)}</select></Field>
              <Field label="Desde"><input name="starts_on" type="date" defaultValue={edit.starts_on ?? ""} /></Field>
              <Field label="Até (vazio = continua)"><input name="ends_on" type="date" defaultValue={edit.ends_on ?? ""} /></Field>
            </div>
            <div className="a-formfoot">
              {edit.id && <Confirm className="a-btn danger" text="Apagar este custo?" onYes={() => act(async () => { await run(sb().from("expenses").delete().eq("id", edit.id)); setEdit(null); await s.reload(); }, "Custo apagado.")}>Apagar</Confirm>}
              <button className="a-btn primary" disabled={busy}>Guardar</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
