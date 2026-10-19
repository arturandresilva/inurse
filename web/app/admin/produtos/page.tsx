"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { rpc, run, sb, type Row } from "@/lib/admin/sb";
import { euro, marginPct, pct, PRODUCT_STATUS, PRODUCT_TONE } from "@/lib/admin/format";
import { Badge, Card, Empty, Loaded, PageHead, useAction, useDebounced, useLoad } from "@/components/admin/ui";

async function load() {
  const c = sb();
  const [products, suppliers] = await Promise.all([
    run(c.from("products").select("id,handle,title,brand,status,featured,vat_rate,supplier_id,supplier_ref,updated_at,product_images(url,position),variants(id,price_cents,cost_cents,rrp_cents,stock,active)").order("title").limit(2000)),
    run(c.from("suppliers").select("id,name").order("name")),
  ]);
  return { products, suppliers };
}

export default function Products() {
  const s = useLoad(load);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("visible");
  const [sup, setSup] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const dq = useDebounced(q, 150);
  const { busy, act } = useAction();

  const rows = useMemo(() => {
    if (!s.data) return [];
    const term = dq.trim().toLowerCase();
    return s.data.products.filter((p) => {
      if (status === "visible" && !["active", "out_of_stock"].includes(p.status)) return false;
      if (status !== "visible" && status !== "all" && p.status !== status) return false;
      if (sup === "none" && p.supplier_id) return false;
      if (sup && sup !== "none" && p.supplier_id !== sup) return false;
      return !term || `${p.title} ${p.brand ?? ""} ${p.supplier_ref ?? ""} ${p.handle}`.toLowerCase().includes(term);
    });
  }, [s.data, dq, status, sup]);

  const toggle = (id: string) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ids = [...sel];

  async function bulk(kind: string, value: string) {
    if (!ids.length || !value) return;
    await act(async () => {
      if (kind === "status") await run(sb().from("products").update({ status: value, updated_at: new Date().toISOString() }).in("id", ids));
      if (kind === "supplier") await run(sb().from("products").update({ supplier_id: value === "none" ? null : value }).in("id", ids));
      if (kind === "pricing") await rpc<Row[]>("apply_pricing", { p_products: ids, p_dry_run: false });
      setSel(new Set());
      await s.reload();
    }, "Produtos atualizados.");
  }

  return (
    <>
      <PageHead title="Produtos" sub="Catálogo da loja. O preço de cada tamanho pode vir da tua margem, do PVPR do fornecedor ou ser fixado à mão.">
        <Link className="a-btn" href="/admin/importar">Importar folha</Link>
        <Link className="a-btn primary" href="/admin/produtos/novo">Novo produto</Link>
      </PageHead>
      <Loaded s={s}>
        {(d) => (
          <>
            <div className="a-toolbar">
              <input type="search" placeholder="Nome, marca ou referência" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pesquisar produtos" />
              <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado">
                <option value="visible">Na loja (ativos e esgotados)</option>
                <option value="active">Ativos</option>
                <option value="out_of_stock">Esgotados</option>
                <option value="draft">Rascunho</option>
                <option value="archived">Arquivados</option>
                <option value="all">Todos</option>
              </select>
              <select value={sup} onChange={(e) => setSup(e.target.value)} aria-label="Fornecedor">
                <option value="">Todos os fornecedores</option>
                <option value="none">Sem fornecedor</option>
                {d.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <span className="a-muted a-small">{rows.length} produtos</span>
            </div>
            {ids.length > 0 && (
              <div className="a-alert info">
                <strong>{ids.length} selecionados</strong>
                <select defaultValue="" disabled={busy} onChange={(e) => { bulk("status", e.target.value); e.target.value = ""; }} aria-label="Mudar estado">
                  <option value="" disabled>Mudar estado…</option>
                  {Object.entries(PRODUCT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <select defaultValue="" disabled={busy} onChange={(e) => { bulk("supplier", e.target.value); e.target.value = ""; }} aria-label="Associar fornecedor">
                  <option value="" disabled>Associar a fornecedor…</option>
                  {d.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  <option value="none">Nenhum</option>
                </select>
                <button className="a-btn sm" disabled={busy} onClick={() => bulk("pricing", "1")}>Recalcular preços pelas regras</button>
                <button className="a-link" onClick={() => setSel(new Set())}>Limpar seleção</button>
              </div>
            )}
            <Card className="flush">
              {rows.length === 0 ? <Empty title="Sem produtos">Muda os filtros ou importa uma folha de fornecedor.</Empty> : (
                <div className="a-table-wrap">
                  <table className="a-table">
                    <thead><tr>
                      <th><input type="checkbox" aria-label="Selecionar todos" checked={rows.length > 0 && rows.every((r) => sel.has(r.id))}
                        onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
                      <th></th><th>Produto</th><th>Fornecedor</th><th>Estado</th><th className="num">Tamanhos</th><th className="num">Preço</th><th className="num">Margem</th>
                    </tr></thead>
                    <tbody>
                      {rows.map((p) => {
                        const vs: Row[] = p.variants.filter((v: Row) => v.active);
                        const prices = vs.map((v) => v.price_cents).filter((x) => x > 0);
                        const min = prices.length ? Math.min(...prices) : null, max = prices.length ? Math.max(...prices) : null;
                        const margins = vs.map((v) => marginPct(v.price_cents, v.cost_cents, Number(p.vat_rate))).filter((m): m is number => m != null);
                        const m = margins.length ? Math.min(...margins) : null;
                        const img = [...p.product_images].sort((a: Row, b: Row) => a.position - b.position)[0]?.url;
                        return (
                          <tr key={p.id} className="click" onClick={() => router.push(`/admin/produtos/${p.id}`)}>
                            <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Selecionar ${p.title}`} /></td>
                            <td>{img ? <img className="a-thumb" src={img} alt="" loading="lazy" /> : <span className="a-thumb none" />}</td>
                            <td><Link href={`/admin/produtos/${p.id}`} onClick={(e) => e.stopPropagation()}>{p.title}</Link>
                              <div className="a-small a-muted">{[p.brand, p.supplier_ref].filter(Boolean).join(" · ")}{p.featured ? " · ★ destaque" : ""}</div></td>
                            <td>{d.suppliers.find((x) => x.id === p.supplier_id)?.name ?? <span className="a-muted">—</span>}</td>
                            <td><Badge tone={PRODUCT_TONE[p.status]}>{PRODUCT_STATUS[p.status]}</Badge></td>
                            <td className="num">{vs.length}</td>
                            <td className="num">{min == null ? "—" : min === max ? euro(min) : `${euro(min)} – ${euro(max)}`}</td>
                            <td className="num">{m == null ? <span className="a-muted" title="Sem custo registado">—</span> : <span className={m < 20 ? "a-badge warn" : ""}>{pct(m)}</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </Loaded>
    </>
  );
}
