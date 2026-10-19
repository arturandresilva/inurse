"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n/client";

// Conta cada página vista (estatísticas no backoffice). Sem cookies nem identificadores guardados no navegador.
export default function Track() {
  const path = usePathname();
  const locale = useLocale();
  const first = useRef(true);
  useEffect(() => {
    if (!path || document.cookie.includes("inurse.nocount=1")) return;   // o Artur pode excluir o próprio browser
    const body = JSON.stringify({ p: path, r: first.current ? document.referrer : "", q: first.current ? location.search : "", l: locale });
    first.current = false;
    try {
      if (!navigator.sendBeacon?.("/api/v", new Blob([body], { type: "application/json" }))) fetch("/api/v", { method: "POST", body, keepalive: true }).catch(() => {});
    } catch { /* sem contagem */ }
  }, [path, locale]);
  return null;
}
