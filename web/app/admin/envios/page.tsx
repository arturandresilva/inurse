"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { rpc, run, sb, type Row } from "@/lib/admin/sb";
import { dateTime, fromCents, toCents } from "@/lib/admin/format";
import { Alert, Badge, Card, Confirm, Empty, Field, Loaded, Modal, PageHead, Tabs, useAction, useLoad } from "@/components/admin/ui";

const ZONES = ["Continente", "Açores", "Madeira"];

async function load() {
  const c = sb();
  const [rates, cfg, pickups, suppliers, shipments] = await Promise.all([
    run(c.from("shipping_rates").select("*").order("zone").order("max_weight_g")),
    run<Row | null>(c.from("settings").select("value").eq("key", "public.shipping").maybeSingle()),
    run(c.from("pickup_addresses").select("*").order("label")),
    run(c.from("suppliers").select("id,name").order("name")),
    run(c.from("shipments").select("id,carrier,service,tracking_code,status,shipped_at,created_at,pickup_address,orders(number,shipping_address)").order("created_at", { ascending: false }).limit(50)),
  ]);
  return { rates, cfg: (cfg?.value ?? {}) as Row, pickups, suppliers, shipments };
}

export default function ShippingPage() {
  return <Suspense><Shipping /></Suspense>;
}

function Shipping() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "portes");
  const s = useLoad(load);
  return (
    <>
      <PageHead title="Portes e recolhas" sub="O que o cliente paga de portes (por peso e zona), quanto te custa a CTT, e de onde a CTT recolhe as encomendas." />
      <Tabs tabs={[["portes", "Tabela de portes"], ["pontos", "Pontos CTT"], ["moradas", "Moradas de recolha e devolução"], ["envios", "Envios recentes"]]} value={tab} onChange={setTab} />
      <Loaded s={s}>
        {(d) => tab === "portes" ? <Rates d={d} reload={s.reload} /> : tab === "pontos" ? <Points /> : tab === "moradas" ? <Pickups d={d} reload={s.reload} /> : <Shipments d={d} />}
      </Loaded>
    </>
  );
}

type D = Awaited<ReturnType<typeof load>>;

