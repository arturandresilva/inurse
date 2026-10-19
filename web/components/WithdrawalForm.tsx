"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useT } from "@/lib/i18n/client";

type Item = { id: string; title: string; option_value: string; quantity: number };
type Info = { number: number; name: string; address: string; created_at: string; days: number; items: Item[] };
type Decl = Record<string, string | number | null>;
const err = (m: string) => m.replace(/^.*?: /, "").replace(/^./, (c) => c.toUpperCase());

// Formulário de livre resolução: 1) encontrar a encomenda (número + email) 2) declarar 3) comprovativo
export default function WithdrawalForm() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [info, setInfo] = useState<Info | null>(null);
  const [sel, setSel] = useState<Record<string, number>>({});
  const [done, setDone] = useState<{ n: number; d: Decl } | null>(null);
  const [state, setState] = useState<{ err?: string; busy?: boolean }>({});

  async function find(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = Number(String(f.get("number") ?? "").replace(/\D/g, ""));
    const em = String(f.get("email") ?? "").trim();
    if (!num || !em) { setState({ err: t("Indique o número da encomenda e o email.") }); return; }
    setState({ busy: true });
    const { data, error } = await supabase.rpc("withdrawal_lookup", { p_number: num, p_email: em });
    if (error) { setState({ err: t(err(error.message)) }); return; }
    const i = data as Info;
    setEmail(em); setInfo(i); setSel(Object.fromEntries(i.items.map((x) => [x.id, x.quantity]))); setState({});
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!info) return;
    const f = new FormData(e.currentTarget);
    const items = Object.entries(sel).filter(([, q]) => q > 0).map(([order_item_id, quantity]) => ({ order_item_id, quantity }));
    if (!items.length) { setState({ err: t("Escolha pelo menos um artigo.") }); return; }
    setState({ busy: true });
    const { data, error } = await supabase.rpc("withdrawal_submit", { p_number: info.number, p_email: email, p: {
      name: f.get("name"), address: f.get("address"), received_on: f.get("received_on"), iban: f.get("iban"), notes: f.get("notes"), items } });
    if (error) { setState({ err: t(err(error.message)) }); return; }
    const r = data as { return_number: number; declaration: Decl };
    setDone({ n: r.return_number, d: r.declaration }); setState({});
  }

  if (done && info) {
    const d = done.d;
    const chosen = info.items.filter((i) => sel[i.id] > 0).map((i) => `${i.title} (${t("tam.")} ${i.option_value}) × ${sel[i.id]}`);
    return (
      <div className="notice withdrawal-receipt" role="status">
        <h3>{t("Recebemos a sua declaração de livre resolução")}</h3>
        <p>{t("Pedido n.º")} <strong>{done.n}</strong> · {t("encomenda n.º")} {d.encomenda} · {t("declarado em")} {String(d.declarado_em)}</p>
        <p>{t("Vamos responder para {e} com a morada para onde deve enviar os artigos.", { e: email })} {t("Guarde este comprovativo.")}</p>
        <hr />
        <p>{t("Pela presente comunico que resolvo o meu contrato de compra e venda relativo aos seguintes bens:")} {chosen.join("; ")}.</p>
        <p>{t("Encomendado em")} {String(d.encomendado_em)}{d.recebido_em ? ` / ${t("recebido em")} ${d.recebido_em}` : ""}.</p>
        <p>{t("Nome")}: {String(d.nome)} · {t("Endereço")}: {String(d.morada)}</p>
        <p><button type="button" className="btn ghost" onClick={() => window.print()}>{t("Imprimir ou guardar em PDF")}</button></p>
      </div>
    );
  }

  if (!info) return (
    <form onSubmit={find} className="notice withdrawal-form">
      <div className="row2">
        <div className="field"><label htmlFor="w-number">{t("Número da encomenda")}</label><input id="w-number" name="number" inputMode="numeric" placeholder={t("ex.: 1001")} required /></div>
        <div className="field"><label htmlFor="w-email">{t("Email da compra")}</label><input id="w-email" name="email" type="email" autoComplete="email" required /></div>
      </div>
      {state.err && <p role="alert" className="problem">{state.err}</p>}
      <button className="btn" disabled={state.busy}>{state.busy ? t("A procurar…") : t("Continuar")}</button>
    </form>
  );

  return (
    <form onSubmit={submit} className="notice withdrawal-form">
      <p>{t("Encomenda n.º")} <strong>{info.number}</strong>, {t("feita em")} {new Date(info.created_at).toLocaleDateString()}.</p>
      <fieldset>
        <legend>{t("Artigos que pretende devolver")}</legend>
        {info.items.map((i) => (
          <label key={i.id} className="check">
            <input type="checkbox" checked={sel[i.id] > 0} onChange={(e) => setSel({ ...sel, [i.id]: e.target.checked ? i.quantity : 0 })} />
            <span style={{ flex: 1 }}>{i.title} ({t("tam.")} {i.option_value})</span>
            {i.quantity > 1 && sel[i.id] > 0 && (
              <select aria-label={t("Quantidade")} value={sel[i.id]} onChange={(e) => setSel({ ...sel, [i.id]: Number(e.target.value) })}>
                {Array.from({ length: i.quantity }, (_, k) => <option key={k} value={k + 1}>{k + 1}</option>)}
              </select>
            )}
          </label>
        ))}
      </fieldset>
      <div className="row2">
        <div className="field"><label htmlFor="w-name">{t("Nome")}</label><input id="w-name" name="name" defaultValue={info.name ?? ""} required /></div>
        <div className="field"><label htmlFor="w-received">{t("Recebido em (se já recebeu)")}</label><input id="w-received" name="received_on" type="date" /></div>
      </div>
      <div className="field"><label htmlFor="w-address">{t("Endereço")}</label><input id="w-address" name="address" defaultValue={info.address ?? ""} /></div>
      <div className="field"><label htmlFor="w-iban">{t("IBAN para o reembolso (se pagou por Multibanco ou transferência)")}</label><input id="w-iban" name="iban" autoComplete="off" /></div>
      <div className="field"><label htmlFor="w-notes">{t("Observações (opcional)")}</label><textarea id="w-notes" name="notes" rows={2} /></div>
      <p className="muted" style={{ fontSize: ".92rem" }}>{t("Ao enviar, declara que resolve o contrato de compra e venda relativo aos artigos assinalados.")}</p>
      {state.err && <p role="alert" className="problem">{state.err}</p>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn" disabled={state.busy}>{state.busy ? t("A enviar…") : t("Enviar declaração de livre resolução")}</button>
        <button type="button" className="btn ghost" onClick={() => { setInfo(null); setState({}); }}>{t("Voltar")}</button>
      </div>
    </form>
  );
}
