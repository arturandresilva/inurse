"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { account, loadMe, traduzAuth, useSession, type Me } from "@/lib/account";
import { money } from "@/lib/format";
import { INTL } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";

const STATUS: Record<string, string> = { pending_payment: "A aguardar pagamento", paid: "Paga, em preparação", processing: "Em preparação",
  shipped: "Enviada", delivered: "Entregue", cancelled: "Cancelada", refunded: "Reembolsada" };
const dt = (d: string, l = "pt") => new Date(d).toLocaleDateString(INTL[l as keyof typeof INTL] ?? "pt-PT", { day: "2-digit", month: "long", year: "numeric" });
const track = (c: string) => `https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=${encodeURIComponent(c)}`;

export default function AccountPage() {
  return <Suspense><Account /></Suspense>;
}

function Account() {
  const t = useT();
  const { session, recovery, setRecovery } = useSession();
  if (session === undefined) return <div className="wrap prose"><p className="muted">{t("A carregar…")}</p></div>;
  if (recovery && session) return <NewPassword onDone={() => setRecovery(false)} />;
  if (!session) return <AuthForms />;
  return <Dashboard email={session.user.email ?? ""} />;
}

function AuthForms() {
  const t = useT();
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const next = useSearchParams().get("seguir");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim(), password = String(f.get("password") ?? "");
    setBusy(true); setMsg(null);
    try {
      const c = account().auth;
      if (mode === "in") {
        const { error } = await c.signInWithPassword({ email, password });
        if (error) throw error;
        if (next?.startsWith("/")) router.push(next);
      } else if (mode === "up") {
        if (password.length < 8) throw new Error(t("A palavra-passe tem de ter pelo menos 8 caracteres."));
        const { data, error } = await c.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/conta`, data: { name: String(f.get("name") ?? "") } } });
        if (error) throw error;
        if (!data.session) setMsg({ t: t("Conta criada! Enviámos-te um email: abre o link para confirmar e depois entra. As encomendas já feitas com este email aparecem automaticamente.") });
      } else {
        const { error } = await c.resetPasswordForEmail(email, { redirectTo: `${location.origin}/conta` });
        if (error) throw error;
        setMsg({ t: t("Se existir uma conta com este email, recebes um link para definir nova palavra-passe.") });
      }
    } catch (err) { setMsg({ t: t(traduzAuth((err as Error).message)), err: true }); }
    finally { setBusy(false); }
  }
  return (
    <div className="wrap account-auth">
      <div>
        <h1>{mode === "in" ? t("Entrar na tua conta") : mode === "up" ? t("Criar conta") : t("Recuperar palavra-passe")}</h1>
        <p className="muted" style={{ marginTop: 12 }}>{t("Acompanha as encomendas e o envio, consulta faturas, guarda moradas e os teus modelos favoritos.")}</p>
        <ul className="account-perks">
          <li>{t("Histórico de compras e faturas")}</li><li>{t("Seguimento CTT de cada envio")}</li><li>{t("Trocas de tamanho em dois cliques")}</li><li>{t("Favoritos e moradas guardadas")}</li>
        </ul>
      </div>
      <form className="form account-card" onSubmit={submit}>
        {mode === "up" && <div className="field"><label htmlFor="a-name">{t("Nome")}</label><input id="a-name" name="name" autoComplete="name" /></div>}
        <div className="field"><label htmlFor="a-email">{t("Email")}</label><input id="a-email" name="email" type="email" required autoComplete="email" /></div>
        {mode !== "reset" && <div className="field"><label htmlFor="a-pass">{t("Palavra-passe")}</label>
          <input id="a-pass" name="password" type="password" required minLength={mode === "up" ? 8 : undefined} autoComplete={mode === "up" ? "new-password" : "current-password"} /></div>}
        {msg && <p className={msg.err ? "error" : "notice"} role="alert">{msg.t}</p>}
        <button className="btn block" disabled={busy}>{busy ? t("Um momento…") : mode === "in" ? t("Entrar") : mode === "up" ? t("Criar conta") : t("Enviar link")}</button>
        <p className="muted" style={{ fontSize: ".95rem", display: "flex", gap: 16, flexWrap: "wrap" }}>
          {mode !== "in" && <button type="button" className="linkbtn" onClick={() => { setMode("in"); setMsg(null); }}>{t("Já tenho conta")}</button>}
          {mode !== "up" && <button type="button" className="linkbtn" onClick={() => { setMode("up"); setMsg(null); }}>{t("Criar conta nova")}</button>}
          {mode !== "reset" && <button type="button" className="linkbtn" onClick={() => { setMode("reset"); setMsg(null); }}>{t("Esqueci-me da palavra-passe")}</button>}
        </p>
      </form>
    </div>
  );
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="wrap prose">
      <h1>{t("Nova palavra-passe")}</h1>
      <form className="form" style={{ maxWidth: 420 }} onSubmit={async (e) => {
        e.preventDefault();
        const password = String(new FormData(e.currentTarget).get("password") ?? "");
        const { error } = await account().auth.updateUser({ password });
        if (error) setMsg(traduzAuth(error.message)); else onDone();
      }}>
        <div className="field"><label htmlFor="np">{t("Palavra-passe (mínimo 8 caracteres)")}</label><input id="np" name="password" type="password" minLength={8} required autoComplete="new-password" /></div>
        {msg && <p className="error" role="alert">{msg}</p>}
        <button className="btn">{t("Guardar")}</button>
      </form>
    </div>
  );
}

function Dashboard({ email }: { email: string }) {
  const t = useT();
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("separador") ?? "encomendas");
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => loadMe().then((m) => { setMe(m); setErr(null); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { reload(); }, [reload]);
  const name = me?.profile?.name?.split(" ")[0];
  return (
    <div className="wrap account">
      <div className="account-head">
        <div>
          <h1>{name ? t("Olá, {n}", { n: name }) : t("A minha conta")}</h1>
          <p className="muted">{email}</p>
        </div>
        <button className="btn ghost" onClick={() => account().auth.signOut()}>{t("Sair")}</button>
      </div>
      <nav className="account-tabs" role="tablist">
        {[["encomendas", t("Encomendas")], ["favoritos", t("Favoritos")], ["moradas", t("Moradas")], ["dados", t("Os meus dados")]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
      {err && <p className="error" role="alert">{err}</p>}
      {!me && !err && <p className="muted">{t("A carregar…")}</p>}
      {me && tab === "encomendas" && <Orders me={me} />}
      {me && tab === "favoritos" && <Favorites me={me} reload={reload} />}
      {me && tab === "moradas" && <Addresses me={me} reload={reload} />}
      {me && tab === "dados" && <Profile me={me} reload={reload} />}
    </div>
  );
}

function Orders({ me }: { me: Me }) {
  const t = useT();
  const locale = useLocale();
  if (!me.orders.length) return (
    <div className="notice"><p>{t("Ainda não tens encomendas nesta loja.")}{me.profile.legacy_orders ? " " + t("(As {n} compras feitas na loja antiga não aparecem aqui.)", { n: me.profile.legacy_orders }) : ""}</p>
      <p style={{ marginTop: 12 }}><Link className="btn" href="/loja">{t("Ver a loja")}</Link></p></div>
  );
  return (
    <div className="orders">
      {me.orders.map((o) => (
        <article key={o.number} className="order-card">
          <header>
            <div><strong>{t("Encomenda n.º {n}", { n: o.number })}</strong><span className="muted"> · {dt(o.created_at, locale)}</span></div>
            <span className={`order-status s-${o.status}`}>{t(STATUS[o.status] ?? o.status)}</span>
          </header>
          <ul className="order-items">
            {o.items.map((i: Record<string, string | number>, k: number) => (
              <li key={k}>
                {i.image ? <img src={String(i.image)} alt="" loading="lazy" /> : <span className="ph" />}
                <span>{i.handle ? <Link href={`/produto/${i.handle}`}>{i.title}</Link> : i.title}<br /><span className="muted">{t("Tam.")} {i.option_value} · {i.quantity} × {money(Number(i.unit_price_cents))}</span></span>
              </li>
            ))}
          </ul>
          <footer>
            <strong>{money(o.total_cents)}</strong>
            <span className="order-links">
              {o.tracking.map((x: { code: string }) => <a key={x.code} href={track(x.code)} target="_blank" rel="noopener">{t("Seguir envio")} {x.code}</a>)}
              {o.invoices.map((iv: { number: string; pdf_url: string }) => <a key={iv.pdf_url} href={iv.pdf_url} target="_blank" rel="noopener">{t("Fatura")} {iv.number ?? ""}</a>)}
              {!o.invoices.length && ["paid", "processing", "shipped", "delivered"].includes(o.status) && <span className="muted">{t("Fatura enviada por email")}</span>}
              <Link href={`/encomenda/${o.number}?t=${o.token}`}>{t("Ver detalhe")}{["shipped", "delivered"].includes(o.status) ? " / " + t("trocar") : ""}</Link>
              {o.status === "delivered" && <Link href={`/avaliar/${o.number}?t=${o.token}`}>{t("Avaliar")}</Link>}
            </span>
          </footer>
        </article>
      ))}
    </div>
  );
}

function Favorites({ me, reload }: { me: Me; reload: () => void }) {
  const t = useT();
  if (!me.favorites.length) return <div className="notice"><p>{t("Ainda não guardaste favoritos. Na página de cada modelo, carrega em “Guardar nos favoritos”.")}</p></div>;
  return (
    <div className="grid">
      {me.favorites.map((p) => (
        <div key={p.id} className="prod">
          <Link href={`/produto/${p.handle}`} className="ph">{p.image ? <img src={p.image} alt="" loading="lazy" /> : null}</Link>
          <h3><Link href={`/produto/${p.handle}`}>{p.title}</Link></h3>
          <div className="meta"><span className="price">{p.price_cents ? money(p.price_cents) : ""}</span>
            {p.status === "out_of_stock" ? <span className="tag-out">{t("Esgotado")}</span> : null}
            <button className="linkbtn" onClick={async () => { await account().rpc("favorite_toggle", { p_product: p.id }); reload(); }}>{t("Remover")}</button></div>
        </div>
      ))}
    </div>
  );
}

function Addresses({ me, reload }: { me: Me; reload: () => void }) {
  const t = useT();
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="addresses">
      {me.addresses.map((a) => (
        <div key={a.id} className="address-card">
          <p><strong>{a.kind === "billing" ? t("Faturação") : t("Entrega")}{a.is_default ? " · " + t("principal") : ""}</strong></p>
          <p>{a.name}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.zip} {a.city}<br />{a.region}{a.phone ? <><br />{a.phone}</> : null}</p>
          <p style={{ display: "flex", gap: 14 }}><button className="linkbtn" onClick={() => setEdit(a)}>{t("Editar")}</button>
            <button className="linkbtn" onClick={async () => { if (confirm(t("Apagar esta morada?"))) { await account().rpc("customer_address_delete", { p_id: a.id }); reload(); } }}>{t("Apagar")}</button></p>
        </div>
      ))}
      {!edit && <button className="btn ghost" onClick={() => setEdit({ kind: "delivery", region: "Continente", is_default: true })}>{t("Adicionar morada")}</button>}
      {edit && (
        <form className="form account-card" style={{ gridColumn: "1 / -1" }} onSubmit={async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          const { error } = await account().rpc("customer_address_save", { p: { ...f, id: edit.id ?? null, is_default: f.is_default === "on" } });
          if (error) setErr(traduzAuth(error.message)); else { setEdit(null); setErr(null); reload(); }
        }}>
          <div className="row2">
            <div className="field"><label htmlFor="ad-kind">{t("Tipo")}</label><select id="ad-kind" name="kind" defaultValue={String(edit.kind ?? "delivery")}><option value="delivery">{t("Entrega")}</option><option value="billing">{t("Faturação")}</option></select></div>
            <div className="field"><label htmlFor="ad-name">{t("Nome")}</label><input id="ad-name" name="name" defaultValue={String(edit.name ?? "")} required /></div>
          </div>
          <div className="field"><label htmlFor="ad-l1">{t("Morada")}</label><input id="ad-l1" name="line1" defaultValue={String(edit.line1 ?? "")} required /></div>
          <div className="field"><label htmlFor="ad-l2">{t("Andar, porta, serviço (opcional)")}</label><input id="ad-l2" name="line2" defaultValue={String(edit.line2 ?? "")} /></div>
          <div className="row2">
            <div className="field"><label htmlFor="ad-zip">{t("Código postal")}</label><input id="ad-zip" name="zip" placeholder="0000-000" defaultValue={String(edit.zip ?? "")} required /></div>
            <div className="field"><label htmlFor="ad-city">{t("Localidade")}</label><input id="ad-city" name="city" defaultValue={String(edit.city ?? "")} required /></div>
          </div>
          <div className="row2">
            <div className="field"><label htmlFor="ad-reg">{t("Zona")}</label><select id="ad-reg" name="region" defaultValue={String(edit.region ?? "Continente")}><option value="Continente">{t("Continente")}</option><option value="Açores">{t("Açores")}</option><option value="Madeira">{t("Madeira")}</option></select></div>
            <div className="field"><label htmlFor="ad-ph">{t("Telemóvel")}</label><input id="ad-ph" name="phone" type="tel" defaultValue={String(edit.phone ?? "")} /></div>
          </div>
          <label className="check"><input type="checkbox" name="is_default" defaultChecked={edit.is_default !== false} /><span>{t("Usar como morada principal")}</span></label>
          {err && <p className="error" role="alert">{err}</p>}
          <div style={{ display: "flex", gap: 10 }}><button className="btn">{t("Guardar morada")}</button><button type="button" className="btn ghost" onClick={() => setEdit(null)}>{t("Cancelar")}</button></div>
        </form>
      )}
    </div>
  );
}

function Profile({ me, reload }: { me: Me; reload: () => void }) {
  const t = useT();
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const p = me.profile;
  return (
    <div className="account-cols">
      <form className="form account-card" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const { error } = await account().rpc("customer_update", { p: { name: f.get("name"), phone: f.get("phone"), nif: f.get("nif"), company: f.get("company"), newsletter: f.get("newsletter") === "on" } });
        setMsg(error ? { t: traduzAuth(error.message), err: true } : { t: t("Dados guardados.") });
        if (!error) reload();
      }}>
        <h2>{t("Os meus dados")}</h2>
        <div className="field"><label htmlFor="p-name">{t("Nome")}</label><input id="p-name" name="name" defaultValue={p.name ?? ""} autoComplete="name" /></div>
        <div className="row2">
          <div className="field"><label htmlFor="p-phone">{t("Telemóvel")}</label><input id="p-phone" name="phone" type="tel" defaultValue={p.phone ?? ""} /></div>
          <div className="field"><label htmlFor="p-nif">{t("NIF")}</label><input id="p-nif" name="nif" inputMode="numeric" defaultValue={p.nif ?? ""} /></div>
        </div>
        <div className="field"><label htmlFor="p-co">{t("Instituição / empresa (opcional)")}</label><input id="p-co" name="company" defaultValue={p.company ?? ""} /></div>
        <label className="check"><input type="checkbox" name="newsletter" defaultChecked={!!p.newsletter} /><span>{t("Quero receber novidades e promoções por email")}</span></label>
        {msg && <p className={msg.err ? "error" : "notice"} role="status">{msg.t}</p>}
        <button className="btn">{t("Guardar")}</button>
      </form>
      <form className="form account-card" onSubmit={async (e) => {
        e.preventDefault();
        const password = String(new FormData(e.currentTarget).get("password") ?? "");
        const { error } = await account().auth.updateUser({ password });
        alert(error ? traduzAuth(error.message) : t("Palavra-passe alterada."));
        (e.target as HTMLFormElement).reset();
      }}>
        <h2>{t("Palavra-passe")}</h2>
        <div className="field"><label htmlFor="p-pw">{t("Nova palavra-passe (mínimo 8)")}</label><input id="p-pw" name="password" type="password" minLength={8} required autoComplete="new-password" /></div>
        <button className="btn ghost">{t("Alterar palavra-passe")}</button>
        <p className="muted" style={{ fontSize: ".9rem" }}>{t("Para apagar a conta e os teus dados, escreve-nos para o email da loja.")}</p>
      </form>
    </div>
  );
}
