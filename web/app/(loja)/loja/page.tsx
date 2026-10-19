import type { Metadata } from "next";
import Shop from "@/components/Shop";
import { getT } from "@/lib/i18n/server";

export const revalidate = 300;
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Loja"), alternates: { canonical: "/loja" } };
}

export default async function LojaPage({ searchParams }: { searchParams: Promise<{ q?: string; tamanho?: string }> }) {
  const sp = await searchParams;
  return <Shop basePath="/loja" q={sp.q?.slice(0, 80)} size={sp.tamanho} />;
}
