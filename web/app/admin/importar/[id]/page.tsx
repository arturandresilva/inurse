"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { rpc, run, sb, type Row } from "@/lib/admin/sb";
import { euro, marginPct, pct } from "@/lib/admin/format";
import { previewPrice } from "@/lib/admin/pricing";
import { Alert, Badge, Card, Empty, Field, Loaded, Modal, PageHead, Pager, Stat, Tabs, useAction, useDebounced, useLoad } from "@/components/admin/ui";

async function allRows(job: string) {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const part = await run(sb().from("import_rows").select("id,row_index,model_ref,title,color,size,cost_cents,rrp_cents,vat_rate,category_path,action,issues,match_product_id,match_variant_id")
      .eq("job_id", job).order("row_index").range(from, from + 999));
    out.push(...part);
    if (part.length < 1000) return out;
  }
}

async function load(id: string) {
  const c = sb();
  const job = await run<Row | null>(c.from("import_jobs").select("*").eq("id", id).maybeSingle());
  if (!job) throw new Error("Importação não encontrada.");
  const [rows, supplier, rules, products] = await Promise.all([
    allRows(id),
    job.supplier_id ? run<Row | null>(c.from("suppliers").select("id,name").eq("id", job.supplier_id).maybeSingle()) : Promise.resolve(null),
    run(c.from("pricing_rules").select("*").eq("active", true)),
    run(c.from("products").select("id,title,handle,status,variants(price_cents)").order("title").limit(3000)),
  ]);
  return { job, rows, supplier, rules, products };
}

type Group = { key: string; ref: string | null; title: string; color: string | null; rows: Row[]; product: Row | null; action: string; issues: string[]; cost: number | null; rrp: number | null; vat: number; current: number | null };

export default function ReviewImport() {
  const { id } = useParams<{ id: string }>();
  const s = useLoad(() => load(id), [id]);
  return <Loaded s={s}>{(d) => <Review d={d} reload={s.reload} />}</Loaded>;
}

