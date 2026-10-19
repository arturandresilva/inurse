"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type P = { product_id: string; title: string; color: string | null; handle: string; image: string | null; done: boolean };
type Info = { number: number; name: string; store_done: boolean; products: P[] };

function StarInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="star-input" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
          className={n <= value ? "on" : ""} onClick={() => onChange(n)}>★</button>
      ))}
    </div>
  );
}

export default function ReviewForm({ number, token, initial }: { number: number; token: string; initial: number }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState("");
  const [store, setStore] = useState({ rating: initial >= 1 && initial <= 5 ? initial : 0, body: "", suggestion: "" });
  const [prods, setProds] = useState<Record<string, { rating: number; title: string; body: string }>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.rpc("review_order", { p_number: number, p_token: token }).then(({ data, error }) => {
      if (error) setErr(error.message.replace(/^.*?: /, "")); else setInfo(data as Info);
    });
  }, [number, token]);

  if (err) return <p className="problem">{err.replace(/^./, (c) => c.toUpperCase())}. Use o link do email ou a sua <Link href="/conta">área de cliente</Link>.</p>;
  if (!info) return <p className="muted">A carregar…</p>;
  if (done) return <div className="notice" role="status"><h2>Obrigado!</h2><p>Recebemos a sua opinião. As avaliações aparecem na loja depois de uma breve verificação.</p><p style={{ marginTop: 12 }}><Link className="btn" href="/loja">Voltar à loja</Link></p></div>;

  const todo = info.products.filter((p) => !p.done);
  if (info.store_done && !todo.length) return <div className="notice"><p>Já avaliou esta encomenda. Obrigado!</p></div>;
  const setP = (id: string, k: string, v: string | number) => setProds({ ...prods, [id]: { rating: 0, title: "", body: "", ...prods[id], [k]: v } });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("review_submit", { p_number: number, p_token: token, p: {
      store: info!.store_done ? null : store,
      products: Object.entries(prods).map(([product_id, v]) => ({ product_id, ...v })) } });
    setBusy(false);
    if (error) setErr(error.message.replace(/^.*?: /, "")); else setDone(true);
  }

  return (
    <form onSubmit={submit} className="review-form">
      {!info.store_done && (
        <fieldset className="notice">
          <legend>A experiência de compra (encomenda #{info.number})</legend>
          <StarInput value={store.rating} onChange={(n) => setStore({ ...store, rating: n })} label="Classificação da experiência de compra" />
          <div className="field"><label htmlFor="r-store">O que correu bem ou mal? (público)</label><textarea id="r-store" rows={3} value={store.body} onChange={(e) => setStore({ ...store, body: e.target.value })} /></div>
          <div className="field"><label htmlFor="r-sug">Tem alguma sugestão para melhorarmos? (só para nós)</label><textarea id="r-sug" rows={2} value={store.suggestion} onChange={(e) => setStore({ ...store, suggestion: e.target.value })} /></div>
        </fieldset>
      )}
      {todo.map((p) => (
        <fieldset key={p.product_id} className="notice review-product">
          <legend>{p.title}{p.color ? ` · ${p.color}` : ""}</legend>
          <div className="review-product-row">
            {p.image && <img src={p.image} alt="" width={72} height={72} />}
            <StarInput value={prods[p.product_id]?.rating ?? 0} onChange={(n) => setP(p.product_id, "rating", n)} label={`Classificação de ${p.title}`} />
          </div>
          <div className="field"><label htmlFor={`t-${p.product_id}`}>Título (opcional)</label><input id={`t-${p.product_id}`} maxLength={120} value={prods[p.product_id]?.title ?? ""} onChange={(e) => setP(p.product_id, "title", e.target.value)} placeholder="ex.: Confortáveis num turno de 12 horas" /></div>
          <div className="field"><label htmlFor={`b-${p.product_id}`}>A sua opinião (conforto, tamanho, qualidade)</label><textarea id={`b-${p.product_id}`} rows={3} value={prods[p.product_id]?.body ?? ""} onChange={(e) => setP(p.product_id, "body", e.target.value)} /></div>
        </fieldset>
      ))}
      <p className="muted" style={{ fontSize: ".9rem" }}>Mostramos o seu primeiro nome e a inicial do apelido ({info.name ? info.name.split(" ")[0] : "Cliente"}).</p>
      {err && <p role="alert" className="problem">{err}</p>}
      <button className="btn" disabled={busy}>{busy ? "A enviar…" : "Enviar avaliação"}</button>
    </form>
  );
}
