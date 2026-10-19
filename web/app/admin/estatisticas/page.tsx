"use client";
import { useEffect, useState } from "react";
import { rpc, run, sb, type Row } from "@/lib/admin/sb";
import { euro, isoDay } from "@/lib/admin/format";
import { Alert, Card, Field, Loaded, PageHead, Stat, Tabs, useAction, useLoad } from "@/components/admin/ui";

// Estatísticas da loja: visitantes, páginas, origens, aparelhos, funil de compra e taxa de conversão (contador próprio, sem cookies)
const DEV: Record<string, string> = { telemovel: "Telemóvel", computador: "Computador", tablet: "Tablet" };
const LANG: Record<string, string> = { pt: "Português", en: "Inglês", es: "Espanhol", fr: "Francês" };
const n = (v: unknown) => Number(v ?? 0).toLocaleString("pt-PT");
const pct = (a: number, b: number) => (b > 0 ? `${((a * 100) / b).toFixed(1).replace(".", ",")}%` : "—");

export default function Stats() {
  const [days, setDays] = useState("30");
  const s = useLoad(async () => {
    const to = new Date(); const from = new Date(Date.now() - (Number(days) - 1) * 86400e3);
    return (await rpc<Row>("analytics_summary", { p_from: isoDay(from), p_to: isoDay(to) })) as Row;
  }, [days]);
  return (
    <>
      <PageHead title="Estatísticas" sub="Visitas à loja, de onde vêm, que páginas veem e quantas acabam em compra. Contagem própria, sem cookies: cada visitante conta uma vez por dia." />
      <Tabs tabs={[["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"], ["365", "12 meses"]]} value={days} onChange={setDays} />
      <Loaded s={s}>
        {(d) => {
          const f: Row = d.funnel ?? {};
          const steps: [string, number][] = [["Visitantes", f.visitors], ["Viram um produto", f.product], ["Abriram o carrinho", f.cart], ["Foram para o checkout", f.checkout], ["Encomendaram", f.orders]];
          const max = Math.max(1, ...(d.daily as Row[]).map((x) => Number(x.visitors)));
          return (
            <>
              <div className="a-stats">
                <Stat label="Visitantes" value={n(d.visitors)} hint={`${n(d.views)} páginas vistas`} />
                <Stat label="Encomendas" value={n(d.orders)} hint={euro(d.revenue_cents)} />
                <Stat label="Taxa de conversão" value={`${String(d.conversion).replace(".", ",")}%`} hint="encomendas ÷ visitantes" tone={Number(d.conversion) >= 1 ? "ok" : undefined} />
                <Stat label="Páginas por visitante" value={d.visitors ? (d.views / d.visitors).toFixed(1).replace(".", ",") : "—"} />
              </div>

              <Card title="Visitantes por dia">
                {!d.visitors ? <p className="a-muted">Ainda sem visitas neste período. A contagem começou com esta versão da loja.</p> : (
                  <div className="a-bars" role="img" aria-label="Visitantes por dia">
                    {(d.daily as Row[]).map((x) => (
                      <div key={x.day} title={`${x.day}: ${x.visitors} visitantes, ${x.orders} encomendas`}>
                        <span style={{ height: `${(Number(x.visitors) / max) * 100}%` }} />
                        {Number(x.orders) > 0 && <b>{x.orders}</b>}
                      </div>
                    ))}
                  </div>
                )}
                <p className="a-hint">Barras: visitantes. Número por cima: encomendas nesse dia.</p>
              </Card>

              <div className="a-cols even">
                <Card title="Funil de compra">
                  <ul className="a-funnel">
                    {steps.map(([l, v], i) => (
                      <li key={l}><span>{l}</span><div><i style={{ width: `${f.visitors ? Math.max(2, (Number(v) / f.visitors) * 100) : 0}%` }} /></div>
                        <strong>{n(v)}</strong><small>{i ? pct(Number(v), Number(steps[i - 1][1])) : ""}</small></li>
                    ))}
                  </ul>
                  <p className="a-hint">A percentagem compara com o passo anterior: mostra onde se perdem mais clientes.</p>
                </Card>
                <Card title="De onde vêm">
                  <Table rows={d.sources} cols={[["source", "Origem", (v) => v === "direto" ? "Direto / favoritos" : String(v)], ["visitors", "Visitantes", n]]} />
                </Card>
              </div>
              <div className="a-cols even">
                <Card title="Páginas mais vistas"><Table rows={d.pages} cols={[["path", "Página", (v) => <a href={String(v)} target="_blank" rel="noopener">{String(v)}</a>], ["visitors", "Visitantes", n], ["views", "Vistas", n]]} /></Card>
                <Card title="Aparelhos, países e línguas">
                  <Table rows={d.devices} cols={[["device", "Aparelho", (v) => DEV[String(v)] ?? String(v)], ["visitors", "Visitantes", n]]} />
                  <Table rows={d.countries} cols={[["country", "País", (v) => String(v)], ["visitors", "Visitantes", n]]} />
                  <Table rows={d.locales} cols={[["locale", "Língua do site", (v) => LANG[String(v)] ?? String(v)], ["visitors", "Visitantes", n]]} />
                </Card>
              </div>
              <Demographics />
              <Mine />
            </>
          );
        }}
      </Loaded>
    </>
  );
}

