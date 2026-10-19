import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/format";
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/carrinho", "/checkout", "/encomenda/", "/admin", "/conta"] }], sitemap: `${SITE_URL}/sitemap.xml` };
}
