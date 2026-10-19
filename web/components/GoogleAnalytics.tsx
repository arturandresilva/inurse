"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_EVENT, hasConsent } from "@/lib/consent";
import { supabase } from "@/lib/supabase";

// Google Analytics 4 (opcional): só carrega se houver um ID em Estatísticas e o visitante aceitar os cookies de estatística.
// É o que permite ver idade e género (estimados pela Google) nos relatórios do GA4.
declare global { interface Window { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void } }
let loaded = false;
export default function GoogleAnalytics() {
  const path = usePathname();
  useEffect(() => {
    let id = "";
    const start = () => {
      if (loaded || !id || !hasConsent("stats")) return;
      loaded = true;
      const s = document.createElement("script"); s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() { window.dataLayer!.push(arguments); };
      window.gtag("js", new Date());
      window.gtag("config", id, { anonymize_ip: true });
    };
    supabase.from("settings").select("value").eq("key", "public.analytics").maybeSingle().then(({ data }) => {
      id = String((data?.value as { ga4_id?: string } | null)?.ga4_id ?? "").trim();
      start();
    });
    window.addEventListener(CONSENT_EVENT, start);
    return () => window.removeEventListener(CONSENT_EVENT, start);
  }, []);
  useEffect(() => { if (loaded && window.gtag) window.gtag("event", "page_view", { page_path: path }); }, [path]);
  return null;
}
