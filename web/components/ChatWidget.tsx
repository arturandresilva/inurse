"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLocale, useT } from "@/lib/i18n/client";

type Msg = { role: "user" | "assistant" | "staff"; content: string; created_at?: string };
const KEY = "inurse.chat";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; } };
const save = (v: unknown) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* sem storage */ } };

// links relativos da loja (/produto/...) ficam clicáveis
function Text({ s }: { s: string }) {
  const parts = s.split(/(\/(?:produto|p|c|loja|livre-resolucao|conta)[\w\-/?=&.]*|https?:\/\/\S+)/g);
  return <>{parts.map((x, i) => (/^(\/|https?:)/.test(x) ? <a key={i} href={x} target={x.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">{x}</a> : x))}</>;
}

export default function ChatWidget() {
  const t = useT();
  const locale = useLocale();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<{ enabled?: boolean; greeting?: string } | null>(null);
  const [conv, setConv] = useState<{ id: string; token: string } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("settings").select("value").eq("key", "public.chat").maybeSingle().then(({ data }) => setCfg((data?.value as never) ?? { enabled: true }));
    const s = load(); if (s?.id) { setConv({ id: s.id, token: s.token }); setMsgs(s.msgs ?? []); }
  }, []);
  useEffect(() => { if (conv) save({ ...conv, msgs: msgs.slice(-40) }); end.current?.scrollIntoView({ block: "end" }); }, [msgs, conv]);
  // respostas da equipa (backoffice) aparecem aqui
  useEffect(() => {
    if (!open || !conv) return;
    const poll = async () => {
      const last = [...msgs].reverse().find((m) => m.created_at)?.created_at;
      const { data } = await supabase.functions.invoke("assistente", { body: { mode: "poll", conversation_id: conv.id, token: conv.token, after: last } });
      const fresh = ((data?.messages ?? []) as Msg[]).filter((m) => m.role === "staff");
      if (fresh.length) setMsgs((x) => [...x, ...fresh.filter((f) => !x.some((y) => y.created_at === f.created_at))]);
    };
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, [open, conv, msgs]);

  if (!cfg || cfg.enabled === false || path?.startsWith("/checkout")) return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const m = text.trim(); if (!m || busy) return;
    setText(""); setMsgs((x) => [...x, { role: "user", content: m }]); setBusy(true);
    const { data, error } = await supabase.functions.invoke("assistente", { body: { message: m, conversation_id: conv?.id, token: conv?.token, page: path, locale } });
    setBusy(false);
    if (error || !data?.reply) { setMsgs((x) => [...x, { role: "assistant", content: t("Não consegui responder agora. Deixe o seu email e respondemos o quanto antes.") }]); return; }
    setConv({ id: data.conversation_id, token: data.token });
    setMsgs((x) => [...x, { role: "assistant", content: data.reply, created_at: data.at }]);
  }

  return (
    <>
      {!open && (
        <button type="button" className="chat-fab" onClick={() => setOpen(true)} aria-label={t("Abrir conversa com a iNurse")}>
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M4 5h16v10H9l-5 4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
        </button>
      )}
      {open && (
        <section className="chat-panel" aria-label={t("Conversa com a iNurse")}>
          <header>
            <div><strong>{t("Assistente iNurse")}</strong><span>{t("Responde na hora · equipa nos dias úteis")}</span></div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("Fechar")}>×</button>
          </header>
          <div className="chat-body" aria-live="polite">
            <p className="chat-msg assistant">{t(cfg.greeting || "Olá! Sou o assistente da iNurse. Posso ajudar a escolher modelo e tamanho, ou ver o estado da sua encomenda.")}</p>
            {msgs.map((m, i) => (
              <p key={i} className={`chat-msg ${m.role}`}>{m.role === "staff" && <b>{t("Equipa iNurse")}: </b>}<Text s={m.content} /></p>
            ))}
            {busy && <p className="chat-msg assistant typing">…</p>}
            <div ref={end} />
          </div>
          <form onSubmit={send}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("Escreva a sua pergunta…")} maxLength={800} aria-label={t("Mensagem")} />
            <button className="btn" disabled={busy || !text.trim()}>{t("Enviar")}</button>
          </form>
          <footer>
            <span>{t("As conversas ficam guardadas para o podermos ajudar.")} <Link href="/p/privacidade">{t("Privacidade")}</Link></span>
          </footer>
        </section>
      )}
    </>
  );
}
