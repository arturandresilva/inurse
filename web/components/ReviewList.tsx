import Stars from "./Stars";
import type { ReviewSummary } from "@/lib/reviews";

export default function ReviewList({ s, title, empty }: { s: ReviewSummary; title: string; empty: string }) {
  return (
    <section className="reviews" id="avaliacoes">
      <div className="reviews-head">
        <h2>{title}</h2>
        {s.count > 0 && <p className="reviews-avg"><Stars value={s.avg} size={20} /> <strong>{s.avg.toFixed(1).replace(".", ",")}</strong> <span className="muted">· {s.count} {s.count === 1 ? "avaliação" : "avaliações"}</span></p>}
      </div>
      {s.count === 0 ? <p className="muted">{empty}</p> : (
        <ul className="review-list">
          {s.list.slice(0, 12).map((r) => (
            <li key={r.id}>
              <p><Stars value={r.rating} size={15} /> {r.title && <strong>{r.title}</strong>}</p>
              {r.body && <p>{r.body}</p>}
              <p className="muted review-by">{r.author ?? "Cliente"} · compra verificada · {new Date(r.created_at).toLocaleDateString("pt-PT", { month: "long", year: "numeric" })}</p>
              {r.reply && <p className="review-reply"><strong>Resposta da iNurse:</strong> {r.reply}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
