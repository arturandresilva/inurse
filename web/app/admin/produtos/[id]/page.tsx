"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { rpc, run, sb, uploadPublic, type Row } from "@/lib/admin/sb";
import { euro, fromCents, marginPct, pct, PRODUCT_STATUS, toCents } from "@/lib/admin/format";
import { slugify } from "@/lib/format";
import { Alert, Card, Field, Loaded, Modal, PageHead, useAction, useLoad } from "@/components/admin/ui";

type V = Row & { _key: string; _new?: boolean; _dirty?: boolean };

async function load(id: string) {
  const c = sb();
  const isNew = id === "novo";
  const [p, suppliers, categories, brands, modelRows] = await Promise.all([
    isNew ? Promise.resolve(null) : run<Row | null>(c.from("products").select("*, variants(*), product_images(*), product_categories(category_id)").eq("id", id).maybeSingle()),
    run(c.from("suppliers").select("id,name").order("name")),
    run(c.from("categories").select("id,name,path").order("path")),
    run(c.from("brands").select("id,name").order("name")),
    run(c.from("products").select("model").not("model", "is", null).limit(2000)),
  ]);
  if (!isNew && !p) throw new Error("Produto não encontrado.");
  const models = [...new Set((modelRows as Row[]).map((r) => String(r.model)))].sort();
  return { p, suppliers, categories, brands, models, isNew };
}

const blank = { title: "", handle: "", model: "", color: "", status: "draft", vat_rate: 23, brand: "", supplier_id: null, supplier_ref: "", weight_g: null, featured: false, excerpt: "", description_html: "", seo_title: "", seo_description: "", tags: [] as string[], length_cm: null, width_cm: null, height_cm: null };

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const s = useLoad(() => load(id), [id]);
  return <Loaded s={s}>{(d) => <Editor key={d.p?.id ?? "novo"} d={d} reload={s.reload} />}</Loaded>;
}

