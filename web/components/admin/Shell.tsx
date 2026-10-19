"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { count, rpc, sb, traduz } from "@/lib/admin/sb";
import { Toasts } from "./ui";

type Item = { href: string; label: string; badge?: "orders" | "proposals" | "returns" };
const NAV: { group: string; items: Item[] }[] = [
  { group: "Vendas", items: [
    { href: "/admin", label: "Painel" },
    { href: "/admin/encomendas", label: "Encomendas", badge: "orders" },
    { href: "/admin/devolucoes", label: "Devoluções", badge: "returns" },
    { href: "/admin/clientes", label: "Clientes" },
    { href: "/admin/promocoes", label: "Promoções" },
  ] },
  { group: "Catálogo", items: [
    { href: "/admin/produtos", label: "Produtos" },
    { href: "/admin/importar", label: "Importar folhas" },
    { href: "/admin/precos", label: "Preços e margens" },
    { href: "/admin/fornecedores", label: "Fornecedores" },
  ] },
  { group: "Envios", items: [
    { href: "/admin/envios", label: "Portes e recolhas" },
  ] },
  { group: "Equipa IA", items: [
    { href: "/admin/agentes", label: "Propostas", badge: "proposals" },
    { href: "/admin/contas", label: "Contabilista" },
  ] },
  { group: "Loja", items: [
    { href: "/admin/paginas", label: "Páginas" },
    { href: "/admin/configuracoes", label: "Configurações" },
  ] },
];

type Badges = { orders: number; proposals: number; returns: number };

export default function Shell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [badges, setBadges] = useState<Badges>({ orders: 0, proposals: 0, returns: 0 });
  const [menu, setMenu] = useState(false);
  const path = usePathname();

  useEffect(() => {
    const c = sb();
    c.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = c.auth.onAuthStateChange((ev, s) => {
      if (ev === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setAdmin(null); return; }
    rpc<boolean>("is_admin").then((v) => setAdmin(!!v)).catch(() => setAdmin(false));
  }, [session]);

  useEffect(() => {
    if (!admin) return;
    let alive = true;
    const load = () => Promise.all([
      count("orders", (q) => q.in("status", ["paid", "processing"])),
      count("proposals", (q) => q.eq("status", "pending")),
      count("returns", (q) => q.in("status", ["requested", "approved", "label_sent", "in_transit", "received"])),
    ]).then(([orders, proposals, returns]) => alive && setBadges({ orders, proposals, returns })).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [admin, path]);

  useEffect(() => { setMenu(false); }, [path]);

  if (session === undefined || (session && admin === null)) return <div className="a-root a-center"><span className="a-spin" /></div>;
  if (!session) return <div className="a-root a-center"><Login /><Toasts /></div>;
  if (recovery) return <div className="a-root a-center"><NewPassword onDone={() => setRecovery(false)} /><Toasts /></div>;
  if (!admin) {
    return (
      <div className="a-root a-center">
        <div className="a-auth">
          <Brand />
          <h1>Sem acesso</h1>
          <p>A conta {session.user.email} não é administradora desta loja.</p>
          <button className="a-btn" onClick={() => sb().auth.signOut()}>Sair</button>
        </div>
      </div>
    );
  }

  const active = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));
  return (
    <div className={`a-root a-app${menu ? " menu-open" : ""}`}>
      <aside className="a-side">
        <Brand />
        <nav aria-label="Backoffice">
          {NAV.map((g) => (
            <div key={g.group} className="a-nav-group">
              <span className="a-nav-title">{g.group}</span>
              {g.items.map((i) => (
                <Link key={i.href} href={i.href} className={active(i.href) ? "on" : ""} aria-current={active(i.href) ? "page" : undefined}>
                  {i.label}
                  {i.badge && badges[i.badge] > 0 && <span className="a-count">{badges[i.badge]}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="a-side-foot">
          <a href="/" target="_blank" rel="noreferrer">Ver loja ↗</a>
          <span title={session.user.email}>{session.user.email}</span>
          <button className="a-link" onClick={() => sb().auth.signOut()}>Sair</button>
        </div>
      </aside>
      <button className="a-menu-btn" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Menu">☰</button>
      <main className="a-main">{children}</main>
      <Toasts />
    </div>
  );
}

function Brand() {
  return <div className="a-brand"><span className="a-logo">i</span>Nurse<small>backoffice</small></div>;
}

function Login() {
  const [mode, setMode] = useState<"in" | "reset">("in");
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    setBusy(true); setMsg(null);
    try {
      if (mode === "reset") {
        const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/admin` });
        if (error) throw error;
        setMsg({ t: "Se o email existir, recebes um link para definir nova palavra-passe." });
      } else {
        const { error } = await sb().auth.signInWithPassword({ email, password: String(f.get("password") ?? "") });
        if (error) throw error;
      }
    } catch (err) { setMsg({ t: traduz((err as Error).message), err: true }); }
    finally { setBusy(false); }
  }
  return (
    <form className="a-auth" onSubmit={submit}>
      <Brand />
      <h1>{mode === "in" ? "Entrar" : "Recuperar palavra-passe"}</h1>
      <label className="a-field"><span className="a-label">Email</span><input name="email" type="email" required autoComplete="username" /></label>
      {mode === "in" && <label className="a-field"><span className="a-label">Palavra-passe</span><input name="password" type="password" required autoComplete="current-password" /></label>}
      <button className="a-btn primary" disabled={busy}>{busy ? "A entrar…" : mode === "in" ? "Entrar" : "Enviar link"}</button>
      <button type="button" className="a-link" onClick={() => { setMode(mode === "in" ? "reset" : "in"); setMsg(null); }}>
        {mode === "in" ? "Esqueci-me da palavra-passe" : "Voltar a entrar"}
      </button>
      {msg && <p className={`a-auth-msg${msg.err ? " err" : ""}`} role="alert">{msg.t}</p>}
    </form>
  );
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    const { error } = await sb().auth.updateUser({ password });
    if (error) setMsg(traduz(error.message)); else onDone();
  }
  return (
    <form className="a-auth" onSubmit={submit}>
      <Brand />
      <h1>Nova palavra-passe</h1>
      <label className="a-field"><span className="a-label">Palavra-passe (mínimo 8 caracteres)</span><input name="password" type="password" minLength={8} required autoComplete="new-password" /></label>
      <button className="a-btn primary">Guardar</button>
      {msg && <p className="a-auth-msg err" role="alert">{msg}</p>}
    </form>
  );
}
