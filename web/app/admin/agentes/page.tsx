"use client";
import Link from "next/link";
import { useState } from "react";
import { callFunction, rpc, run, sb, type Row } from "@/lib/admin/sb";
import { ago, dateTime, euro, euroN } from "@/lib/admin/format";
import { md } from "@/lib/admin/markdown";
import { Alert, Badge, Card, Empty, Field, Loaded, Modal, PageHead, Tabs, useAction, useLoad } from "@/components/admin/ui";
import SocialPost from "@/components/admin/SocialPost";

const KIND: Record<string, string> = {
  "promotion.create": "Promoção", "product.content": "Textos de produto", "product.prices": "Preços", "product.featured": "Destaques",
  "pricing_rule.upsert": "Regra de margem", "campaign.create": "Campanha", "page.upsert": "Página", insight: "Análise",
};
const CHANNEL: Record<string, string> = { email: "Email/newsletter", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", pinterest: "Pinterest", google_ads: "Google Ads", blog: "Blog", sms: "SMS" };
const SOCIAL = ["instagram", "facebook", "tiktok", "pinterest"];
const DOW = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function cronText(c: string) {
  const [mi, h, dom, , dow] = (c || "").split(" ");
  if (!h) return c || "—";
  const at = `às ${h}h${mi && mi !== "0" ? mi.padStart(2, "0") : ""}`;
  if (dom && dom !== "*") return `dias ${dom.replace(/,/g, " e ")} de cada mês ${at}`;
  if (dow && dow !== "*") return `${dow.split(",").map((d) => DOW[Number(d) % 7]).join(" e ")} ${at}`;
  return `todos os dias ${at}`;
}

async function load() {
  const c = sb();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [pending, decided, agents, reports, runs, products, policy] = await Promise.all([
    run(c.from("proposals").select("*").eq("status", "pending").order("created_at", { ascending: false })),
    run(c.from("proposals").select("id,agent_key,kind,title,status,decision_note,decided_at,result,created_at").neq("status", "pending").order("decided_at", { ascending: false, nullsFirst: false }).limit(40)),
    run(c.from("agents").select("*").order("position")),
    run(c.from("reports").select("*").order("created_at", { ascending: false }).limit(20)),
    run(c.from("agent_runs").select("id,agent_key,trigger,status,summary,cost_usd,error,started_at").gte("started_at", monthStart).order("started_at", { ascending: false })),
    run(c.from("products").select("id,title,handle,product_images(url,position)").limit(3000)),
    run<Row | null>(c.from("settings").select("value").eq("key", "agents").maybeSingle()),
  ]);
  const campaigns = await run(c.from("campaigns").select("*").order("created_at", { ascending: false }).limit(30));
  const social = await callFunction<Row>("redes", { mode: "status" }).catch(() => null);
  for (const p of products) p.image = [...(p.product_images ?? [])].sort((a: Row, b: Row) => a.position - b.position)[0]?.url ?? null;
  // ofertas da concorrência (com os links) das propostas de preço por decidir
  const runIds = [...new Set(pending.filter((p) => p.agent_key === "concorrencia" && p.run_id).map((p) => p.run_id))];
  const offers = runIds.length ? await run(c.from("competitor_prices").select("run_id,label,shop,url,price_cents,shipping_cents,in_stock").in("run_id", runIds).order("price_cents")) : [];
  return { pending, decided, agents, reports, runs, products, campaigns, offers, social, policy: (policy?.value ?? {}) as Row };
}

export default function Agents() {
  const s = useLoad(load);
  const [tab, setTab] = useState("pending");
  const [decide, setDecide] = useState<{ p: Row; approve: boolean } | null>(null);
  const [editAgent, setEditAgent] = useState<Row | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const { busy, act } = useAction();

  const runAgent = (key: string) => act(async () => {
    setRunning(key);
    try {
      const r = await callFunction<Row>("agentes", { agent: key });
      await s.reload();
      if (r.skipped) throw new Error(r.reason ?? "O agente não correu.");
      return r;
    } finally { setRunning(null); }
  }, "O agente terminou. Vê as propostas novas.");

  return (
    <>
      <PageHead title="Equipa IA" sub="Os agentes analisam a loja e propõem ações concretas. Nada é feito sem a tua aprovação; quando aprovas, a ação é aplicada na hora." />
      <Loaded s={s}>
        {(d) => {
          const name = (k: string) => d.agents.find((a) => a.key === k)?.name ?? k;
          const spent = d.runs.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0);
          const budget = Number(d.policy.monthly_budget_usd ?? 15);
          return (
            <>
              <Tabs tabs={[["pending", `Por decidir (${d.pending.length})`], ["campaigns", `Campanhas (${d.campaigns.filter((c) => c.status === "draft").length})`], ["reports", "Relatórios"], ["team", "Equipa"], ["history", "Histórico"]]} value={tab} onChange={setTab} />
              {tab === "pending" && (d.pending.length === 0 ? (
                <Card><Empty title="Sem propostas por decidir">Os agentes trabalham segundo o horário de cada um. Podes pedir uma análise agora no separador Equipa.</Empty></Card>
              ) : d.pending.map((p) => (
                <article key={p.id} id={p.id} className="a-proposal">
                  <header>
                    <div>
                      <div className="meta"><strong>{name(p.agent_key)}</strong><Badge tone="info">{KIND[p.kind] ?? p.kind}</Badge>
                        <Badge tone={p.priority === "alta" ? "warn" : "muted"}>prioridade {p.priority}</Badge><span>{ago(p.created_at)}</span></div>
                      <h3 style={{ marginTop: 6 }}>{p.title}</h3>
                    </div>
                    <div className="a-actions">
                      <button className="a-btn sm" disabled={busy} onClick={() => setDecide({ p, approve: false })}>Rejeitar</button>
                      {!(p.kind === "campaign.create" && SOCIAL.includes(p.payload?.channel)) && <button className="a-btn sm primary" disabled={busy} onClick={() => setDecide({ p, approve: true })}>{p.kind === "insight" ? "Marcar como lida" : "Aprovar e aplicar"}</button>}
                    </div>
                  </header>
                  <p>{p.summary}</p>
                  {p.rationale && <p className="a-small"><strong>Porquê:</strong> {p.rationale}</p>}
                  {p.expected_impact && <p className="a-small"><strong>Impacto esperado:</strong> {p.expected_impact}</p>}
                  <Offers p={p} all={d.offers} />
                  {p.kind === "campaign.create" && SOCIAL.includes(p.payload?.channel) ? (
                    <SocialPost channel={p.payload.channel} content={p.payload.content ?? {}} products={d.products} handle={d.social?.instagram?.username}
                      actions={({ saveImage, busy: b2, setBusy }) => (
                        <button className="a-btn sm primary" type="button" disabled={busy || b2} onClick={() => act(async () => {
                          setBusy(true);
                          try {
                            const content = await saveImage();
                            await run(sb().from("proposals").update({ payload: { ...p.payload, content } }).eq("id", p.id));
                            const r = await rpc<Row>("decide_proposal", { p_id: p.id, p_approve: true, p_note: null });
                            await s.reload();
                            if (r.status === "failed") throw new Error(`Não foi possível aplicar: ${r.erro}`);
                          } finally { setBusy(false); }
                        }, "Post aprovado. Está no separador Campanhas, pronto a publicar.")}>Aprovar post</button>
                      )} />
                  ) : <PayloadView p={p} products={d.products} />}
                </article>
              )))}

              {tab === "campaigns" && (d.campaigns.length === 0 ? <Card><Empty title="Sem campanhas">As campanhas aprovadas aparecem aqui, prontas a publicar.</Empty></Card> : d.campaigns.map((c) => (
                <Card key={c.id} title={c.title} actions={<>
                  <Badge tone={c.status === "sent" ? "ok" : c.status === "cancelled" ? "muted" : "warn"}>{({ draft: "por publicar", scheduled: "agendada", sent: "publicada", cancelled: "cancelada" } as Record<string, string>)[c.status]}</Badge>
                  {c.status === "draft" && <button className="a-btn sm" disabled={busy} onClick={() => act(async () => { await run(sb().from("campaigns").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", c.id)); await s.reload(); }, "Marcada como publicada.")}>Marcar como publicada</button>}
                  {c.status === "draft" && <button className="a-btn sm ghost" disabled={busy} onClick={() => act(async () => { await run(sb().from("campaigns").update({ status: "cancelled" }).eq("id", c.id)); await s.reload(); })}>Cancelar</button>}
                </>}>
                  {SOCIAL.includes(c.channel) ? (
                    <>
                      <SocialPost key={c.id + String(c.content?.image_url ?? "")} channel={c.channel} content={c.content ?? {}} products={d.products} handle={d.social?.instagram?.username}
                        actions={({ saveImage, busy: b2, setBusy }) => {
                          const save = async () => { const content = await saveImage(); await run(sb().from("campaigns").update({ content }).eq("id", c.id)); return content; };
                          const publish = (net: string) => act(async () => {
                            setBusy(true);
                            try {
                              await save();
                              const r = await callFunction<Row>("redes", { mode: "publish", campaign_id: c.id, networks: [net] });
                              await s.reload();
                              if (r.errors?.[net]) throw new Error(`${CHANNEL[net]}: ${r.errors[net]}`);
                            } finally { setBusy(false); }
                          }, `Publicado no ${CHANNEL[net]}.`);
                          const meta = d.social?.meta ?? {};
                          return <>
                            {c.status !== "cancelled" && <button className="a-btn sm" type="button" disabled={busy || b2} onClick={() => act(async () => { setBusy(true); try { await save(); await s.reload(); } finally { setBusy(false); } }, "Post guardado.")}>Guardar alterações</button>}
                            {c.status !== "cancelled" && meta.instagram && <button className="a-btn sm primary" type="button" disabled={busy || b2 || !!c.published?.instagram} onClick={() => publish("instagram")}>Publicar no Instagram</button>}
                            {c.status !== "cancelled" && meta.pagina && <button className="a-btn sm primary" type="button" disabled={busy || b2 || !!c.published?.facebook} onClick={() => publish("facebook")}>Publicar no Facebook</button>}
                          </>;
                        }} />
                      {Object.keys(c.published ?? {}).length > 0 && <p className="a-small" style={{ marginTop: 8 }}>Publicado: {Object.entries(c.published as Row).map(([k, v]) => <span key={k}>{v?.url ? <a href={v.url} target="_blank" rel="noopener noreferrer">{CHANNEL[k] ?? k} ↗</a> : CHANNEL[k] ?? k}{" "}</span>)}</p>}
                    </>
                  ) : <PayloadView p={{ kind: "campaign.create", payload: { channel: c.channel, content: c.content, segment: c.segment } }} products={d.products} />}
                  {c.content?.body_html && <details style={{ marginTop: 8 }}><summary>HTML do email (copiar)</summary><pre className="a-pre">{c.content.body_html}</pre></details>}
                  <p className="a-hint" style={{ marginTop: 8 }}>{c.channel === "email" ? "O envio automático da newsletter fica disponível quando ligarmos um serviço de email; por agora copia o texto para o teu programa de email." : d.social?.meta?.chave && ["instagram", "facebook"].includes(c.channel) ? "Publica direto daqui, ou descarrega a imagem e copia o texto." : <>Descarrega a imagem, copia o texto e publica na app; depois marca como publicada. {["instagram", "facebook"].includes(c.channel) && <Link href="/admin/redes">Ligar Instagram e Facebook para publicar daqui</Link>}</>}</p>
                </Card>
              )))}

              {tab === "reports" && (d.reports.length === 0 ? <Card><Empty title="Sem relatórios" /></Card> : d.reports.map((r) => (
                <Card key={r.id} title={r.title} actions={<span className="a-muted a-small">{name(r.agent_key)} · {dateTime(r.created_at)}</span>}>
                  <div className="a-md" dangerouslySetInnerHTML={{ __html: md(r.body_md) }} />
                </Card>
              )))}

              {tab === "team" && (
                <>
                  <Alert tone={spent > budget * 0.8 ? "warn" : "info"}>Custo da IA este mês: <strong>{euroN(spent * 0.93)}</strong> de um orçamento de {euroN(budget * 0.93)} (≈ {budget} USD). Ao atingir o orçamento, os agentes param até ao mês seguinte. <Link href="/admin/configuracoes?tab=agentes">Alterar orçamento e regras</Link></Alert>
                  <Card className="flush">
                    <div className="a-table-wrap">
                      <table className="a-table">
                        <thead><tr><th>Agente</th><th>Quando trabalha</th><th>Última vez</th><th>Estado</th><th></th></tr></thead>
                        <tbody>{d.agents.filter((a) => a.key !== "importador").map((a) => (
                          <tr key={a.key}>
                            <td><strong>{a.name}</strong><div className="a-small a-muted">{a.role}</div></td>
                            <td className="a-small">{cronText(a.schedule)}</td>
                            <td className="a-small a-muted">{ago(a.last_run_at)}</td>
                            <td><label className="a-check"><input type="checkbox" checked={a.enabled} disabled={busy} onChange={(e) => act(async () => { await run(sb().from("agents").update({ enabled: e.target.checked }).eq("key", a.key)); await s.reload(); })} /> {a.enabled ? "Ativo" : "Em pausa"}</label></td>
                            <td className="nowrap">
                              <button className="a-btn sm" disabled={busy} onClick={() => runAgent(a.key)}>{running === a.key ? "A trabalhar…" : "Pedir agora"}</button>{" "}
                              <button className="a-btn sm ghost" onClick={() => setEditAgent(a)}>Instruções</button>
                            </td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </Card>
                  <p className="a-hint">“Pedir agora” pode demorar até um minuto. Os agentes usam a API Anthropic com a tua chave (segredo ANTHROPIC_API_KEY no Supabase).</p>
                </>
              )}

              {tab === "history" && (
                <div className="a-cols even">
                  <Card title="Decisões" className="flush">
                    {d.decided.length === 0 ? <Empty title="Ainda sem decisões" /> : (
                      <table className="a-table"><tbody>{d.decided.map((p) => (
                        <tr key={p.id}>
                          <td><strong>{p.title}</strong><div className="a-small a-muted">{name(p.agent_key)} · {KIND[p.kind]}{p.decision_note ? ` · “${p.decision_note}”` : ""}{p.result?.erro ? ` · erro: ${p.result.erro}` : ""}</div></td>
                          <td><Badge tone={p.status === "applied" ? "ok" : p.status === "failed" ? "err" : "muted"}>{({ applied: "aplicada", rejected: "rejeitada", failed: "falhou", expired: "expirou", approved: "aprovada" } as Record<string, string>)[p.status] ?? p.status}</Badge></td>
                          <td className="a-small a-muted nowrap">{ago(p.decided_at)}</td>
                        </tr>
                      ))}</tbody></table>
                    )}
                  </Card>
                  <Card title="Execuções este mês" className="flush">
                    {d.runs.length === 0 ? <Empty title="Sem execuções" /> : (
                      <table className="a-table"><tbody>{d.runs.map((r) => (
                        <tr key={r.id}><td><strong>{name(r.agent_key)}</strong><div className="a-small a-muted">{r.error ?? r.summary}</div></td>
                          <td><Badge tone={r.status === "done" ? "ok" : r.status === "failed" ? "err" : "muted"}>{r.status}</Badge></td>
                          <td className="num a-small">{r.cost_usd != null ? `${Number(r.cost_usd).toFixed(3)} $` : "—"}</td>
                          <td className="a-small a-muted nowrap">{dateTime(r.started_at)}</td></tr>
                      ))}</tbody></table>
                    )}
                  </Card>
                </div>
              )}

              <Modal title={decide ? (decide.approve ? "Aprovar proposta" : "Rejeitar proposta") : ""} open={!!decide} onClose={() => setDecide(null)}>
                {decide && (
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const note = String(new FormData(e.currentTarget).get("note") ?? "").trim() || null;
                    act(async () => {
                      const r = await rpc<Row>("decide_proposal", { p_id: decide.p.id, p_approve: decide.approve, p_note: note });
                      setDecide(null); await s.reload();
                      if (r.status === "failed") throw new Error(`Não foi possível aplicar: ${r.erro}`);
                    }, decide.approve ? "Proposta aprovada e aplicada." : "Proposta rejeitada.");
                  }}>
                    <p style={{ marginBottom: 10 }}><strong>{decide.p.title}</strong></p>
                    {decide.approve && decide.p.kind !== "insight" && <Alert tone="info">Ao aprovar, a ação é aplicada já na loja ({KIND[decide.p.kind]?.toLowerCase()}).</Alert>}
                    <Field label={decide.approve ? "Nota (opcional)" : "Porquê? (ajuda os agentes a acertar da próxima vez)"}>
                      <textarea name="note" rows={3} style={{ minHeight: 70 }} />
                    </Field>
                    <div className="a-formfoot"><button className={`a-btn ${decide.approve ? "primary" : "danger"}`} disabled={busy}>{decide.approve ? "Aprovar" : "Rejeitar"}</button></div>
                  </form>
                )}
              </Modal>

              <Modal title={editAgent ? `Instruções: ${editAgent.name}` : ""} open={!!editAgent} onClose={() => setEditAgent(null)} wide>
                {editAgent && (
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    act(async () => {
                      await run(sb().from("agents").update({ instructions: String(f.get("instructions")), schedule: String(f.get("schedule")).trim(), max_proposals: Number(f.get("max_proposals")) || 5 }).eq("key", editAgent.key));
                      setEditAgent(null); await s.reload();
                    }, "Agente atualizado.");
                  }}>
                    <Field label="Instruções de trabalho"><textarea name="instructions" rows={14} defaultValue={editAgent.instructions} /></Field>
                    <div className="a-grid-2" style={{ marginTop: 12 }}>
                      <Field label="Horário (cron, hora de Lisboa)" hint={cronText(editAgent.schedule)}><input name="schedule" defaultValue={editAgent.schedule} /></Field>
                      <Field label="Máximo de propostas por vez"><input name="max_proposals" type="number" min={1} max={10} defaultValue={editAgent.max_proposals} /></Field>
                    </div>
                    <div className="a-formfoot"><button className="a-btn primary" disabled={busy}>Guardar</button></div>
                  </form>
                )}
              </Modal>
            </>
          );
        }}
      </Loaded>
    </>
  );
}

// onde foi encontrado o preço (para confirmar antes de aprovar)
function Offers({ p, all }: { p: Row; all: Row[] }) {
  const list: Row[] = p.payload?.offers ?? all.filter((o) => o.run_id === p.run_id && String(p.title).startsWith(`${o.label}:`));
  if (!list.length) return null;
  return (
    <div className="a-offers">
      <strong>Onde foi encontrado (abre para confirmar):</strong>
      <ul>
        {list.map((o, i) => {
          let host = ""; try { host = new URL(o.url).hostname.replace(/^www\./, ""); } catch { /* link inválido */ }
          return (
            <li key={i}>
              <a href={o.url} target="_blank" rel="noopener noreferrer">{o.shop ?? o.loja} ↗</a>
              <span className="a-muted"> {host}</span> · <strong>{euro(o.price_cents)}</strong>
              {o.shipping_cents != null ? <span className="a-muted"> + portes {euro(o.shipping_cents)}</span> : null}
              {o.in_stock === false ? <span className="a-muted"> · esgotado</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PayloadView({ p, products }: { p: Row; products: Row[] }) {
  const x: Row = p.payload ?? {};
  const prod = (id: string) => products.find((q) => q.id === id);
  let body: React.ReactNode = null;
  switch (p.kind) {
    case "promotion.create":
      body = <dl className="a-kv"><dt>Código</dt><dd>{x.code ? <code>{x.code}</code> : "—"}</dd>
        <dt>Desconto</dt><dd>{x.kind === "percent" ? `${x.value}%` : x.kind === "fixed" ? euroN(Number(x.value)) : "Portes grátis"}{x.min_order_cents ? ` em compras desde ${euro(x.min_order_cents)}` : ""}</dd>
        <dt>Período</dt><dd>{x.starts_at ? dateTime(x.starts_at) : "já"} → {x.ends_at ? dateTime(x.ends_at) : "sem fim"}</dd>{x.max_uses && <><dt>Usos</dt><dd>máximo {x.max_uses}</dd></>}</dl>;
      break;
    case "product.content": {
      const pr = prod(x.product_id);
      body = <dl className="a-kv"><dt>Produto</dt><dd>{pr ? <Link href={`/admin/produtos/${pr.id}`}>{pr.title}</Link> : x.product_id}</dd>
        {x.title && <><dt>Nome</dt><dd>{x.title}</dd></>}{x.excerpt && <><dt>Resumo</dt><dd>{x.excerpt}</dd></>}
        {x.seo_title && <><dt>Título Google</dt><dd>{x.seo_title}</dd></>}{x.seo_description && <><dt>Descrição Google</dt><dd>{x.seo_description}</dd></>}
        {x.description_html && <><dt>Descrição</dt><dd><div className="a-md" dangerouslySetInnerHTML={{ __html: md(String(x.description_html).replace(/<[^>]+>/g, "\n")) }} /></dd></>}</dl>;
      break;
    }
    case "product.featured":
      body = <p className="a-small">{x.featured === false ? "Tirar dos destaques" : "Destacar na página inicial"}: {(x.product_ids ?? []).map((id: string) => prod(id)?.title ?? id).join(", ")}</p>;
      break;
    case "product.prices":
      body = <p className="a-small">{(x.changes ?? []).length} tamanhos com preço novo (ficam fixados à mão).</p>;
      break;
    case "pricing_rule.upsert":
      body = <p className="a-small">Regra “{x.name}”: {x.method === "margin" ? "margem" : "markup"} de {x.pct}% ({x.scope === "global" ? "toda a loja" : x.scope}). Os preços são recalculados ao aprovar.</p>;
      break;
    case "campaign.create": {
      const c: Row = x.content ?? {};
      body = <dl className="a-kv"><dt>Canal</dt><dd>{CHANNEL[x.channel] ?? x.channel}</dd>
        {x.segment?.type && <><dt>Para</dt><dd>{({ newsletter: "subscritores da newsletter", inactive_180d: "clientes sem comprar há 6 meses", abandoned_carts: "carrinhos abandonados", all_buyers: "todos os clientes" } as Record<string, string>)[x.segment.type] ?? x.segment.type}</dd></>}
        {c.subject && <><dt>Assunto</dt><dd>{c.subject}</dd></>}
        {(c.caption || c.body_html || c.text) && <><dt>Texto</dt><dd><div className="a-md" dangerouslySetInnerHTML={{ __html: md(String(c.caption ?? c.text ?? c.body_html).replace(/<[^>]+>/g, "\n")) }} /></dd></>}
        {c.hashtags && <><dt>Hashtags</dt><dd>{Array.isArray(c.hashtags) ? c.hashtags.join(" ") : c.hashtags}</dd></>}
        {c.image_brief && <><dt>Imagem</dt><dd>{c.image_brief}</dd></>}</dl>;
      break;
    }
    case "page.upsert":
      body = <dl className="a-kv"><dt>Página</dt><dd>/p/{x.slug} — {x.title}</dd></dl>;
      break;
    default: body = null;
  }
  return body ? <details open={p.kind !== "insight"}><summary>Detalhe</summary><div style={{ marginTop: 8 }}>{body}</div></details> : null;
}