function Editor({ d, reload }: { d: Awaited<ReturnType<typeof load>>; reload: () => Promise<void> }) {
  const router = useRouter();
  const { busy, act } = useAction();
  const [p, setP] = useState<Row>(() => ({ ...blank, ...(d.p ?? {}), description_html: decodeEntities(d.p?.description_html ?? "") }));
  const [cats, setCats] = useState<Set<string>>(() => new Set<string>((d.p?.product_categories ?? []).map((x: Row) => String(x.category_id))));
  const [vars, setVars] = useState<V[]>(() => [...(d.p?.variants ?? [])].sort((a, b) => a.position - b.position).map((v) => ({ ...v, _key: v.id })));
  const [imgs, setImgs] = useState<Row[]>(() => [...(d.p?.product_images ?? [])].sort((a, b) => a.position - b.position));
  const [preview, setPreview] = useState<Row[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const vat = Number(p.vat_rate) || 23;

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = (k: string, v: unknown) => { setP((x) => ({ ...x, [k]: v })); setDirty(true); };
  const setV = (key: string, k: string, v: unknown) => { setVars((xs) => xs.map((x) => (x._key === key ? { ...x, [k]: v, _dirty: true } : x))); setDirty(true); };

  async function save() {
    const title = String(p.title ?? "").trim();
    if (!title) throw new Error("O produto precisa de um nome.");
    const handle = slugify(p.handle || title);
    const sizes = vars.map((v) => String(v.option_value ?? "").trim());
    if (sizes.some((x) => !x)) throw new Error("Há tamanhos sem nome.");
    if (new Set(sizes.map((x) => x.toLowerCase())).size !== sizes.length) throw new Error("Há tamanhos repetidos.");
    const row = {
      title, handle, model: String(p.model ?? "").trim() || null, color: String(p.color ?? "").trim() || null, status: p.status, vat_rate: vat, brand: p.brand || null, supplier_id: p.supplier_id || null, supplier_ref: p.supplier_ref || null,
      weight_g: p.weight_g ? Number(p.weight_g) : null, length_cm: p.length_cm || null, width_cm: p.width_cm || null, height_cm: p.height_cm || null,
      featured: !!p.featured, excerpt: p.excerpt || null, description_html: p.description_html || null,
      seo_title: p.seo_title || null, seo_description: p.seo_description || null,
      tags: typeof p.tags === "string" ? String(p.tags).split(",").map((t) => t.trim()).filter(Boolean) : p.tags ?? [],
      updated_at: new Date().toISOString(),
    };
    const c = sb();
    let pid = d.p?.id as string | undefined;
    if (pid) await run(c.from("products").update(row).eq("id", pid));
    else pid = (await run<Row>(c.from("products").insert(row).select("id").single())).id as string;

    // categorias
    const before = new Set<string>((d.p?.product_categories ?? []).map((x: Row) => String(x.category_id)));
    const add = [...cats].filter((x) => !before.has(x));
    const del = [...before].filter((x) => !cats.has(x));
    if (add.length) await run(c.from("product_categories").insert(add.map((category_id) => ({ product_id: pid, category_id }))));
    if (del.length) await run(c.from("product_categories").delete().eq("product_id", pid).in("category_id", del));

    // tamanhos
    for (const [i, v] of vars.entries()) {
      if (!v._new && !v._dirty && v.position === i) continue;
      const vr = {
        product_id: pid, option_value: String(v.option_value).trim(), sku: v.sku || null, supplier_sku: v.supplier_sku || null, ean: v.ean || null,
        price_cents: v.price_cents ?? 0, compare_at_cents: v.compare_at_cents || null, cost_cents: v.cost_cents ?? null, rrp_cents: v.rrp_cents ?? null,
        price_locked: !!v.price_locked, active: v.active !== false, allow_backorder: !!v.allow_backorder, position: i,
        stock: v.stock === "" || v.stock == null ? null : Number(v.stock),
      };
      if (v._new) await run(c.from("variants").insert(vr));
      else await run(c.from("variants").update(vr).eq("id", v.id));
    }
    // preços manuais ficam no histórico
    for (const v of vars.filter((x) => !x._new && x._dirty)) {
      const old = d.p?.variants.find((o: Row) => o.id === v.id);
      if (old && old.price_cents !== v.price_cents) {
        await run(c.from("price_history").insert({ variant_id: v.id, old_cents: old.price_cents, new_cents: v.price_cents, reason: "manual" }));
      }
    }
    setDirty(false);
    if (!d.p) router.replace(`/admin/produtos/${pid}`);
    else await reload();
  }

  function addSize() {
    const last = vars[vars.length - 1];
    const next = last && /^\d+$/.test(last.option_value) ? String(Number(last.option_value) + 1) : "";
    setVars((xs) => [...xs, { _key: crypto.randomUUID(), _new: true, option_value: next, price_cents: last?.price_cents ?? 0, cost_cents: last?.cost_cents ?? null,
      rrp_cents: last?.rrp_cents ?? null, active: true, stock: null, position: xs.length }]);
    setDirty(true);
  }

  async function upload(files: FileList | null) {
    if (!files?.length || !d.p) return;
    await act(async () => {
      let pos = imgs.length;
      for (const f of Array.from(files)) {
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
        const url = await uploadPublic("produtos", `p/${d.p!.id}/${Date.now()}-${pos}.${ext}`, f);
        const row = await run<Row>(sb().from("product_images").insert({ product_id: d.p!.id, url, position: pos++ }).select("*").single());
        setImgs((xs) => [...xs, row]);
      }
    }, "Imagens adicionadas.");
  }
  async function makeCover(i: number) {
    if (i === 0) return;
    const n = [imgs[i], ...imgs.filter((_, k) => k !== i)];
    setImgs(n);
    await act(async () => { for (const [k, im] of n.entries()) await run(sb().from("product_images").update({ position: k }).eq("id", im.id)); }, "Foto de capa atualizada.");
  }
  async function moveImg(i: number, dir: -1 | 1) {
    const j = i + dir; if (j < 0 || j >= imgs.length) return;
    const n = [...imgs]; [n[i], n[j]] = [n[j], n[i]];
    setImgs(n);
    await act(async () => { for (const [k, im] of n.entries()) await run(sb().from("product_images").update({ position: k }).eq("id", im.id)); });
  }
  async function delImg(im: Row) {
    if (!window.confirm("Remover esta imagem do produto?")) return;
    await act(async () => { await run(sb().from("product_images").delete().eq("id", im.id)); setImgs((xs) => xs.filter((x) => x.id !== im.id)); }, "Imagem removida.");
  }

  const rule = async (apply: boolean) => act(async () => {
    if (!d.p) return;
    if (dirty) throw new Error("Guarda primeiro as alterações.");
    const r = await rpc<Row[]>("apply_pricing", { p_products: [d.p.id], p_dry_run: !apply });
    if (apply) { setPreview(null); await reload(); } else setPreview(r);
  }, apply ? "Preços atualizados pela regra." : undefined);

  const sup = d.suppliers.find((x) => x.id === p.supplier_id);
  return (
    <>
      <PageHead back="/admin/produtos" title={d.p ? p.title || "Produto" : "Novo produto"}
        sub={d.p && <><a href={`/produto/${d.p.handle}`} target="_blank" rel="noreferrer">Ver na loja ↗</a>{sup && <> · {sup.name}{p.supplier_ref ? ` · ref. ${p.supplier_ref}` : ""}</>}</>}>
        {dirty && <span className="a-badge warn">Alterações por guardar</span>}
        <button className="a-btn primary" disabled={busy} onClick={() => act(save, "Produto guardado.")}>Guardar</button>
      </PageHead>

      <div className="a-cols">
        <div>
          <Card title="Informação">
            <div className="a-form">
              <Field label="Nome" wide><input value={p.title} onChange={(e) => set("title", e.target.value)} required /></Field>
              <Field label="Resumo (aparece junto ao preço)" wide><textarea value={p.excerpt ?? ""} onChange={(e) => set("excerpt", e.target.value)} rows={2} style={{ minHeight: 60 }} /></Field>
              <Field label="Descrição (HTML simples: <p>, <ul>, <strong>)" wide><textarea value={p.description_html ?? ""} onChange={(e) => set("description_html", e.target.value)} rows={8} /></Field>
            </div>
          </Card>

          <Card title="Tamanhos e preços" actions={<>
            {d.p && <button className="a-btn sm" disabled={busy} onClick={() => rule(false)}>Simular preço pela regra</button>}
            <button className="a-btn sm" onClick={addSize}>+ Tamanho</button>
          </>} className="flush">
            <div className="a-table-wrap">
              <table className="a-table">
                <thead><tr>
                  <th>Tamanho</th><th className="num" title="Custo de compra sem IVA">Custo s/IVA</th><th className="num" title="Preço de venda recomendado pelo fornecedor">PVPR</th>
                  <th className="num">Preço</th><th className="num" title="Preço riscado">Antes</th><th className="num">Margem</th>
                  <th title="Preço fixado à mão: as regras não mexem">Fixo</th><th title="Vazio = não controlas stock (envio do fornecedor)">Stock</th><th>Ativo</th><th>Ref. fornecedor</th><th>EAN</th>
                </tr></thead>
                <tbody>
                  {vars.map((v) => {
                    const m = marginPct(v.price_cents, v.cost_cents, vat);
                    return (
                      <tr key={v._key} style={v.active === false ? { opacity: 0.55 } : undefined}>
                        <td><input className="small" value={v.option_value ?? ""} onChange={(e) => setV(v._key, "option_value", e.target.value)} aria-label="Tamanho" /></td>
                        <td className="num"><MoneyInput value={v.cost_cents} onChange={(c) => setV(v._key, "cost_cents", c)} label="Custo" /></td>
                        <td className="num"><MoneyInput value={v.rrp_cents} onChange={(c) => setV(v._key, "rrp_cents", c)} label="PVPR" /></td>
                        <td className="num"><MoneyInput value={v.price_cents} onChange={(c) => { setV(v._key, "price_cents", c ?? 0); setV(v._key, "price_locked", true); }} label="Preço" /></td>
                        <td className="num"><MoneyInput value={v.compare_at_cents} onChange={(c) => setV(v._key, "compare_at_cents", c)} label="Preço antes" /></td>
                        <td className="num">{m == null ? "—" : <span className={m < 20 ? "a-badge warn" : ""}>{pct(m)}</span>}</td>
                        <td><input type="checkbox" checked={!!v.price_locked} onChange={(e) => setV(v._key, "price_locked", e.target.checked)} aria-label="Preço fixo" /></td>
                        <td><input className="small" inputMode="numeric" value={v.stock ?? ""} placeholder="—" onChange={(e) => setV(v._key, "stock", e.target.value.replace(/\D/g, ""))} aria-label="Stock" /></td>
                        <td><input type="checkbox" checked={v.active !== false} onChange={(e) => setV(v._key, "active", e.target.checked)} aria-label="Ativo" /></td>
                        <td><input value={v.supplier_sku ?? ""} onChange={(e) => setV(v._key, "supplier_sku", e.target.value)} style={{ width: 120 }} aria-label="Referência do fornecedor" /></td>
                        <td><input value={v.ean ?? ""} onChange={(e) => setV(v._key, "ean", e.target.value)} style={{ width: 130 }} aria-label="EAN" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="a-hint" style={{ padding: "10px 20px 16px" }}>
              Preços com IVA ({vat}%). Mudar o preço à mão marca-o como <strong>fixo</strong> e as regras de margem deixam de o alterar; desmarca “Fixo” para voltar à regra.
              Stock vazio = não controlado (a loja vende sempre, o fornecedor envia). Desativa tamanhos em vez de os apagar, para manter o histórico das encomendas.
            </p>
          </Card>

          {d.p && (
            <Card title="Imagens" actions={<button className="a-btn sm" onClick={() => fileRef.current?.click()} disabled={busy}>Adicionar imagens</button>}>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
              {imgs.length === 0 ? <p className="a-muted">Sem imagens. A foto de capa é a que aparece na loja e nas listas.</p> : (
                <div className="a-imgs">
                  {imgs.map((im, i) => (
                    <div className={`a-img${i === 0 ? " cover" : ""}`} key={im.id}>
                      {i === 0 && <span className="a-cover-tag">Capa</span>}
                      <img src={im.url} alt="" loading="lazy" />
                      <div className="tools">
                        {i > 0 && <button onClick={() => makeCover(i)} title="Usar como foto de capa na loja">Capa</button>}
                        <button onClick={() => moveImg(i, -1)} disabled={i === 0} aria-label="Mover para a esquerda">←</button>
                        <button onClick={() => moveImg(i, 1)} disabled={i === imgs.length - 1} aria-label="Mover para a direita">→</button>
                        <button onClick={() => delImg(im)} aria-label="Remover">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card title="Pesquisa Google (SEO)">
            <div className="a-form">
              <Field label="Título" hint={`${(p.seo_title ?? "").length}/60`} wide><input value={p.seo_title ?? ""} onChange={(e) => set("seo_title", e.target.value)} maxLength={70} /></Field>
              <Field label="Descrição" hint={`${(p.seo_description ?? "").length}/155`} wide><textarea value={p.seo_description ?? ""} onChange={(e) => set("seo_description", e.target.value)} rows={2} style={{ minHeight: 60 }} maxLength={180} /></Field>
              <Field label="Endereço" hint={`/produto/${slugify(p.handle || p.title || "")}`} wide><input value={p.handle ?? ""} onChange={(e) => set("handle", e.target.value)} placeholder="gerado a partir do nome" /></Field>
            </div>
          </Card>
        </div>

        <div>
          <Card title="Estado">
            <div className="a-form" style={{ gridTemplateColumns: "1fr" }}>
              <Field label="Estado na loja">
                <select value={p.status} onChange={(e) => set("status", e.target.value)}>
                  {Object.entries(PRODUCT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              <label className="a-check"><input type="checkbox" checked={!!p.featured} onChange={(e) => set("featured", e.target.checked)} /> Destacar na página inicial</label>
            </div>
          </Card>
          <Card title="Fornecedor e impostos">
            <div className="a-form" style={{ gridTemplateColumns: "1fr" }}>
              <Field label="Fornecedor">
                <select value={p.supplier_id ?? ""} onChange={(e) => set("supplier_id", e.target.value || null)}>
                  <option value="">—</option>
                  {d.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </Field>
              <Field label="Referência do modelo no fornecedor" hint="Liga o produto às linhas das folhas de preços."><input value={p.supplier_ref ?? ""} onChange={(e) => set("supplier_ref", e.target.value)} /></Field>
              <Field label="Marca">
                <input list="brands" value={p.brand ?? ""} onChange={(e) => set("brand", e.target.value)} />
                <datalist id="brands">{d.brands.map((b) => <option key={b.id} value={b.name} />)}</datalist>
              </Field>
              <Field label="Modelo" hint="Os produtos com o mesmo modelo (e marca) aparecem na loja como uma só ficha, com a escolha da cor. Vazio = produto sozinho.">
                <input list="models" value={p.model ?? ""} onChange={(e) => set("model", e.target.value)} placeholder="ex.: CLOG c/ Tira" />
                <datalist id="models">{d.models.map((m) => <option key={m} value={m} />)}</datalist>
              </Field>
              <Field label="Cor" hint="Como aparece na escolha da cor."><input value={p.color ?? ""} onChange={(e) => set("color", e.target.value)} placeholder="ex.: Azul marinho" /></Field>
              <Field label="IVA">
                <select value={String(vat)} onChange={(e) => set("vat_rate", Number(e.target.value))}>
                  <option value="23">23% — calçado e geral</option>
                  <option value="6">6% — meias terapêuticas / dispositivos médicos</option>
                  <option value="13">13%</option>
                </select>
              </Field>
            </div>
          </Card>
          <Card title="Peso e volume (portes)">
            <div className="a-grid-2">
              <Field label="Peso (g)"><input inputMode="numeric" value={p.weight_g ?? ""} onChange={(e) => set("weight_g", e.target.value.replace(/\D/g, ""))} placeholder="900" /></Field>
              <Field label="Comprimento (cm)"><input inputMode="decimal" value={p.length_cm ?? ""} onChange={(e) => set("length_cm", e.target.value)} /></Field>
              <Field label="Largura (cm)"><input inputMode="decimal" value={p.width_cm ?? ""} onChange={(e) => set("width_cm", e.target.value)} /></Field>
              <Field label="Altura (cm)"><input inputMode="decimal" value={p.height_cm ?? ""} onChange={(e) => set("height_cm", e.target.value)} /></Field>
            </div>
            <p className="a-hint" style={{ marginTop: 8 }}>Sem peso, os portes usam o peso por defeito das configurações de envio.</p>
          </Card>
          <Card title="Onde aparece na loja">
            {(() => {
              const toggle = (id: string, on: boolean) => { setCats((x) => { const n = new Set(x); if (on) n.add(id); else n.delete(id); return n; }); setDirty(true); };
              const nice = (n: string) => (n === n.toUpperCase() ? n.charAt(0) + n.slice(1).toLowerCase() : n);
              const menu = [...d.categories.filter((c) => c.path.startsWith("CALÇADO>") && c.path.split(">").length === 2 && !c.path.includes("COMPRAR POR")),
                ...d.categories.filter((c) => !c.path.includes(">") && c.path !== "CALÇADO")];
              const profs = d.categories.filter((c) => c.path.startsWith("CALÇADO>COMPRAR POR PROFISSÃO>"));
              const shown = new Set([...menu, ...profs].map((c) => c.id));
              const rest = d.categories.filter((c) => !shown.has(c.id));
              const Chip = ({ c }: { c: Row }) => (
                <label className={`a-chip${cats.has(c.id) ? " on" : ""}`}>
                  <input type="checkbox" checked={cats.has(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} />{nice(c.name)}
                </label>
              );
              return (
                <>
                  <p className="a-hint" style={{ marginBottom: 8 }}>Menu da loja (escolhe pelo menos um):</p>
                  <div className="a-chips">{menu.map((c) => <Chip key={c.id} c={c} />)}</div>
                  {profs.length > 0 && <>
                    <p className="a-hint" style={{ margin: "14px 0 8px" }}>Profissões:</p>
                    <div className="a-chips">{profs.map((c) => <Chip key={c.id} c={c} />)}</div>
                  </>}
                  {!menu.some((c) => cats.has(c.id)) && <p className="a-hint" style={{ color: "var(--a-warn)", marginTop: 10 }}>Sem categoria do menu, o produto só aparece na pesquisa e em “Todos os modelos”.</p>}
                  {rest.length > 0 && (
                    <details style={{ marginTop: 14 }}>
                      <summary className="a-hint" style={{ cursor: "pointer" }}>Outras categorias ({rest.filter((c) => cats.has(c.id)).length} escolhidas)</summary>
                      <div style={{ display: "grid", gap: 4, maxHeight: 260, overflow: "auto", marginTop: 8 }}>
                        {rest.map((c) => (
                          <label key={c.id} className="a-check" style={{ paddingLeft: (c.path.split(">").length - 1) * 14 }}>
                            <input type="checkbox" checked={cats.has(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} />{nice(c.name)}
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              );
            })()}
          </Card>
          <Card title="Etiquetas">
            <Field label="Separadas por vírgulas" hint="Usadas na pesquisa da loja."><input value={Array.isArray(p.tags) ? p.tags.join(", ") : p.tags ?? ""} onChange={(e) => set("tags", e.target.value)} /></Field>
          </Card>
        </div>
      </div>

      <Modal title="Preço pela regra de margem" open={preview !== null} onClose={() => setPreview(null)} wide>
        {preview && (preview.length === 0 ? (
          <Alert tone="ok">Os preços já estão de acordo com a regra (ou estão fixados à mão). <Link href="/admin/precos">Ver regras</Link></Alert>
        ) : (
          <>
            <table className="a-table">
              <thead><tr><th>Tamanho</th><th className="num">Custo</th><th className="num">Atual</th><th className="num">Novo</th><th>Regra</th></tr></thead>
              <tbody>{preview.map((r) => <tr key={r.variant_id}><td>{r.option_value}</td><td className="num">{euro(r.cost_cents)}</td><td className="num">{euro(r.old_cents)}</td><td className="num"><strong>{euro(r.new_cents)}</strong></td><td>{r.rule_name ?? "—"}</td></tr>)}</tbody>
            </table>
            <div className="a-formfoot"><button className="a-btn primary" disabled={busy} onClick={() => rule(true)}>Aplicar estes preços</button></div>
          </>
        ))}
      </Modal>
    </>
  );
}

function MoneyInput({ value, onChange, label }: { value: number | null | undefined; onChange: (c: number | null) => void; label: string }) {
  const [txt, setTxt] = useState(fromCents(value));
  useEffect(() => { setTxt((t) => (toCents(t) === (value ?? null) ? t : fromCents(value))); }, [value]);
  return <input className="money" inputMode="decimal" value={txt} aria-label={label} onChange={(e) => setTxt(e.target.value)} onBlur={() => { const c = toCents(txt); if (c !== (value ?? null)) onChange(c); setTxt(fromCents(c)); }} />;
}

/** "p&eacute;" → "pé" (textos vindos da loja antiga), mantendo o HTML igual. */
function decodeEntities(html: string) {
  if (!html || !/&[a-z]+;/i.test(html) || typeof DOMParser === "undefined") return html;
  return new DOMParser().parseFromString(html, "text/html").body.innerHTML;
}
