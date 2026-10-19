import type { Metadata } from "next";
import ReviewForm from "@/components/ReviewForm";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Avaliar a encomenda"), robots: { index: false } };
}

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string; nota?: string }> }) {
  const [{ number }, sp, { t }] = await Promise.all([params, searchParams, getT()]);
  return (
    <div className="wrap prose" style={{ maxWidth: "72ch" }}>
      <h1>{t("Como correu?")}</h1>
      <p className="muted">{t("A sua opinião ajuda outros profissionais de saúde a escolher, e ajuda-nos a melhorar.")}</p>
      <ReviewForm number={Number(number)} token={sp.t ?? ""} initial={Number(sp.nota) || 0} />
    </div>
  );
}
