// Estrelas (só leitura). value pode ter casas decimais: a última estrela fica parcialmente preenchida.
export default function Stars({ value, size = 16, label }: { value: number; size?: number; label?: string }) {
  const pct = Math.max(0, Math.min(5, value)) / 5 * 100;
  return (
    <span className="stars" style={{ fontSize: size }} role="img" aria-label={label ?? `${value.toFixed(1).replace(".", ",")} de 5 estrelas`}>
      <span className="stars-bg">★★★★★</span>
      <span className="stars-fg" style={{ width: `${pct}%` }}>★★★★★</span>
    </span>
  );
}
