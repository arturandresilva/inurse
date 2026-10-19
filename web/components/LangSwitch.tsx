"use client";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";

export default function LangSwitch() {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  return (
    <label className="lang-switch">
      <span className="sr-only">{t("Língua")}</span>
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
      <select value={locale} onChange={(e) => {
        const l = e.target.value as Locale;
        document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}>
        {LOCALES.map((l) => <option key={l} value={l}>{l.toUpperCase()} · {LOCALE_NAMES[l]}</option>)}
      </select>
    </label>
  );
}
