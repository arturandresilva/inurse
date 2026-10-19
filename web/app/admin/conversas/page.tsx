"use client";
import { useState } from "react";
import { rpc, run, sb, type Row } from "@/lib/admin/sb";
import { dateTime } from "@/lib/admin/format";
import { Badge, Card, Empty, Loaded, PageHead, Tabs, useAction, useLoad } from "@/components/admin/ui";

const isEmail = (v: unknown) => /^\S+@\S+\.\S+$/.test(String(v ?? ""));
const STATUS: Record<string, [string, "warn" | "ok" | "muted"]> = { needs_human: ["Precisa de resposta", "warn"], open: ["Assistente", "ok"], closed: ["Fechada", "muted"] };

async function load() {
  return (await run(sb().from("chat_conversations").select("*").gt("messages", 0).order("last_at", { ascending: false }).limit(200))) as Row[];
}

// Conversas do assistente do site: ler, responder (a resposta aparece no balão do cliente) e fechar
export default function Conversations() {
  const s = useLoad(load);
  const [tab, setTab] = useState("needs_human");
  const [open, setOpen] = useState<Row | null>(null);
  const [msgs, setMsgs] = useState<Row[]>([]);
  const [reply, setReply] = useState("");
  const [byEmail, setByEmail] = useState(true);
  const { busy, act } = useAction();

  const show = (c: Row) => act(async () => {
    setOpen(c);
    setMsgs(await run(sb().from("chat_messages").select("*").eq("conversation_id", c.id).order("created_at")));
    if (c.unread) await run(sb().from("chat_conversations").update({ unread: false }).eq("id", c.id));
  });
  const send = () => act(async () => {
    const mail = byEmail && isEmail(open!.contact);
    await rpc("chat_reply", { p_conversation: open!.id, p_text: reply, p_email: mail });
    setReply(""); await show({ ...open!, unread: false, status: "open" }); await s.reload();
    return mail;
  }, "Resposta enviada. Aparece no balão do cliente se ainda tiver o site aberto.");
  const close = (c: Row) => act(async () => { await run(sb().from("chat_conversations").update({ status: "closed", unread: false }).eq("id", c.id)); setOpen(null); await s.reload(); }, "Conversa fechada.");

  return (
    <>
      <PageHead title="Conversas" sub="O assistente do site responde sozinho. Quando o cliente pede uma pessoa ou o assistente não sabe, pede o email do cliente, a conversa aparece em “Precisa de resposta” e recebes um aviso por email. Responde aqui: a resposta segue por email para o cliente." />
      <Loaded s={s}>
        {(rows) => {
          const list = rows.filter((r) => (tab === "all" ? true : r.status === tab));
          return (
            <>
              <Tabs tabs={[["needs_human", `Precisa de resposta (${rows.filter((r) => r.status === "needs_human").length})`], ["open", "Assistente"], ["closed", "Fechadas"], ["all", "Todas"]]} value={tab} onChange={(v) => { setTab(v); setOpen(null); }} />
              <div className="a-chat-grid">
                <Card className="flush">
                  {!list.length ? <Empty title="Nada aqui">As conversas aparecem quando alguém escreve no balão do site.</Empty> : (
                    <ul className="a-chat-list">
                      {list.map((c) => (
                        <li key={c.id}>
                          <button type="button" className={open?.id === c.id ? "on" : ""} onClick={() => show(c)}>
                            <span>{c.unread && <b className="a-dot" aria-label="por ler" />}<strong>{c.name || c.contact || "Visitante"}</strong> <Badge tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge></span>
                            <small>{dateTime(c.last_at)} · {c.messages} mensagens · {c.locale.toUpperCase()}{c.summary ? ` · ${c.summary}` : ""}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                {open && (
                  <Card title={open.name || open.contact || "Visitante"} actions={<button className="a-btn sm" disabled={busy} onClick={() => close(open)}>Fechar conversa</button>}>
                    <p className="a-hint">Contacto: {open.contact || "não deixou"} · página: {open.page || "—"} · custo da IA: {Number(open.cost_usd ?? 0).toFixed(3)} USD</p>
                    <div className="a-chat-msgs">
                      {msgs.map((m) => (
                        <p key={m.id} className={`a-chat-msg ${m.role}`}><small>{m.role === "user" ? "Cliente" : m.role === "staff" ? "Tu" : "Assistente"} · {dateTime(m.created_at)}</small>{m.content}</p>
                      ))}
                    </div>
                    {isEmail(open.contact)
                      ? <label className="a-check" style={{ marginTop: 12 }}><input type="checkbox" checked={byEmail} onChange={(e) => setByEmail(e.target.checked)} /> Enviar também por email para {open.contact}</label>
                      : <p className="a-hint" style={{ marginTop: 12 }}>O cliente não deixou email: a resposta só aparece no balão do site{open.contact ? ` (contacto: ${open.contact})` : ""}.</p>}
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Responder ao cliente…" style={{ flex: 1 }} />
                      <button className="a-btn primary" disabled={busy || !reply.trim()} onClick={send}>Enviar</button>
                    </div>
                  </Card>
                )}
              </div>
            </>
          );
        }}
      </Loaded>
    </>
  );
}
