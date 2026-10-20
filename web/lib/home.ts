import { supabase } from "./supabase";
import { loc, type Locale } from "./i18n";

// Página inicial editável (backoffice → Página inicial): campanhas com diapositivos e imagens do destaque/categorias
export type Slide = {
  id: string; kind: "image" | "video"; media_url: string; mobile_url: string | null; poster_url: string | null;
  eyebrow: string | null; title: string | null; body: string | null; cta_label: string | null; cta_url: string | null;
  theme: "dark" | "light"; align: "left" | "center" | "right";
};
export type Campaign = { id: string; name: string; placement: "topo" | "faixa"; interval_s: number; slides: Slide[] };
export type HomeSettings = { hero_images: string[]; tiles: Record<string, string> };

export async function getHome(locale: Locale): Promise<{ campaigns: Campaign[]; settings: HomeSettings }> {
  const [c, s] = await Promise.all([
    supabase.from("home_campaigns").select("id,name,placement,interval_s,position,home_slides(*)").order("position").order("created_at", { ascending: false }),
    supabase.from("settings").select("value").eq("key", "public.home").maybeSingle(),
  ]);
  const campaigns = ((c.data ?? []) as any[]).map((r) => ({
    id: r.id, name: r.name, placement: r.placement, interval_s: r.interval_s,
    slides: [...(r.home_slides ?? [])].sort((a, b) => a.position - b.position).map((x) => ({
      ...x, eyebrow: loc(x, locale, "eyebrow"), title: loc(x, locale, "title"), body: loc(x, locale, "body"), cta_label: loc(x, locale, "cta_label"),
    })) as Slide[],
  })).filter((r) => r.slides.length) as Campaign[];
  const v = (s.data?.value ?? {}) as Partial<HomeSettings>;
  return { campaigns, settings: { hero_images: (v.hero_images ?? []).map((x: unknown) => (typeof x === "string" ? x : "")), tiles: v.tiles ?? {} } };
}
