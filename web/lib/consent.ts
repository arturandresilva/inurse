// Consentimento de cookies: o essencial (carrinho, sessão da conta) não precisa de autorização;
// estatística e marketing só depois de o cliente aceitar. Qualquer script opcional futuro deve perguntar hasConsent() antes de correr.
export type Consent = { v: 1; stats: boolean; marketing: boolean; at: string };
const KEY = "inurse.cookies";
export const CONSENT_EVENT = "inurse:cookies";

export function getConsent(): Consent | null {
  try { const r = localStorage.getItem(KEY); const c = r ? JSON.parse(r) : null; return c?.v === 1 ? c : null; } catch { return null; }
}
export function setConsent(all: boolean) {
  const c: Consent = { v: 1, stats: all, marketing: all, at: new Date().toISOString() };
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* sem storage: volta a perguntar na próxima visita */ }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: c }));
}
export const hasConsent = (k: "stats" | "marketing") => !!getConsent()?.[k];
export const openCookiePrefs = () => window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: "abrir" }));
