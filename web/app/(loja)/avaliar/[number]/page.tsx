import type { Metadata } from "next";
import ReviewForm from "@/components/ReviewForm";

export const metadata: Metadata = { title: "Avaliar a encomenda", robots: { index: false } };

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string; nota?: string }> }) {
  const [{ number }, sp] = await Promise.all([params, searchParams]);
  return (
    <div className="wrap prose" style={{ maxWidth: "72ch" }}>
      <h1>Como correu?</h1>
      <p className="muted">A sua opinião ajuda outros profissionais de saúde a escolher, e ajuda-nos a melhorar.</p>
      <ReviewForm number={Number(number)} token={sp.t ?? ""} initial={Number(sp.nota) || 0} />
    </div>
  );
}
