import { supabase } from "./supabase";

export type Variant = { id: string; option_value: string; price_cents: number; compare_at_cents: number | null; stock: number | null; active: boolean; position: number; allow_backorder: boolean };
export type Product = {
  id: string; handle: string; title: string; excerpt: string | null; description_html: string | null; brand: string | null;
  status: string; featured: boolean; model: string | null; color: string | null; translations: Record<string, Record<string, string>> | null; vat_rate: number; seo_title: string | null; seo_description: string | null; position: number;
  updated_at: string;
  variants: Variant[]; product_images: { url: string; position: number }[]; product_categories: { category_id: string }[];
};
export type Category = { id: string; name: string; slug: string; path: string; parent_id: string | null; position: number; translations: Record<string, Record<string, string>> | null };

const PRODUCT_FIELDS =
  "id,handle,title,excerpt,description_html,brand,model,color,translations,status,featured,vat_rate,seo_title,seo_description,position,updated_at," +
  "variants(id,option_value,price_cents,compare_at_cents,stock,active,position,allow_backorder),product_images(url,position),product_categories(category_id)";

function tidy(p: Product): Product {
  p.variants = (p.variants ?? []).filter((v) => v.active && v.price_cents > 0).sort((a, b) => a.position - b.position);
  p.product_images = (p.product_images ?? []).sort((a, b) => a.position - b.position);
  return p;
}

export async function getProducts(): Promise<Product[]> {
  const { data, error } = await supabase.from("products").select(PRODUCT_FIELDS)
    .in("status", ["active", "out_of_stock"]).order("position").order("title").limit(2000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Product[]).map(tidy).filter((p) => p.variants.length > 0);
}

export async function getProduct(handle: string): Promise<Product | null> {
  const { data } = await supabase.from("products").select(PRODUCT_FIELDS).eq("handle", handle).in("status", ["active", "out_of_stock"]).maybeSingle();
  return data ? tidy(data as unknown as Product) : null;
}

export async function getCategories(): Promise<Category[]> {
  const { data } = await supabase.from("categories").select("id,name,slug,path,parent_id,position,translations").order("path");
  return (data ?? []) as Category[];
}

export async function searchProducts(q: string): Promise<string[]> {
  const { data } = await supabase.from("products").select("id").textSearch("search", q, { type: "websearch", config: "portuguese" }).limit(200);
  return (data ?? []).map((r: { id: string }) => r.id);
}

export const sellable = (v: Variant) => v.stock == null || v.stock > 0 || v.allow_backorder;
export const minPrice = (p: Product) => Math.min(...p.variants.map((v) => v.price_cents));
export const image = (p: Product) => p.product_images[0]?.url ?? null;

// ---------- modelos: cada cor é um produto; os do mesmo modelo mostram-se juntos ----------
export type ModelGroup = { key: string; name: string; items: Product[]; lead: Product };
const modelKey = (p: Product) => (p.model ? `${(p.brand ?? "").toLowerCase()}|${p.model.toLowerCase()}` : `p:${p.id}`);

export function groupByModel(ps: Product[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>();
  const out: ModelGroup[] = [];
  for (const p of ps) {
    const key = modelKey(p);
    let g = map.get(key);
    if (!g) { g = { key, name: p.model ?? p.title, items: [], lead: p }; map.set(key, g); out.push(g); }
    g.items.push(p);
  }
  // a fotografia da ficha vem da primeira cor disponível com fotografia
  for (const g of out) {
    g.lead = g.items.find((p) => p.status === "active" && p.product_images.length) ?? g.items.find((p) => p.status === "active") ?? g.items[0];
    if (g.items.some((p) => p.featured)) g.lead = g.items.find((p) => p.featured && p.status === "active") ?? g.lead;
  }
  return out;
}

export async function getModelColors(p: Product): Promise<Product[]> {
  if (!p.model) return [p];
  let q = supabase.from("products").select(PRODUCT_FIELDS).eq("model", p.model).in("status", ["active", "out_of_stock"]).order("position").order("title");
  q = p.brand ? q.eq("brand", p.brand) : q.is("brand", null);
  const { data } = await q;
  const list = ((data ?? []) as unknown as Product[]).map(tidy).filter((x) => x.variants.length > 0 || x.id === p.id);
  return list.some((x) => x.id === p.id) ? list : [p, ...list];
}

export function colorLabel(p: Product, locale: string = "pt", t: (s: string, v?: Record<string, string>) => string = (s) => s) {
  const c = (locale !== "pt" && p.translations?.[locale]?.color) || p.color;
  return c ? (/^\d+$/.test(c) ? t("Cor {n}", { n: c }) : c) : p.title;
}