function Review({ d, reload }: { d: Awaited<ReturnType<typeof load>>; reload: () => Promise<void> }) {
  const { busy, act } = useAction();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 200);
  const [page, setPage] = useState(0);
  const [linkFor, setLinkFor] = useState<Group | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const supRule = d.rules.find((r) => r.scope === "supplier" && r.scope_id === d.job.supplier_id);
  const globalRule = d.rules.find((r) => r.scope === "global");
  const [price, setPrice] = useState<Row>(() => supRule
    ? { mode: "keep" }
    : { mode: "rrp", adj: 0, margin: 40, rounding: "0.90" });
  const [opts, setOpts] = useState<Row>(() => ({ create_new: true, update_costs: true, new_status: "draft", ...d.job.options }));
  const editable = d.job.status === "review";

  const rule: Row | null = price.mode === "keep" ? (supRule ?? globalRule ?? null)
    : price.mode === "rrp" ? { base: "rrp", rrp_adjust_pct: Number(price.adj) || 0, rounding: price.rounding, min_profit_cents: 0 }
    : { base: "cost", method: "margin", pct: Number(price.margin) || 0, rounding: price.rounding, min_profit_cents: 0 };

  const groups: Group[] = useMemo(() => {
    const m = new Map<string, Group>();
    const byId = new Map(d.products.map((p) => [p.id, p]));
    for (const r of d.rows) {
      const key = r.model_ref ?? `${r.title}|${r.color}`;
      let g = m.get(key);
      if (!g) {
        g = { key, ref: r.model_ref, title: r.title ?? "(sem nome)", color: r.color, rows: [], product: r.match_product_id ? byId.get(r.match_product_id) ?? null : null,
          action: r.action, issues: [], cost: r.cost_cents, rrp: r.rrp_cents, vat: Number(r.vat_rate) || 23, current: null };
        m.set(key, g);
      }
      g.rows.push(r);
      for (const i of r.issues ?? []) if (!g.issues.includes(i)) g.issues.push(i);
      if (r.action !== "skip") g.action = r.action === "update" || g.action === "update" ? "update" : r.action;
      if (g.rows.every((x) => x.action === "skip")) g.action = "skip";
    }
    for (const g of m.values()) {
      const prices = (g.product?.variants ?? []).map((v: Row) => v.price_cents).filter((x: number) => x > 0);
      g.current = prices.length ? Math.min(...prices) : null;
    }
    return [...m.values()];
  }, [d]);

  const counts = {
    all: groups.length,
    linked: groups.filter((g) => g.product).length,
    new: groups.filter((g) => !g.product && g.action !== "skip").length,
    issues: groups.filter((g) => g.issues.length).length,
    skip: groups.filter((g) => g.action === "skip").length,
  };
  const filtered = groups.filter((g) => {
    if (tab === "linked" && !g.product) return false;
    if (tab === "new" && (g.product || g.action === "skip")) return false;
    if (tab === "issues" && !g.issues.length) return false;
    if (tab === "skip" && g.action !== "skip") return false;
    const t = dq.trim().toLowerCase();
    return !t || `${g.ref} ${g.title} ${g.color} ${g.product?.title ?? ""}`.toLowerCase().includes(t);
  });
  const SIZE = 50;
  const shown = filtered.slice(page * SIZE, page * SIZE + SIZE);
  const rowsOn = d.rows.filter((r) => r.action !== "skip");
  const newProducts = groups.filter((g) => !g.product && g.action !== "skip").length;

  async function setAction(g: Group, on: boolean) {
    await act(async () => {
      const ids = g.rows.map((r) => r.id);
      if (!on) await run(sb().from("import_rows").update({ action: "skip" }).in("id", ids));
      else {
        const upd = g.rows.filter((r) => r.match_variant_id).map((r) => r.id), cre = g.rows.filter((r) => !r.match_variant_id).map((r) => r.id);
        if (upd.length) await run(sb().from("import_rows").update({ action: "update" }).in("id", upd));
        if (cre.length) await run(sb().from("import_rows").update({ action: "create" }).in("id", cre));
      }
      await reload();
    });
  }

  async function apply() {
    await act(async () => {
      if (price.mode !== "keep") {
        const name = `${d.supplier?.name ?? "Fornecedor"} — ${price.mode === "rrp" ? `PVPR${Number(price.adj) ? ` ${Number(price.adj) > 0 ? "+" : ""}${Number(price.adj)}%` : ""}` : `margem ${Number(price.margin)}%`}`;
        const row = { name, scope: "supplier", scope_id: d.job.supplier_id, base: rule!.base, method: rule!.method ?? "margin", pct: rule!.pct ?? 0,
          rrp_adjust_pct: rule!.rrp_adjust_pct ?? 0, rounding: price.rounding, min_profit_cents: 0, active: true };
        if (!d.job.supplier_id) throw new Error("Esta importação não tem fornecedor.");
        if (supRule) await run(sb().from("pricing_rules").update(row).eq("id", supRule.id));
        else await run(sb().from("pricing_rules").insert(row));
      }
      await run(sb().from("import_jobs").update({ options: opts }).eq("id", d.job.id));
      const r = await rpc<Row>("apply_import_job", { p_job: d.job.id });
      setConfirmOpen(false);
      await reload();
      return r;
    }, "Importação aplicada ao catálogo.");
  }

  const st = d.job.stats ?? {};
  return (
    <>
      <PageHead back="/admin/importar" title={d.job.file_name}
        sub={<>{d.supplier?.name ?? "Sem fornecedor"} · {d.rows.length} tamanhos em {groups.length} artigos</>}>
        {editable && <button className="a-btn" disabled={busy} onClick={() => act(async () => { await run(sb().from("import_jobs").update({ status: "cancelled" }).eq("id", d.job.id)); await reload(); }, "Importação cancelada.")}>Cancelar importação</button>}
        {editable && <button className="a-btn primary" disabled={busy || rowsOn.length === 0} onClick={() => setConfirmOpen(true)}>Aplicar ao catálogo</button>}
      </PageHead>

      {d.job.status === "applied" && (
        <Alert tone="ok">Aplicada: {st.produtos_criados ?? 0} produtos novos (em {opts.new_status === "active" ? "ativo" : "rascunho"}), {st.tamanhos_criados ?? 0} tamanhos novos e {st.tamanhos_atualizados ?? 0} atualizados.
          <Link className="a-btn sm" href="/admin/produtos">Ver produtos</Link></Alert>
      )}
      {d.job.status === "cancelled" && <Alert tone="muted">Importação cancelada. O catálogo não foi alterado.</Alert>}

      <div className="a-stats">
        <Stat label="Ligados a produtos da loja" value={counts.linked} hint={`${st.ligados_pelo_nome ?? 0} ligados pelo nome: confirma`} />
        <Stat label="Artigos novos" value={counts.new} hint={opts.create_new ? `entram em ${opts.new_status === "active" ? "ativo" : "rascunho"}` : "não serão criados"} />
        <Stat label="Com avisos" value={counts.issues} tone={counts.issues ? "warn" : undefined} />
        <Stat label="Ignorados" value={counts.skip} />
      </div>

      {editable && (
        <div className="a-cols even">
          <Card title="Preço de venda destes artigos">
            <div style={{ display: "grid", gap: 8 }}>
              {supRule && <label className="a-check"><input type="radio" checked={price.mode === "keep"} onChange={() => setPrice({ ...price, mode: "keep" })} /> Manter a regra atual do fornecedor ({supRule.base === "rrp" ? "PVPR" : `margem ${Number(supRule.pct)}%`})</label>}
              <label className="a-check"><input type="radio" checked={price.mode === "rrp"} onChange={() => setPrice({ ...price, mode: "rrp", rounding: price.rounding ?? "0.90" })} /> Usar o PVPR do fornecedor</label>
              {price.mode === "rrp" && <Field label="Ajuste ao PVPR (%)" hint="0 = igual; −5 = 5% abaixo"><input inputMode="decimal" value={price.adj ?? 0} onChange={(e) => setPrice({ ...price, adj: e.target.value })} style={{ maxWidth: 120 }} /></Field>}
              <label className="a-check"><input type="radio" checked={price.mode === "margin"} onChange={() => setPrice({ ...price, mode: "margin", rounding: price.rounding ?? "0.90", margin: price.margin ?? 40 })} /> A minha margem sobre o custo</label>
              {price.mode === "margin" && <Field label="Margem (%)"><input inputMode="decimal" value={price.margin ?? 40} onChange={(e) => setPrice({ ...price, margin: e.target.value })} style={{ maxWidth: 120 }} /></Field>}
              {price.mode === "keep" && !supRule && <p className="a-hint">Sem regra para este fornecedor: usa-se a regra geral da loja.</p>}
              <p className="a-hint">{price.mode === "keep" ? "Os preços seguem as regras atuais." : `Fica gravada como regra do fornecedor ${d.supplier?.name ?? ""} (podes mudar em Preços e margens).`} Preços fixados à mão não mudam.</p>
            </div>
          </Card>
          <Card title="Opções">
            <div style={{ display: "grid", gap: 8 }}>
              <label className="a-check"><input type="checkbox" checked={!!opts.update_costs} onChange={(e) => setOpts({ ...opts, update_costs: e.target.checked })} /> Atualizar o custo dos produtos que já tens</label>
              <label className="a-check"><input type="checkbox" checked={!!opts.create_new} onChange={(e) => setOpts({ ...opts, create_new: e.target.checked })} /> Criar os artigos novos ({newProducts})</label>
              {opts.create_new && <Field label="Artigos novos entram como">
                <select value={opts.new_status} onChange={(e) => setOpts({ ...opts, new_status: e.target.value })} style={{ maxWidth: 260 }}>
                  <option value="draft">Rascunho (revês e ativas depois)</option>
                  <option value="active">Ativos (visíveis na loja)</option>
                </select>
              </Field>}
              <p className="a-hint">Os produtos ligados ficam associados ao fornecedor e à referência dele, para as próximas tabelas atualizarem sozinhas.</p>
            </div>
          </Card>
        </div>
      )}

      <Tabs tabs={[["all", `Todos (${counts.all})`], ["linked", `Na loja (${counts.linked})`], ["new", `Novos (${counts.new})`], ["issues", `Avisos (${counts.issues})`], ["skip", `Ignorados (${counts.skip})`]]}
        value={tab} onChange={(v) => { setTab(v); setPage(0); }} />
      <div className="a-toolbar"><input type="search" placeholder="Procurar referência ou nome" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Procurar" /></div>
      <Card className="flush">
        {shown.length === 0 ? <Empty title="Nada nesta vista" /> : (
          <div className="a-table-wrap">
            <table className="a-table">
              <thead><tr>
                {editable && <th title="Importar">Usar</th>}
                <th>Ref.</th><th>Artigo</th><th>Tamanhos</th><th className="num">Custo</th><th className="num">PVPR</th>
                <th className="num">Preço na loja</th><th className="num">Margem</th><th>Produto na loja</th><th>Avisos</th>
              </tr></thead>
              <tbody>
                {shown.map((g) => {
                  const np = rule ? previewPrice(rule, g.cost, g.rrp, g.vat) : null;
                  const m = marginPct(np, g.cost, g.vat);
                  const sizes = g.rows.map((r) => r.size);
                  return (
                    <tr key={g.key} className={g.issues.length ? "a-row-issue" : ""} style={g.action === "skip" ? { opacity: 0.55 } : undefined}>
                      {editable && <td><input type="checkbox" checked={g.action !== "skip"} disabled={busy} onChange={(e) => setAction(g, e.target.checked)} aria-label={`Importar ${g.title}`} /></td>}
                      <td className="nowrap">{g.ref ?? "—"}</td>
                      <td>{g.title}</td>
                      <td className="a-small">{sizes.length > 4 ? `${sizes[0]} a ${sizes[sizes.length - 1]} (${sizes.length})` : sizes.join(", ")}</td>
                      <td className="num">{euro(g.cost)}</td>
                      <td className="num">{euro(g.rrp)}</td>
                      <td className="num">{np == null ? <span className="a-muted" title="Sem custo/PVPR para calcular">—</span> : <>
                        <strong>{euro(np)}</strong>{g.current != null && g.current !== np && <div className="a-small a-muted">hoje {euro(g.current)}</div>}</>}</td>
                      <td className="num">{m == null ? "—" : <span className={m < 20 ? "a-badge warn" : ""}>{pct(m)}</span>}</td>
                      <td>
                        {g.product ? <><Link href={`/admin/produtos/${g.product.id}`} target="_blank">{g.product.title}</Link>{g.rows.some((r) => !r.match_variant_id) && <div className="a-small a-muted">+{g.rows.filter((r) => !r.match_variant_id).length} tamanhos novos</div>}</>
                          : <span className="a-muted">{g.action === "skip" ? "—" : "novo produto"}</span>}
                        {editable && <div><button className="a-link a-small" onClick={() => setLinkFor(g)}>{g.product ? "mudar" : "ligar a produto existente"}</button></div>}
                      </td>
                      <td className="a-small">{g.issues.map((i) => <Badge key={i} tone={i === "ligado pelo nome" ? "info" : "warn"}>{i}</Badge>)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} size={SIZE} total={filtered.length} onPage={setPage} />
      </Card>

      <Modal title={linkFor ? `Ligar “${linkFor.title}” a um produto da loja` : ""} open={!!linkFor} onClose={() => setLinkFor(null)}>
        {linkFor && <LinkPicker products={d.products} current={linkFor.product?.id ?? null} onPick={(pid) => act(async () => {
          if (!linkFor.ref) throw new Error("Este artigo não tem referência; não é possível ligar.");
          await rpc("set_import_product", { p_job: d.job.id, p_model_ref: linkFor.ref, p_product: pid });
          setLinkFor(null); await reload();
        }, pid ? "Ligado ao produto." : "Vai ser criado como produto novo.")} />}
      </Modal>

      <Modal title="Aplicar ao catálogo" open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <p>Vai acontecer:</p>
        <ul>
          <li>{groups.filter((g) => g.product && g.action !== "skip").length} produtos existentes ligados a {d.supplier?.name}{opts.update_costs ? ", com custo e PVPR atualizados" : ""};</li>
          <li>{opts.create_new ? `${newProducts} produtos novos criados em ${opts.new_status === "active" ? "ativo (visíveis na loja)" : "rascunho"}` : "nenhum produto novo"};</li>
          <li>preços recalculados {price.mode === "keep" ? "com as regras atuais" : price.mode === "rrp" ? "pelo PVPR do fornecedor" : `com margem de ${price.margin}%`} (exceto preços fixos);</li>
          <li>{counts.skip} artigos ignorados.</li>
        </ul>
        {counts.issues > 0 && <Alert tone="warn">Há {counts.issues} artigos com avisos. Os “ligado pelo nome” devem ser confirmados.</Alert>}
        <div className="a-formfoot"><button className="a-btn" onClick={() => setConfirmOpen(false)}>Voltar</button><button className="a-btn primary" disabled={busy} onClick={apply}>{busy ? "A aplicar…" : "Aplicar"}</button></div>
      </Modal>
    </>
  );
}

function LinkPicker({ products, current, onPick }: { products: Row[]; current: string | null; onPick: (id: string | null) => void }) {
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const list = (t ? products.filter((p) => p.title.toLowerCase().includes(t)) : products).slice(0, 40);
  return (
    <>
      <input type="search" autoFocus placeholder="Procurar produto" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Procurar produto" />
      <div style={{ maxHeight: 340, overflow: "auto", marginTop: 10 }}>
        <table className="a-table"><tbody>
          {list.map((p) => (
            <tr key={p.id} className="click" onClick={() => onPick(p.id)}>
              <td>{p.title}{p.id === current && <> <Badge tone="info">atual</Badge></>}</td><td className="a-small a-muted">{p.status}</td>
            </tr>
          ))}
        </tbody></table>
      </div>
      <div className="a-formfoot"><button className="a-btn" onClick={() => onPick(null)}>Não existe: criar produto novo</button></div>
    </>
  );
}
