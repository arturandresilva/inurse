import { supabase } from "./supabase";
import type { Product } from "./catalog";

export type Review = { id: string; kind: string; product_id: string | null; model: string | null; rating: number; title: string | null; body: string | null; author: string | null; reply: string | null; created_at: string };
export type ReviewSummary = { avg: number; count: number; list: Review[] };

const summary = (list: Review[]): ReviewSummary => ({ list, count: list.length, avg: list.length ? list.reduce((a, r) => a + r.rating, 0) / list.length : 0 });

// as cores do mesmo modelo partilham as avaliações
export async function getProductReviews(p: Product): Promise<ReviewSummary> {
  let q = supabase.from("public_reviews").select("*").eq("kind", "produto").order("created_at", { ascending: false }).limit(200);
  q = p.model ? q.or(`model.eq."${p.model.replace(/"/g, "")}",product_id.eq.${p.id}`) : q.eq("product_id", p.id);
  const { data } = await q;
  return summary((data ?? []) as Review[]);
}

export async function getStoreReviews(limit = 200): Promise<ReviewSummary> {
  const { data } = await supabase.from("public_reviews").select("*").eq("kind", "loja").order("created_at", { ascending: false }).limit(limit);
  return summary((data ?? []) as Review[]);
}
