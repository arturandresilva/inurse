import type { MetadataRoute } from "next";
import { getCategories, getProducts } from "@/lib/catalog";
import { categoryHref, SITE_URL } from "@/lib/format";

export const revalidate = 3600;
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, cats] = await Promise.all([getProducts(), getCategories()]);
  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/loja`, changeFrequency: "daily", priority: 0.8 },
    ...cats.map((c) => ({ url: `${SITE_URL}${categoryHref(c.path)}`, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...products.map((p) => ({ url: `${SITE_URL}/produto/${p.handle}`, lastModified: p.updated_at, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