function Table({ rows, cols }: { rows: Row[]; cols: [string, string, (v: unknown) => React.ReactNode][] }) {
  if (!rows?.length) return <p className="a-muted">Sem dados.</p>;
  return (
    <table className="a-table" style={{ marginBottom: 10 }}>
      <thead><tr>{cols.map(([k, l], i) => <th key={k} className={i ? "num" : ""}>{l}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{cols.map(([k, , fmt], j) => <td key={k} className={j ? "num" : ""}>{fmt(r[k])}</td>)}</tr>)}</tbody>
    </table>
  );
}

// Idade e género: só o Google os estima (Google Analytics 4 + "Google signals"), e apenas para quem aceita cookies de estatística
function Demographics() {
  const s = useLoad(async () => ((await run<Row | null>(sb().from("settings").select("value").eq("key", "public.analytics").maybeSingle()))?.value ?? {}) as Row);
  const { busy, act } = useAction();
  return (
    <Card title="Idade e género dos visitantes">
      <Alert>A loja não sabe a idade nem o género de quem a visita. Esses números só existem no <strong>Google Analytics 4</strong>, que os estima a partir das contas Google, e apenas para quem aceita os cookies de estatística (por lei, os outros não são contados). Com o ID abaixo, o GA4 passa a carregar na loja para quem aceitar; vês idade, género e interesses em GA4 → Relatórios → Utilizador → Atributos do utilizador (é preciso ligar “Google signals” nas definições do GA4).</Alert>
      <Loaded s={s}>
        {(v) => (
          <form style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); const id = String(new FormData(e.currentTarget).get("ga4") ?? "").trim().toUpperCase();
            act(async () => { if (id && !/^G-[A-Z0-9]{4,}$/.test(id)) throw new Error("O ID do GA4 começa por G- (ex.: G-AB12CD34EF)."); await run(sb().from("settings").update({ value: { ...v, ga4_id: id }, updated_at: new Date().toISOString() }).eq("key", "public.analytics")); s.reload(); }, id ? "GA4 ligado. Os dados aparecem no Google Analytics em 24–48 h." : "GA4 desligado."); }}>
            <div className="a-grid-2">
              <Field label="ID de medição do Google Analytics 4" hint="Em analytics.google.com → Administração → Fluxos de dados → o teu site. Vazio = desligado."><input name="ga4" defaultValue={v.ga4_id ?? ""} placeholder="G-XXXXXXXXXX" /></Field>
            </div>
            <div className="a-formfoot">{v.ga4_id && <a className="a-btn" href="https://analytics.google.com/" target="_blank" rel="noopener">Abrir o Google Analytics</a>}<button className="a-btn primary" disabled={busy}>Guardar</button></div>
          </form>
        )}
      </Loaded>
    </Card>
  );
}

// não contar as visitas deste browser (o Artur a testar a loja)
function Mine() {
  const [off, setOff] = useState(false);
  useEffect(() => setOff(document.cookie.includes("inurse.nocount=1")), []);
  const toggle = () => { const v = !off; document.cookie = `inurse.nocount=${v ? 1 : 0}; path=/; max-age=${v ? 60 * 60 * 24 * 365 * 2 : 0}; samesite=lax`; setOff(v); };
  return (
    <Card title="As tuas visitas">
      <p className="a-hint">{off ? "Este browser não conta para as estatísticas." : "As visitas que fazes à loja neste browser contam como as de um cliente."}</p>
      <button className="a-btn" style={{ marginTop: 8 }} onClick={toggle}>{off ? "Voltar a contar este browser" : "Não contar as visitas deste browser"}</button>
    </Card>
  );
}
