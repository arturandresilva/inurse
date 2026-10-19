"use client";
import Link from "next/link";
import { useState } from "react";
import { rpc, run, sb, type Row } from "@/lib/admin/sb";
import { dateTime } from "@/lib/admin/format";
import { Badge, Card, Empty, Loaded, PageHead, Tabs, useAction, useLoad } from "@/components/admin/ui";

const STATUS: Record<string, [string, "warn" | "ok" | "muted"]> = { pending: ["Por aprovar", "warn"], published: ["Publicada", "ok"], hidden: ["Escondida", "muted"] };
const stars = (n: number) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);

async function load() {
  const rows = await run(sb().from("reviews").select("*, orders(number), products(handle,title)").order("created_at", { ascending: false }).limit(300));
  return rows as Row[];
}

// Avaliações dos clientes: aprovar antes de aparecerem na loja, responder, e ler as sugestões (que nunca são publicadas)
export default function Reviews() {
  const s = useLoad(load);
  const [tab, setTab] = useState("pending");
  const [reply, setReply] = useState<Record<string, string>>({});
  const { busy, act } = useAction();
  const moderate = (r: Row, status: string, msg: string) =>
    act(async () => { await rpc("review_moderate", { p_id: r.id, p_status: status, p_reply: reply[r.id] ?? null }); await s.reload(); }, msg);

  return (
    <>
      <PageHead title="Avaliações" sub="Só quem comprou pode avaliar. Nada aparece na loja sem a tua aprovação; as sugestões ficam só para ti." />
      <Loaded s={s}>
        {(rows) => {
          const avg = (k: string) => { const r = rows.filter((x) => x.kind === k && x.status === "published"); return r.length ? (r.reduce((a, x) => a + x.rating, 0) / r.length).toFixed(1) : "—"; };
          const list = rows.filter((r) => (tab === "sugestoes" ? !!r.suggestion : r.status === tab));
          return (
            <>
              <div className="a-stats" style={{ marginBottom: 16 }}>
                <div className="a-stat"><span className="a-stat-l">Experiência de compra</span><span className="a-stat-v">{avg("loja")} ★</span></div>
                <div className="a-stat"><span className="a-stat-l">Produtos</span><span className="a-stat-v">{avg("produto")} ★</span></div>
                <div className="a-stat"><span className="a-stat-l">Por aprovar</span><span className="a-stat-v">{rows.filter((r) => r.status === "pending").length}</span></div>
              </div>
              <Tabs tabs={[["pending", "Por aprovar"], ["published", "Publicadas"], ["hidden", "Escondidas"], ["sugestoes", "Sugestões"]]} value={tab} onChange={setTab} />
              {!list.length ? <Empty title={tab === "pending" ? "Não há avaliações à espera" : "Nada aqui"}>As avaliações chegam pelo email enviado depois da entrega e pela área de cliente.</Empty> : list.map((r) => (
                <Card key={r.id}>
                  <p style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ color: "#e2a400", letterSpacing: 2 }}>{stars(r.rating)}</strong>
                    <Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge>
                    <span>{r.kind === "loja" ? "Experiência de compra" : <>Produto: {r.products ? <Link href={`/admin/produtos/${r.product_id}`}>{r.model ?? r.products.title}</Link> : r.model}</>}</span>
                    <span className="a-muted">· {r.author} · encomenda {r.orders ? <Link href={`/admin/encomendas/${r.orders.number}`}>#{r.orders.number}</Link> : "—"} · {dateTime(r.created_at)}</span>
                  </p>
                  {r.title && <p style={{ marginTop: 8 }}><strong>{r.title}</strong></p>}
                  {r.body ? <p style={{ marginTop: 6 }}>{r.body}</p> : <p className="a-muted" style={{ marginTop: 6 }}>Só estrelas, sem comentário.</p>}
                  {r.suggestion && <div className="a-alert info" style={{ marginTop: 10 }}><strong>Sugestão (privada):</strong> {r.suggestion}</div>}
                  {r.reply && <p className="a-hint" style={{ marginTop: 8 }}>A tua resposta: {r.reply}</p>}
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <input aria-label="Resposta pública" placeholder="Resposta pública (opcional)" value={reply[r.id] ?? ""} onChange={(e) => setReply({ ...reply, [r.id]: e.target.value })} style={{ flex: "1 1 260px" }} />
                    {r.status !== "published" && <button className="a-btn primary sm" disabled={busy} onClick={() => moderate(r, "published", "Publicada na loja.")}>Publicar</button>}
                    {r.status === "published" && reply[r.id] && <button className="a-btn sm" disabled={busy} onClick={() => moderate(r, "published", "Resposta publicada.")}>Guardar resposta</button>}
                    {r.status !== "hidden" && <button className="a-btn sm" disabled={busy} onClick={() => moderate(r, "hidden", "Escondida.")}>Esconder</button>}
                  </div>
                </Card>
              ))}
            </>
          );
        }}
      </Loaded>
    </>
  );
}
