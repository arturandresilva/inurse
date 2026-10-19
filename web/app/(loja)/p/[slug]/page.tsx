import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { applyLegal, getLegal } from "@/lib/legal";
import { loc } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";

export const revalidate = 600;
type Page = { slug: string; title: string; body_html: string; seo_title: string | null; seo_description: string | null; translations: Record<string, Record<string, string>> | null };

async function getPage(slug: string) {
  const { data } = await supabase.from("pages").select("slug,title,body_html,seo_title,seo_description,translations").eq("slug", slug).maybeSingle();
  return data as Page | null;
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const [p, { locale }] = await Promise.all([getPage((await params).slug), getT()]);
  return p ? { title: loc(p, locale, "seo_title") || loc(p, locale, "title"), description: loc(p, locale, "seo_description") ?? undefined, alternates: { canonical: `/p/${p.slug}` } } : {};
}
export default async function InfoPage({ params }: { params: Promise<{ slug: string }> }) {
  const [p, legal, { t, locale }] = await Promise.all([getPage((await params).slug), getLegal(), getT()]);
  if (!p) notFound();
  const translated = locale !== "pt" && !!p.translations?.[locale]?.body_html;
  return (
    <article className="wrap prose">
      <h1>{loc(p, locale, "title")}</h1>
      {locale !== "pt" && <p className="notice lang-note">{translated ? t("Tradução para sua conveniência. Em caso de divergência prevalece a versão portuguesa.") : t("Esta página ainda só está disponível em português.")}</p>}
      <div dangerouslySetInnerHTML={{ __html: applyLegal(loc(p, locale, "body_html"), legal) }} />
    </article>
  );
}
