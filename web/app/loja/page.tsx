import type { Metadata } from "next";
import Shop from "@/components/Shop";

export const revalidate = 300;
export const metadata: Metadata = { title: "Loja", alternates: { canonical: "/loja" } };

export default async function LojaPage({ searchParams }: { searchParams: Promise<{ q?: string; tamanho?: string }> }) {
  const sp = await searchParams;
  return <Shop basePath="/loja" q={sp.q?.slice(0, 80)} size={sp.tamanho} />;
}
