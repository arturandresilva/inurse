import { supabase } from "./supabase";

// Dados legais da loja (Configurações → Loja → Dados legais). As páginas usam {{marcadores}} e, nos textos antigos,
// os valores escritos à mão são trocados pelos atuais, para que uma correção no backoffice chegue a todo o site.
export type Legal = {
  name: string; legal_name: string; nif: string; address: string; zip: string; city: string; email: string; phone: string;
  ral_name: string; ral_url: string; ral_address: string; return_days: number;
};
export const LEGAL_DEFAULTS: Legal = {
  name: "iNurse", legal_name: "Artur Silva", nif: "226720462", address: "Praça 20 de Maio", zip: "4590-182", city: "Paços de Ferreira",
  email: "info@inurse.pt", phone: "918889008",
  ral_name: "CNIACC – Centro Nacional de Informação e Arbitragem de Conflitos de Consumo", ral_url: "https://www.cniacc.pt", ral_address: "",
  return_days: 15,
};

export async function getLegal(): Promise<Legal> {
  const { data } = await supabase.from("settings").select("value").eq("key", "public.store").maybeSingle();
  const v = (data?.value ?? {}) as Partial<Legal>;
  const out = { ...LEGAL_DEFAULTS };
  for (const k of Object.keys(out) as (keyof Legal)[]) if (v[k] != null && v[k] !== "") (out as Record<string, unknown>)[k] = v[k];
  return out;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
export const phoneLabel = (p: string) => p.replace(/\D/g, "").replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
export const fullAddress = (l: Legal) => `${l.address}, ${l.zip} ${l.city}`;
export function ralHtml(l: Legal) {
  const host = l.ral_url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `${esc(l.ral_name)} (<a href="${esc(l.ral_url)}" target="_blank" rel="noopener">${esc(host)}</a>${l.ral_address ? `, ${esc(l.ral_address)}` : ""})`;
}

export function applyLegal(html: string, l: Legal): string {
  const map: Record<string, string> = {
    loja: esc(l.name), empresa: esc(l.legal_name), nif: esc(l.nif), morada: esc(fullAddress(l)), email: esc(l.email),
    telefone: esc(phoneLabel(l.phone)), ral: ralHtml(l), prazo_devolucao: String(l.return_days),
  };
  let out = html.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => map[k] ?? m);
  // textos escritos antes de haver marcadores
  out = out
    .replace(/CNIACC – Centro Nacional de Informação e Arbitragem de Conflitos de Consumo \(<a href="https:\/\/www\.cniacc\.pt"[^>]*>www\.cniacc\.pt<\/a>\)/g, map.ral)
    .replace(/Praça 20 de Maio, 4590-182 Paços de Ferreira/g, map.morada)
    .replace(/NIF 226720462/g, `NIF ${map.nif}`)
    .replace(/<strong>Artur Silva<\/strong>/g, `<strong>${map.empresa}</strong>`)
    .replace(/de Artur Silva, NIF/g, `de ${map.empresa}, NIF`)
    .replace(/mailto:info@inurse\.pt">info@inurse\.pt/g, `mailto:${map.email}">${map.email}`)
    .replace(/tel:\+351918889008">918 889 008/g, `tel:+351${l.phone.replace(/\D/g, "")}">${map.telefone}`)
    .replace(/918 889 008/g, map.telefone);
  return out;
}

// perfis nas redes sociais (backoffice → Equipa IA → Redes sociais)
export type Social = { instagram?: string; facebook?: string; tiktok?: string; pinterest?: string; youtube?: string };
export async function getSocial(): Promise<Social> {
  const { data } = await supabase.from("settings").select("value").eq("key", "public.social").maybeSingle();
  const v = (data?.value ?? {}) as Social, out: Social = {};
  for (const k of ["instagram", "facebook", "tiktok", "pinterest", "youtube"] as const) if (/^https:\/\//.test(String(v[k] ?? ""))) out[k] = v[k];
  return out;
}
