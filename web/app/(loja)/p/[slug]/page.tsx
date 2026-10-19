import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { applyLegal, getLegal } from "@/lib/legal";

export const revalidate = 600;
type Page = { slug: string; title: string; body_html: string; seo_title: string | null; seo_description: string | null };

async function getPage(slug: string) {
  const { data } = await supabase.from("pages").select("slug,title,body_html,seo_title,seo_description").eq("slug", slug).maybeSingle();
  return data as Page | null;
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getPage((await params).slug);
  return p ? { title: p.seo_title || p.title, description: p.seo_description ?? undefined, alternates: { canonical: `/p/${p.slug}` } } : {};
}
export default async function InfoPage({ params }: { params: Promise<{ slug: string }> }) {
  const [p, legal] = await Promise.all([getPage((await params).slug), getLegal()]);
  if (!p) notFound();
  return <article className="wrap prose"><h1>{p.title}</h1><div dangerouslySetInnerHTML={{ __html: applyLegal(p.body_html, legal) }} /></article>;
}
