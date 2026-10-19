"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Summary from "@/components/Summary";
import { cartToken, clearCart, readCart, type CartLine } from "@/lib/cart";
import { supabase } from "@/lib/supabase";
import { account } from "@/lib/account";
import { useQuote } from "@/lib/useQuote";

const PAY_LABEL: Record<string, string> = { mbway: "MB WAY", multibanco: "Multibanco (referência)", transfer: "Transferência bancária" };

export default function CheckoutPage() {
  const router = useRouter();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [methods, setMethods] = useState<string[]>([]);
  const [f, setF] = useState({ email: "", name: "", phone: "", nif: "", line1: "", line2: "", zip: "", city: "", region: "Continente",
    payment: "", promo: "", notes: "", terms: false, newsletter: false, ship: "" });
  const [promoApplied, setPromoApplied] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const { quote, loading } = useQuote(lines, f.region, promoApplied, f.ship);

  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    // cliente com conta: preenche os dados guardados
    account().auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      setSignedIn(true);
      const { data: me } = await account().rpc("customer_me");
      if (!me) return;
      const p = me.profile ?? {}; const a = (me.addresses ?? []).find((x: { kind: string }) => x.kind === "delivery") ?? {};
      setF((s) => ({ ...s, email: s.email || p.email || "", name: s.name || a.name || p.name || "", phone: s.phone || a.phone || p.phone || "",
        nif: s.nif || p.nif || "", line1: s.line1 || a.line1 || "", line2: s.line2 || a.line2 || "", zip: s.zip || a.zip || "",
        city: s.city || a.city || "", region: a.region || s.region }));
    });
    setLines(readCart());
    supabase.from("settings").select("value").eq("key", "public.payments").maybeSingle().then(({ data }) => {
      const v = (data?.value ?? {}) as Record<string, unknown>;
      const m = ["mbway", "multibanco", "transfer"].filter((k) => v[k] === true);
      setMethods(m); setF((s) => ({ ...s, payment: s.payment || m[0] || "" }));
    });
  }, []);

  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!f.terms) { setError("Para continuar, aceita os termos e condições."); return; }
    setSending(true);
    const { data, error: err } = await supabase.rpc("place_order", { p: {
      email: f.email, phone: f.phone, nif: f.nif || null, accept_terms: f.terms, newsletter: f.newsletter, payment_method: f.payment,
      promo_code: promoApplied || null, notes: f.notes || null, cart_token: cartToken(), shipping_option: quote?.shipping_option ?? null,
      shipping_address: { name: f.name, phone: f.phone, line1: f.line1, line2: f.line2, zip: f.zip.trim(), city: f.city, region: f.region },
      items: lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty })),
    } });
    setSending(false);
    if (err) { setError(err.message.replace(/^.*?: /, "").replace(/^não foi possível concluir: /, "Não foi possível concluir: ")); return; }
    const r = data as { number: number; token: string };
    clearCart();
    router.push(`/encomenda/${r.number}?t=${r.token}`);
  }

  if (!lines.length) return <div className="wrap prose"><h1>O carrinho está vazio</h1><p><Link href="/loja">Voltar à loja</Link></p></div>;
  const blocked = (quote?.problems?.length ?? 0) > 0;
  return (
    <form className="wrap checkout" onSubmit={submit} noValidate>
      <section>
        <h1 style={{ fontSize: "clamp(2rem,4vw,2.8rem)" }}>Finalizar compra</h1>
        <div className="form">
          <fieldset>
            <legend>Contacto</legend>
            {!signedIn && <p className="muted" style={{ fontSize: ".95rem" }}>Já tens conta? <Link href="/conta?seguir=/checkout">Entra</Link> para preencher os dados e acompanhar a encomenda na tua área.</p>}
            <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" required autoComplete="email" value={f.email} onChange={up("email")} /></div>
            <div className="row2">
              <div className="field"><label htmlFor="phone">Telemóvel</label><input id="phone" type="tel" required autoComplete="tel" inputMode="tel" placeholder="9xx xxx xxx" value={f.phone} onChange={up("phone")} /></div>
              <div className="field"><label htmlFor="nif">NIF para a fatura (opcional)</label><input id="nif" inputMode="numeric" value={f.nif} onChange={up("nif")} /></div>
            </div>
          </fieldset>
          <fieldset>
            <legend>Morada de entrega</legend>
            <div className="field"><label htmlFor="name">Nome</label><input id="name" required autoComplete="name" value={f.name} onChange={up("name")} /></div>
            <div className="field"><label htmlFor="line1">Morada</label><input id="line1" required autoComplete="address-line1" value={f.line1} onChange={up("line1")} /></div>
            <div className="field"><label htmlFor="line2">Andar, porta, serviço hospitalar (opcional)</label><input id="line2" autoComplete="address-line2" value={f.line2} onChange={up("line2")} /></div>
            <div className="row2">
              <div className="field"><label htmlFor="zip">Código postal</label><input id="zip" required autoComplete="postal-code" placeholder="0000-000" value={f.zip} onChange={up("zip")} /></div>
              <div className="field"><label htmlFor="city">Localidade</label><input id="city" required autoComplete="address-level2" value={f.city} onChange={up("city")} /></div>
            </div>
            <div className="field"><label htmlFor="region">Zona</label>
              <select id="region" value={f.region} onChange={up("region")}><option>Continente</option><option>Açores</option><option>Madeira</option></select></div>
          </fieldset>
          {(quote?.shipping_options?.length ?? 0) > 1 && (
            <fieldset>
              <legend>Como queres receber</legend>
              <div className="ship-opts" role="radiogroup" aria-label="Transportadora">
                {quote!.shipping_options!.map((o) => (
                  <label key={o.key} className={quote!.shipping_option === o.key ? "on" : ""}>
                    <input type="radio" name="ship" value={o.key} checked={quote!.shipping_option === o.key} onChange={() => setF((s) => ({ ...s, ship: o.key }))} />
                    <span className="ship-name">{o.label}<small>{o.delivery === "ponto" ? "Levantas num ponto de recolha" : "Entrega na morada"}{o.eta ? ` · ${o.eta}` : ""}</small></span>
                    <span className="ship-price">{o.price_cents === 0 ? "Grátis" : `${o.was_cents ? "+" : ""}${(o.price_cents / 100).toFixed(2).replace(".", ",")} €`}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset>
            <legend>Pagamento</legend>
            <div className="pay" role="radiogroup" aria-label="Método de pagamento">
              {methods.map((m) => (
                <label key={m}><input type="radio" name="payment" value={m} checked={f.payment === m} onChange={up("payment")} />{PAY_LABEL[m]}</label>
              ))}
            </div>
          </fieldset>
          <div className="field"><label htmlFor="notes">Notas para a encomenda (opcional)</label><textarea id="notes" rows={2} value={f.notes} onChange={up("notes")} /></div>
          <label className="check"><input type="checkbox" checked={f.terms} onChange={up("terms")} /><span>Li e aceito os <Link href="/p/termos-e-condicoes" target="_blank">termos e condições</Link> e a <Link href="/p/privacidade" target="_blank">política de privacidade</Link>.</span></label>
          <label className="check"><input type="checkbox" checked={f.newsletter} onChange={up("newsletter")} /><span>Quero receber novidades e promoções por email (podes cancelar quando quiseres).</span></label>
        </div>
      </section>
      <Summary quote={quote} loading={loading}>
        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="promo">Código de desconto</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input id="promo" value={f.promo} onChange={up("promo")} style={{ textTransform: "uppercase" }} />
            <button type="button" className="btn ghost" style={{ padding: "10px 14px" }} onClick={() => setPromoApplied(f.promo.trim())}>Aplicar</button>
          </div>
        </div>
        {error && <p className="error" role="alert" style={{ marginBottom: 12 }}>{error}</p>}
        <button className="btn block" type="submit" disabled={sending || blocked || !f.payment}>{sending ? "A registar…" : "Confirmar encomenda"}</button>
      </Summary>
    </form>
  );
}
