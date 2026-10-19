// Traduções da loja. Os textos são escritos em português no código e passam por t("texto"); as outras línguas
// ficam em messages.ts com o texto português como chave (o que faltar aparece em português).
import { EN, ES, FR } from "./messages";

export const LOCALES = ["pt", "en", "es", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_NAMES: Record<Locale, string> = { pt: "Português", en: "English", es: "Español", fr: "Français" };
export const HTML_LANG: Record<Locale, string> = { pt: "pt-PT", en: "en", es: "es", fr: "fr" };
export const INTL: Record<Locale, string> = { pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" };
export const LOCALE_COOKIE = "inurse.lang";
export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

const DICT: Record<Exclude<Locale, "pt">, Record<string, string>> = { en: EN, es: ES, fr: FR };

export type Vars = Record<string, string | number>;
export function translate(locale: Locale, text: string, vars?: Vars): string {
  let s = locale === "pt" ? text : (DICT[locale][text] ?? text);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
export type T = (text: string, vars?: Vars) => string;
export const makeT = (locale: Locale): T => (text, vars) => translate(locale, text, vars);

// conteúdos da base de dados com traduções guardadas em "translations" ({en: {campo: ...}, ...})
type WithTr = { translations?: Record<string, Record<string, string | null> | string> | null };
export function loc<O extends WithTr, K extends keyof O & string>(o: O, locale: Locale, field: K): O[K] {
  if (locale === "pt" || !o.translations) return o[field];
  const tr = o.translations[locale];
  const v = tr && typeof tr === "object" ? tr[field] : null;
  return (v ? v : o[field]) as O[K];
}
