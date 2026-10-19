"use client";
import Link from "next/link";
import { Fragment, useState } from "react";
import { callFunction, run, sb, type Row } from "@/lib/admin/sb";
import { dateTime, euro } from "@/lib/admin/format";
import { Alert, Badge, Card, Empty, Loaded, PageHead, useAction, useLoad } from "@/components/admin/ui";

async function load() {
  const c = sb();
  const since = new Date(Date.now() - 45 * 86400e3).toISOString();
  const [prices, checks] = await Promise.all([
    run(c.from("competitor_prices").select("*").gte("seen_at", since).order("seen_at", { ascending: false }).limit(3000)),
    run(c.from("competitor_checks").select("*").order("checked_at", { ascending: false })),
  ]);
  // última pesquisa de cada modelo: só as ofertas dessa execução
  const byModel = new Map<string, Row>();
  for (const ch of checks as Row[]) byModel.set(ch.model_key, { ...ch, offers: [] as Row[] });
  for (const p of prices as Row[]) {
    const m = byModel.get(p.model_key) ?? { model_key: p.model_key, label: p.label, checked_at: p.seen_at, offers: [] };
    if (!byModel.has(p.model_key)) byModel.set(p.model_key, m);
    const runId = m.run_id ?? p.run_id;
    m.run_id = runId;
    if (p.run_id === runId) m.offers.push(p);
  }
  return [...byModel.values()].map((m): Row => {
    const offers = (m.offers as Row[]).filter((o) => o.in_stock !== false).sort((a, b) => a.price_cents - b.price_cents);
    const our = (m.offers as Row[])[0]?.our_price_cents ?? null;
    return { ...m, offers, our, best: offers[0] ?? null };
  }).sort((a, b) => ((b.best && b.our ? b.our - b.best.price_cents : -1e9) - (a.best && a.our ? a.our - a.best.price_cents : -1e9)));
}

export default function Competition() {
  const s = useLoad(load);
  const [open, setOpen] = useState<string | null>(null);
  const { busy, act } = useAction();
  const search = (model_key?: string) => act(async () => {
    const r = await callFunction<Row>("concorrencia", model_key ? { model_key } : {});
    await s.reload();
    if (r?.skipped) throw new Error(r.reason);
    return r;
  }, "Pesquisa terminada. As sugestões de preço estão em Propostas.");

  return (
    <>
      <PageHead title="Preços da concorrência" sub="Todas as segundas-feiras o agente pesquisa na internet o preço de cada modelo noutras lojas e propõe acompanhar o mais barato, sem descer da tua margem mínima.">
        <button className="a-btn primary" disabled={busy} onClick={() => search()}>{busy ? "A pesquisar… (1–2 min)" : "Pesquisar agora"}</button>
      </PageHead>
      <Alert tone="info">Cada pesquisa custa cerca de 1 cêntimo (mais o texto da IA) e conta para o orçamento mensal dos agentes. Os preços encontrados são indicativos: confirma no link antes de aprovar uma descida. As propostas aparecem em <Link href="/admin/agentes">Propostas</Link>.</Alert>
      <Loaded s={s}>
        {(rows) => !rows.length ? <Empty title="Ainda sem pesquisas">Carrega em “Pesquisar agora” ou espera pela próxima segunda-feira.</Empty> : (
          <Card className="flush">
            <div className="a-table-wrap">
              <table className="a-table">
                <thead><tr><th>Modelo</th><th>O nosso preço</th><th>Mais barato</th><th>Diferença</th><th>Pesquisado</th><th></th></tr></thead>
                <tbody>{rows.map((m) => {
                  const diff = m.best && m.our ? m.our - m.best.price_cents : null;
                  return (
                    <Fragment key={m.model_key}>
                      <tr className="click" onClick={() => setOpen(open === m.model_key ? null : m.model_key)}>
                        <td><strong>{m.label}</strong><br />{m.offers.length ? <button type="button" className="a-link">{open === m.model_key ? "Esconder" : `Ver as ${m.offers.length} oferta(s) e links`}</button> : <span className="a-muted">sem ofertas</span>}</td>
                        <td>{m.our ? euro(m.our) : "—"}</td>
                        <td>{m.best ? <>{euro(m.best.price_cents)}<br /><a href={m.best.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{m.best.shop} ↗</a></> : <span className="a-muted">nada encontrado</span>}</td>
                        <td>{diff == null ? "—" : diff > 0 ? <Badge tone="warn">+{euro(diff)} mais caro</Badge> : <Badge tone="ok">{diff === 0 ? "igual" : `${euro(-diff)} mais barato`}</Badge>}</td>
                        <td>{dateTime(m.checked_at)}</td>
                        <td><button className="a-btn sm" disabled={busy} onClick={(e) => { e.stopPropagation(); search(m.model_key); }}>Pesquisar</button></td>
                      </tr>
                      {open === m.model_key && m.offers.map((o: Row) => (
                        <tr key={o.id} style={{ background: "var(--a-line-2)" }}>
                          <td colSpan={2}>↳ <a href={o.url} target="_blank" rel="noopener noreferrer"><strong>{o.shop} ↗</strong></a> <span className="a-muted">{(() => { try { return new URL(o.url).hostname.replace(/^www\./, ""); } catch { return ""; } })()}</span>{o.note ? <span className="a-muted"> · {o.note}</span> : null}{o.in_stock === false ? <span className="a-muted"> · esgotado</span> : null}</td>
                          <td>{euro(o.price_cents)}</td>
                          <td>{o.shipping_cents != null ? `portes ${euro(o.shipping_cents)}` : ""}</td>
                          <td colSpan={2}>{dateTime(o.seen_at)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}</tbody>
              </table>
            </div>
          </Card>
        )}
      </Loaded>
    </>
  );
}
