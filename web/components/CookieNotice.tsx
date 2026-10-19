"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CONSENT_EVENT, getConsent, setConsent } from "@/lib/consent";

// Aviso discreto no canto inferior: aparece até o cliente escolher, e reabre em "Preferências de cookies" no rodapé.
export default function CookieNotice() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!getConsent()) setOpen(true);
    const h = (e: Event) => setOpen((e as CustomEvent).detail === "abrir");
    window.addEventListener(CONSENT_EVENT, h);
    return () => window.removeEventListener(CONSENT_EVENT, h);
  }, []);
  if (!open) return null;
  return (
    <div className="cookie-notice" role="region" aria-label="Cookies">
      <p>
        Usamos cookies essenciais para o carrinho e a tua conta. Cookies de estatística e marketing só com a tua autorização.{" "}
        <Link href="/p/privacidade#cookies">Saber mais</Link>
      </p>
      <div className="cookie-actions">
        <button type="button" className="btn ghost" onClick={() => setConsent(false)}>Só essenciais</button>
        <button type="button" className="btn" onClick={() => setConsent(true)}>Aceitar</button>
      </div>
    </div>
  );
}

export function CookiePrefsLink() {
  return <button type="button" className="linklike" onClick={() => window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: "abrir" }))}>Preferências de cookies</button>;
}