function Rates({ d, reload }: { d: D; reload: () => Promise<void> }) {
  const { busy, act } = useAction();
  const toRow = (r: Row) => ({ ...r, _g: `${r.carrier}|${r.service}`, _w: String(r.max_weight_g / 1000).replace(".", ","), _p: fromCents(r.price_cents), _c: fromCents(r.cost_cents) });
  const [rows, setRows] = useState<Row[]>(() => d.rates.map(toRow));
  const [cfg, setCfg] = useState<Row>(d.cfg);
  const zone = (z: string) => (cfg.zones ?? []).find((x: Row) => x.region === z) ?? { region: z, price_cents: 0, free_from_cents: 0 };
  const setZone = (z: string, k: string, v: unknown) => setCfg((c) => ({ ...c, zones: ZONES.map((name) => (name === z ? { ...zone(name), [k]: v } : zone(name))) }));
  const upd = (i: number, k: string, v: unknown) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v, _dirty: true } : x)));
  // campos da opção (transportadora, serviço, nome, tipo, prazo) valem para todos os escalões dessa opção
  const updGroup = (g: string, k: string, v: unknown) => setRows((xs) => xs.map((x) => (x._g === g ? { ...x, [k]: v, _dirty: true } : x)));
  const groups = [...new Set(rows.filter((r) => !r._del).map((r) => r._g as string))];
  const simple: Row = cfg.simple ?? { enabled: false, zones: {} };
  const sz = (z: string): Row => simple.zones?.[z] ?? {};
  const setSimple = (patch: Row) => setCfg((c) => ({ ...c, simple: { ...(c.simple ?? { zones: {} }), ...patch } }));
  const setSz = (z: string, k: string, v: unknown) => setCfg((c) => {
    const cur = c.simple ?? { zones: {} };
    return { ...c, simple: { ...cur, zones: { ...(cur.zones ?? {}), [z]: { ...(cur.zones?.[z] ?? {}), [k]: v } } } };
  });
  const money = (z: string, k: string, label: string) => (
    <input className="money" inputMode="decimal" aria-label={label} defaultValue={fromCents(sz(z)[k])} onBlur={(e) => setSz(z, k, toCents(e.target.value))} />
  );

  async function save(confirm: boolean) {
    for (const r of rows) {
      if (r._del) { if (r.id) await run(sb().from("shipping_rates").delete().eq("id", r.id)); continue; }
      const w = Math.round(Number(String(r._w).replace(",", ".")) * 1000);
      const price = toCents(r._p);
      if (!String(r.carrier ?? "").trim() || !String(r.service ?? "").trim()) throw new Error("Cada opção precisa de transportadora e serviço.");
      if (!w || price == null) throw new Error(`Escalão incompleto em ${r.label || r.carrier} (${r.zone}).`);
      const row = { zone: r.zone, max_weight_g: w, price_cents: price, cost_cents: toCents(r._c), active: r.active !== false,
        carrier: String(r.carrier).trim(), service: String(r.service).trim(), label: r.label || null, delivery: r.delivery ?? "domicilio", eta: r.eta || null };
      if (!r.id) await run(sb().from("shipping_rates").insert(row));
      else if (r._dirty) await run(sb().from("shipping_rates").update(row).eq("id", r.id));
    }
    const value = { ...cfg, rates_confirmed: confirm || !!cfg.rates_confirmed,
      volumetric_divisor: Number(cfg.volumetric_divisor) || 6000, default_item_weight_g: Number(cfg.default_item_weight_g) || 900, packaging_weight_g: Number(cfg.packaging_weight_g) || 0 };
    await run(sb().from("settings").update({ value, updated_at: new Date().toISOString() }).eq("key", "public.shipping"));
    await reload();
  }

  function addOption() {
    const name = window.prompt("Transportadora (ex.: DPD, GLS, CTT Expresso, Nacex)");
    if (!name) return;
    const service = window.prompt("Serviço (ex.: 48h, Pickup, Locker)", "48h") || "48h";
    const g = `${name}|${service}`;
    setRows((xs) => [...xs, { _g: g, carrier: name, service, label: `${name} — entrega em casa`, delivery: "domicilio", eta: "", zone: "Continente", _w: "2", _p: "", _c: "", active: true, _dirty: true }]);
  }

  return (
    <>
      {!d.cfg.rates_confirmed && <Alert tone="warn">Estes escalões são um ponto de partida. Copia os valores do teu contrato com cada transportadora (custo) e decide quanto cobras ao cliente; depois carrega em “Guardar e confirmar”.</Alert>}
      <Card title="Tabela de portes CTT (simples)" actions={<label className="a-check"><input type="checkbox" checked={!!simple.enabled} onChange={(e) => setSimple({ enabled: e.target.checked })} /> Usar esta tabela</label>}>
        <p className="a-hint" style={{ marginBottom: 12 }}>Defines um preço até um peso e outro acima dele, e o mesmo para o volume da encomenda. O cliente paga o mais caro dos dois. “Custa-te” é o que a CTT te cobra (sem IVA), para o Contabilista; vazio = igual ao preço sem IVA.</p>
        <div className="a-table-wrap">
          <table className="a-table">
            <thead><tr><th>Zona</th><th>Peso</th><th className="num">Cliente paga</th><th className="num">Custa-te</th><th>Volume</th><th className="num">Cliente paga</th><th className="num">Custa-te</th><th>Prazo</th></tr></thead>
            <tbody>
              {ZONES.map((z) => {
                const on = sz(z).available !== false;
                return [
                  <tr key={`${z}-a`} style={on ? undefined : { opacity: 0.5 }}>
                    <td rowSpan={2}><strong>{z}</strong><br /><label className="a-check a-small"><input type="checkbox" checked={on} onChange={(e) => setSz(z, "available", e.target.checked)} /> envia para cá</label></td>
                    <td className="nowrap">até <input className="small" inputMode="decimal" aria-label="Limite de peso (kg)" defaultValue={sz(z).weight_limit_g ? String(sz(z).weight_limit_g / 1000).replace(".", ",") : ""} onBlur={(e) => setSz(z, "weight_limit_g", Math.round(Number(e.target.value.replace(",", ".")) * 1000) || null)} /> kg</td>
                    <td className="num">{money(z, "weight_up_cents", "Preço até ao limite de peso")}</td>
                    <td className="num">{money(z, "weight_up_cost_cents", "Custo até ao limite de peso")}</td>
                    <td className="nowrap">até <input className="small" inputMode="decimal" aria-label="Limite de volume (litros)" defaultValue={sz(z).volume_limit_l ?? ""} onBlur={(e) => setSz(z, "volume_limit_l", Number(e.target.value.replace(",", ".")) || null)} /> L</td>
                    <td className="num">{money(z, "volume_up_cents", "Preço até ao limite de volume")}</td>
                    <td className="num">{money(z, "volume_up_cost_cents", "Custo até ao limite de volume")}</td>
                    <td rowSpan={2}><input defaultValue={sz(z).eta ?? ""} placeholder="2 dias úteis" onBlur={(e) => setSz(z, "eta", e.target.value)} aria-label="Prazo" style={{ width: 120 }} /></td>
                  </tr>,
                  <tr key={`${z}-b`} style={on ? undefined : { opacity: 0.5 }}>
                    <td>acima</td>
                    <td className="num">{money(z, "weight_over_cents", "Preço acima do limite de peso")}</td>
                    <td className="num">{money(z, "weight_over_cost_cents", "Custo acima do limite de peso")}</td>
                    <td>acima</td>
                    <td className="num">{money(z, "volume_over_cents", "Preço acima do limite de volume")}</td>
                    <td className="num">{money(z, "volume_over_cost_cents", "Custo acima do limite de volume")}</td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
        <div className="a-form" style={{ marginTop: 12 }}>
          <Field label="Volume de um artigo sem medidas (litros)" hint="Ex.: caixa de socas ≈ 6 L. O volume do produto = comprimento × largura × altura (cm) ÷ 1000. 0 = ignorar o volume nesses artigos.">
            <input inputMode="decimal" defaultValue={simple.default_item_volume_l ?? ""} onBlur={(e) => setSimple({ default_item_volume_l: Number(e.target.value.replace(",", ".")) || 0 })} />
          </Field>
        </div>
        <div className="a-subcard">
          <label className="a-check"><input type="checkbox" checked={!!simple.pickup?.enabled} onChange={(e) => setSimple({ pickup: { ...(simple.pickup ?? {}), enabled: e.target.checked } })} /> <strong>Oferecer levantamento num ponto CTT</strong></label>
          <p className="a-hint">No checkout aparecem duas opções: entrega na morada e levantamento num ponto CTT (loja, agente ou cacifo). O cliente escolhe o ponto pelo código postal (lista em “Pontos CTT”) ou escreve o que prefere.</p>
          {simple.pickup?.enabled && (
            <div className="a-grid-2" style={{ marginTop: 10 }}>
              <Field label="Nome da opção"><input defaultValue={simple.pickup?.label ?? "Ponto CTT"} onBlur={(e) => setSimple({ pickup: { ...simple.pickup, label: e.target.value } })} /></Field>
              <Field label="Desconto face à entrega na morada (€)" hint="0 = mesmo preço."><input inputMode="decimal" defaultValue={fromCents(simple.pickup?.discount_cents ?? 0)} onBlur={(e) => setSimple({ pickup: { ...simple.pickup, discount_cents: toCents(e.target.value) ?? 0 } })} /></Field>
              <Field label="Prazo (opcional)" hint="Vazio = o mesmo da entrega na morada."><input defaultValue={simple.pickup?.eta ?? ""} placeholder="2 dias úteis" onBlur={(e) => setSimple({ pickup: { ...simple.pickup, eta: e.target.value } })} /></Field>
            </div>
          )}
        </div>
      </Card>
      <details style={{ marginBottom: 18 }} open={!simple.enabled}>
        <summary className="a-link" style={{ cursor: "pointer", marginBottom: 12 }}>{simple.enabled ? "Avançado: escalões por transportadora (não usado enquanto a tabela simples estiver ativa)" : "Escalões por transportadora"}</summary>
      <Alert tone="info">No checkout, o cliente vê todas as opções ativas para a zona e o peso da encomenda e escolhe a que prefere (e paga esse envio). Com portes grátis, a mais barata fica a 0 € e as outras custam só a diferença.</Alert>
      {groups.map((g) => {
        const first = rows.find((r) => r._g === g && !r._del)!;
        return (
          <Card key={g} title={first.label || `${first.carrier} ${first.service}`} actions={<>
            <label className="a-check"><input type="checkbox" checked={first.active !== false} onChange={(e) => updGroup(g, "active", e.target.checked)} /> Ativa</label>
            <button className="a-btn sm danger" onClick={() => { if (window.confirm("Remover esta opção de envio e todos os escalões?")) setRows((xs) => xs.map((x) => (x._g === g ? { ...x, _del: true } : x))); }}>Remover opção</button>
          </>}>
            <div className="a-form" style={{ marginBottom: 12 }}>
              <Field label="Transportadora"><input value={first.carrier ?? ""} onChange={(e) => updGroup(g, "carrier", e.target.value)} /></Field>
              <Field label="Serviço"><input value={first.service ?? ""} onChange={(e) => updGroup(g, "service", e.target.value)} /></Field>
              <Field label="Nome para o cliente"><input value={first.label ?? ""} onChange={(e) => updGroup(g, "label", e.target.value)} placeholder="ex.: CTT — entrega em casa" /></Field>
              <Field label="Tipo">
                <select value={first.delivery ?? "domicilio"} onChange={(e) => updGroup(g, "delivery", e.target.value)}>
                  <option value="domicilio">Entrega na morada</option><option value="ponto">Ponto de recolha / cacifo</option>
                </select>
              </Field>
              <Field label="Prazo mostrado"><input value={first.eta ?? ""} onChange={(e) => updGroup(g, "eta", e.target.value)} placeholder="2–3 dias úteis" /></Field>
            </div>
            <table className="a-table">
              <thead><tr><th>Zona</th><th>Até (kg)</th><th className="num">Cliente paga (c/IVA)</th><th className="num">Custa-te (s/IVA)</th><th></th></tr></thead>
              <tbody>
                {rows.map((r, i) => r._g !== g || r._del ? null : (
                  <tr key={r.id ?? `n${i}`}>
                    <td><select value={r.zone} onChange={(e) => upd(i, "zone", e.target.value)} aria-label="Zona">{ZONES.map((z) => <option key={z}>{z}</option>)}</select></td>
                    <td><input className="small" inputMode="decimal" value={r._w} onChange={(e) => upd(i, "_w", e.target.value)} aria-label="Peso máximo" /></td>
                    <td className="num"><input className="money" inputMode="decimal" value={r._p} onChange={(e) => upd(i, "_p", e.target.value)} aria-label="Preço ao cliente" /></td>
                    <td className="num"><input className="money" inputMode="decimal" value={r._c} placeholder="= preço" onChange={(e) => upd(i, "_c", e.target.value)} aria-label="Custo" /></td>
                    <td><button className="a-btn sm ghost" onClick={() => upd(i, "_del", true)} aria-label="Remover escalão">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="a-btn sm" style={{ marginTop: 10 }} onClick={() => setRows((xs) => [...xs, { ...first, id: undefined, _w: "", _p: "", _c: "", _dirty: true }])}>+ Escalão</button>
          </Card>
        );
      })}
      <p style={{ marginBottom: 18 }}><button className="a-btn" onClick={addOption}>+ Nova opção de envio (outra transportadora)</button></p>
      </details>
      <div className="a-cols even">
        <Card title="Portes grátis">
          <div className="a-form" style={{ gridTemplateColumns: "1fr" }}>
            {ZONES.map((z) => (
              <Field key={z} label={`${z}: a partir de (€, 0 = nunca)`}>
                <input inputMode="decimal" value={fromCents(zone(z).free_from_cents)} onChange={(e) => setZone(z, "free_from_cents", toCents(e.target.value) ?? 0)} style={{ maxWidth: 140 }} />
              </Field>
            ))}
          </div>
        </Card>
        <Card title="Peso e volume">
          <div className="a-form" style={{ gridTemplateColumns: "1fr" }}>
            <Field label="Peso por defeito de um artigo sem peso (g)"><input type="number" value={cfg.default_item_weight_g ?? 900} onChange={(e) => setCfg({ ...cfg, default_item_weight_g: e.target.value })} /></Field>
            <Field label="Peso da embalagem por encomenda (g)"><input type="number" value={cfg.packaging_weight_g ?? 100} onChange={(e) => setCfg({ ...cfg, packaging_weight_g: e.target.value })} /></Field>
            <Field label="Divisor volumétrico" hint="CTT: 6000 (C×L×A em cm ÷ 6000 = kg). Conta o maior entre peso real e volumétrico.">
              <input type="number" value={cfg.volumetric_divisor ?? 6000} onChange={(e) => setCfg({ ...cfg, volumetric_divisor: e.target.value })} />
            </Field>
          </div>
        </Card>
      </div>
      <div className="a-formfoot">
        <button className="a-btn" disabled={busy} onClick={() => act(() => save(false), "Portes guardados.")}>Guardar</button>
        {!d.cfg.rates_confirmed && <button className="a-btn primary" disabled={busy} onClick={() => act(() => save(true), "Tabela de portes confirmada.")}>Guardar e confirmar</button>}
      </div>
    </>
  );
}

function Pickups({ d, reload }: { d: D; reload: () => Promise<void> }) {
  const [edit, setEdit] = useState<Row | null>(null);
  const { busy, act } = useAction();
  const ret = d.pickups.find((p) => p.is_return_address && p.active);
  return (
    <>
      {!ret && <Alert tone="warn">Escolhe a morada principal de devoluções: é para lá que voltam as devoluções (devolução fácil CTT).</Alert>}
      <Card className="flush" title="Moradas" actions={<button className="a-btn primary sm" onClick={() => setEdit({ active: true, country_code: "PT" })}>Nova morada</button>}>
        {d.pickups.length === 0 ? <Empty title="Sem moradas">Adiciona o armazém de cada fornecedor (recolha CTT) e a tua morada para devoluções.</Empty> : (
          <div className="a-table-wrap">
            <table className="a-table">
              <thead><tr><th>Morada</th><th>Fornecedor</th><th>Contacto</th><th>Utilização</th><th></th></tr></thead>
              <tbody>
                {d.pickups.map((p) => (
                  <tr key={p.id} style={p.active ? undefined : { opacity: 0.55 }}>
                    <td><strong>{p.label}</strong><div className="a-small a-muted">{p.line1}{p.line2 ? `, ${p.line2}` : ""} · {p.zip} {p.city}</div></td>
                    <td>{d.suppliers.find((x) => x.id === p.supplier_id)?.name ?? "Loja"}</td>
                    <td className="a-small">{p.contact_name}{p.phone ? <><br />{p.phone}</> : null}{p.opening_hours ? <><br />{p.opening_hours}</> : null}</td>
                    <td>
                      {p.is_default_pickup && <Badge tone="info">Recolha por defeito</Badge>}{" "}
                      {p.is_return_address && <Badge tone="ok">Devoluções</Badge>}
                    </td>
                    <td className="nowrap">
                      {!p.is_return_address && p.active && <button className="a-btn sm" disabled={busy} onClick={() => act(async () => { await rpc("set_return_address", { p_id: p.id }); await reload(); }, "Morada de devoluções atualizada.")}>Usar para devoluções</button>}{" "}
                      <button className="a-btn sm" onClick={() => setEdit(p)}>Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="a-hint">Cada fornecedor tem uma morada de recolha por defeito: ao registar o envio de uma encomenda, a recolha é pedida nessa morada. A morada de devoluções é só uma.</p>
      <Modal title={edit?.id ? "Editar morada" : "Nova morada"} open={!!edit} onClose={() => setEdit(null)} wide>
        {edit && (
          <form onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const g = (k: string) => String(f.get(k) ?? "").trim();
            const row = { label: g("label"), supplier_id: g("supplier_id") || null, contact_name: g("contact_name"), phone: g("phone") || null, email: g("email") || null,
              line1: g("line1"), line2: g("line2") || null, zip: g("zip"), city: g("city"), opening_hours: g("opening_hours") || null,
              is_default_pickup: f.get("is_default_pickup") === "on", active: f.get("active") === "on" };
            act(async () => {
              if (!/^\d{4}-\d{3}$/.test(row.zip)) throw new Error("Código postal no formato 0000-000.");
              if (row.is_default_pickup) {
                // só uma recolha por defeito por fornecedor: desmarca a anterior
                let q = sb().from("pickup_addresses").update({ is_default_pickup: false }).eq("is_default_pickup", true);
                q = row.supplier_id ? q.eq("supplier_id", row.supplier_id) : q.is("supplier_id", null);
                if (edit.id) q = q.neq("id", edit.id);
                await run(q);
              }
              if (edit.id) await run(sb().from("pickup_addresses").update(row).eq("id", edit.id));
              else await run(sb().from("pickup_addresses").insert(row));
              setEdit(null); await reload();
            }, "Morada guardada.");
          }}>
            <div className="a-form">
              <Field label="Nome da morada"><input name="label" defaultValue={edit.label ?? ""} placeholder="ex.: Armazém Nursing Care" required /></Field>
              <Field label="Fornecedor">
                <select name="supplier_id" defaultValue={edit.supplier_id ?? ""}>
                  <option value="">Loja (a tua morada)</option>
                  {d.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </Field>
              <Field label="Pessoa de contacto"><input name="contact_name" defaultValue={edit.contact_name ?? ""} required /></Field>
              <Field label="Telefone"><input name="phone" defaultValue={edit.phone ?? ""} /></Field>
              <Field label="Email"><input name="email" type="email" defaultValue={edit.email ?? ""} /></Field>
              <Field label="Horário para recolhas"><input name="opening_hours" defaultValue={edit.opening_hours ?? ""} placeholder="dias úteis 9h–17h" /></Field>
              <Field label="Morada" wide><input name="line1" defaultValue={edit.line1 ?? ""} required /></Field>
              <Field label="Complemento"><input name="line2" defaultValue={edit.line2 ?? ""} /></Field>
              <Field label="Código postal"><input name="zip" defaultValue={edit.zip ?? ""} placeholder="0000-000" pattern="\d{4}-\d{3}" required /></Field>
              <Field label="Localidade"><input name="city" defaultValue={edit.city ?? ""} required /></Field>
            </div>
            <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
              <label className="a-check"><input type="checkbox" name="is_default_pickup" defaultChecked={!!edit.is_default_pickup} /> Recolha por defeito deste fornecedor</label>
              <label className="a-check"><input type="checkbox" name="active" defaultChecked={edit.active !== false} /> Ativa</label>
            </div>
            <div className="a-formfoot">
              {edit.id && !edit.is_return_address && <Confirm className="a-btn danger" text="Apagar esta morada?" onYes={() => act(async () => { await run(sb().from("pickup_addresses").delete().eq("id", edit.id)); setEdit(null); await reload(); }, "Morada apagada.")}>Apagar</Confirm>}
              <button className="a-btn primary" disabled={busy}>Guardar</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

function Shipments({ d }: { d: D }) {
  return (
    <Card className="flush">
      {d.shipments.length === 0 ? <Empty title="Sem envios" /> : (
        <div className="a-table-wrap">
          <table className="a-table">
            <thead><tr><th>Encomenda</th><th>Cliente</th><th>Transportadora</th><th>Seguimento</th><th>Recolha</th><th>Estado</th><th>Data</th></tr></thead>
            <tbody>{d.shipments.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/admin/encomendas/${s.orders?.number}`}>#{s.orders?.number}</Link></td>
                <td>{s.orders?.shipping_address?.name}</td>
                <td>{s.carrier} {s.service}</td>
                <td>{s.tracking_code ?? "—"}</td>
                <td>{s.pickup_address?.label ?? "—"}</td>
                <td>{s.status}</td>
                <td className="nowrap a-muted">{dateTime(s.shipped_at ?? s.created_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// Pontos CTT para levantamento: lista importada de um ficheiro (CSV/Excel guardado como CSV) com os pontos que queres oferecer
function Points() {
  const s = useLoad(async () => {
    const c = sb();
    const [n, rows] = await Promise.all([
      c.from("pickup_points").select("code", { count: "exact", head: true }),
      run(c.from("pickup_points").select("*").order("zip").limit(200)),
    ]);
    return { total: n.count ?? 0, rows: rows as Row[] };
  });
  const { busy, act } = useAction();
  const [q, setQ] = useState("");
  const importFile = (file: File | undefined) => act(async () => {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
    const head = lines[0].toLowerCase().split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
    const col = (names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
    const ic = col(["codigo", "código", "code", "id"]), iname = col(["nome", "name", "designa"]), ik = col(["tipo", "kind", "type"]),
      ia = col(["morada", "address", "rua"]), iz = col(["postal", "zip", "cp"]), icity = col(["localidade", "cidade", "city"]),
      ilat = col(["lat"]), ilng = col(["lng", "lon"]);
    if (iname < 0 || iz < 0) throw new Error("O ficheiro tem de ter pelo menos as colunas “nome” e “código postal”.");
    const kindOf = (v: string) => (/cacifo|locker/i.test(v) ? "cacifo" : /loja|estação|estacao/i.test(v) ? "loja" : "ponto");
    const rows = lines.slice(1).map((l) => l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""))).filter((r) => r[iname] && r[iz]).map((r, i) => ({
      code: (ic >= 0 && r[ic]) || `${r[iz]}-${i}`, name: r[iname], kind: ik >= 0 ? kindOf(r[ik]) : kindOf(r[iname]),
      address: ia >= 0 ? r[ia] : null, zip: r[iz], city: icity >= 0 ? r[icity] : null,
      lat: ilat >= 0 ? Number(r[ilat].replace(",", ".")) || null : null, lng: ilng >= 0 ? Number(r[ilng].replace(",", ".")) || null : null,
      active: true, updated_at: new Date().toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 500) await run(sb().from("pickup_points").upsert(rows.slice(i, i + 500), { onConflict: "code" }));
    await s.reload();
    return rows.length;
  }, "Pontos importados.");
  return (
    <Loaded s={s}>
      {(d) => (
        <Card title={`Pontos CTT (${d.total})`} actions={<label className="a-btn sm primary" style={{ cursor: "pointer" }}>{busy ? "A importar…" : "Importar ficheiro CSV"}<input type="file" accept=".csv,text/csv" hidden onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ""; }} /></label>}>
          <Alert tone="info">Sem lista, o cliente escreve o ponto que prefere no checkout. Com lista, escolhe a partir do código postal. Importa um CSV com as colunas <code>código; nome; tipo; morada; código postal; localidade</code> (a primeira linha com os nomes das colunas). Quando ativares a API dos CTT (CTT_USER_ID e CTT_AUTH_ID), a lista oficial pode passar a vir de lá.</Alert>
          {d.total > 0 && (
            <>
              <input placeholder="Filtrar por nome, código postal ou localidade" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: "10px 0", maxWidth: 360 }} />
              <div className="a-table-wrap"><table className="a-table">
                <thead><tr><th>Código</th><th>Nome</th><th>Tipo</th><th>Morada</th><th>Código postal</th><th>Ativo</th></tr></thead>
                <tbody>{d.rows.filter((r) => !q || `${r.name} ${r.zip} ${r.city}`.toLowerCase().includes(q.toLowerCase())).slice(0, 100).map((r) => (
                  <tr key={r.code}><td><code>{r.code}</code></td><td>{r.name}</td><td>{r.kind}</td><td className="a-small">{r.address}</td><td>{r.zip} {r.city}</td>
                    <td><input type="checkbox" checked={r.active} disabled={busy} onChange={(e) => act(async () => { await run(sb().from("pickup_points").update({ active: e.target.checked }).eq("code", r.code)); await s.reload(); })} /></td></tr>
                ))}</tbody>
              </table></div>
              {d.total > 200 && <p className="a-hint">A mostrar os primeiros 200 de {d.total}.</p>}
            </>
          )}
        </Card>
      )}
    </Loaded>
  );
}
