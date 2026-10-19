const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
export const money = (cents: number | null | undefined) => (cents == null ? "" : eur.format(cents / 100));
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.inurse.pt";
export const SIZES = ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47"];

export function stripHtml(html: string | null | undefined, max = 160) {
  const t = (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// "36/37" conta para o 36 e para o 37
export function sizeMatches(option: string, size: string) {
  return option.split("/").some((p) => p.trim() === size);
}

export function slugify(s: string) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
// "CALÇADO>COMPRAR POR PROFISSÃO>Enfermagem" -> "/c/calcado/comprar-por-profissao/enfermagem"
export const categoryHref = (path: string) => "/c/" + path.split(">").map(slugify).join("/");
export const categoryLabel = (name: string) => name.charAt(0) + name.slice(1).toLowerCase() === name ? name : name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
