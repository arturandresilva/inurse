import Link from "next/link";
export default function NotFound() {
  return (
    <div className="wrap prose">
      <h1>Página não encontrada</h1>
      <p className="muted">O endereço pode ter mudado. Procura pelo teu número ou volta à loja.</p>
      <p style={{ marginTop: 20 }}><Link className="btn" href="/loja">Ir para a loja</Link></p>
    </div>
  );
}
