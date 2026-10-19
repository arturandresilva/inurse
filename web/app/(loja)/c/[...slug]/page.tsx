import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Shop from "@/components/Shop";
import { getCategories } from "@/lib/catalog";
import { categoryHref } from "@/lib/format";
import { loc } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const revalidate = 300;

async function find(slug: string[]) {
  const href = "/c/" + slug.map(decodeURIComponent).join("/");
  return (await getCategories()).find((c) => categoryHref(c.path) === href) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const c = await find((await params).slug);
  if (!c) return {};
  const n = loc(c, await getLocale(), "name");
  return { title: n === n.toUpperCase() ? n.charAt(0) + n.slice(1).toLowerCase() : n, alternates: { canonical: categoryHref(c.path) } };
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string[] }>; searchParams: Promise<{ tamanho?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const c = await find(slug);
  if (!c) notFound();
  return <Shop basePath={categoryHref(c.path)} category={c} size={sp.tamanho} />;
}
