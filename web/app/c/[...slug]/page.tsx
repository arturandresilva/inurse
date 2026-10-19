import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Shop from "@/components/Shop";
import { getCategories } from "@/lib/catalog";
import { categoryHref, categoryLabel } from "@/lib/format";

export const revalidate = 300;

async function find(slug: string[]) {
  const href = "/c/" + slug.map(decodeURIComponent).join("/");
  return (await getCategories()).find((c) => categoryHref(c.path) === href) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const c = await find((await params).slug);
  if (!c) return {};
  return { title: categoryLabel(c.name), alternates: { canonical: categoryHref(c.path) } };
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string[] }>; searchParams: Promise<{ tamanho?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const c = await find(slug);
  if (!c) notFound();
  return <Shop basePath={categoryHref(c.path)} category={c} size={sp.tamanho} />;
}
