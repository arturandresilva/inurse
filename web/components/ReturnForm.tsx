"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Item = { id: string; title: string; option_value: string; quantity: number };
const REASONS: [string, string][] = [["tamanho", "O tamanho não serve"], ["defeito", "Chegou com defeito"], ["engano_envio", "Recebi um artigo errado"], ["nao_gostou", "Não gostei"], ["outro", "Outro motivo"]];

export default function ReturnForm({ number, token, items }: { number: number; token: string; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Record<string, number>>({});
  const [kind, setKind] = useState("troca");
  const [state, setState] = useState<{ ok?: number; err?: string; busy?: boolean }>({});

  if (state.ok) return <div className="notice" role="status"><strong>Pedido de {kind === "troca" ? "troca" : "devolução"} n.º {state.ok} registado.</strong> Vamos enviar-te por email as instruções e a etiqueta CTT.</div>;
  if (!open) return <button className="btn" onClick={() => setOpen(true)}>Pedir troca ou devolução</button>;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const chosen = Object.entries(sel).filter(([, q]) => q > 0).map(([order_item_id, quantity]) => ({ order_item_id, quantity }));
    if (!chosen.length) { setState({ err: "Escolhe pelo menos um artigo." }); return; }
    setState({ busy: true });
    const { data, error } = await supabase.rpc("request_return", { p_number: number, p_token: token,
      p: { items: chosen, reason: f.get("reason"), kind, notes: String(f.get("notes") ?? "").slice(0, 1000) } });
    if (error) setState({ err: error.message.replace(/^.*?: /, "") });
    else setState({ ok: (data as { return_number: number }).return_number });
  }

  return (
    <form onSubmit={submit} className="notice" style={{ display: "grid", gap: 12 }}>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 6 }}>
        <legend style={{ fontWeight: 700, marginBottom: 6 }}>Que artigos?</legend>
        {items.map((i) => (
          <label key={i.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={!!sel[i.id]} onChange={(e) => setSel({ ...sel, [i.id]: e.target.checked ? 1 : 0 })} />
            <span style={{ flex: 1 }}>{i.title} (tam. {i.option_value})</span>
            {i.quantity > 1 && sel[i.id] > 0 && (
              <select aria-label="Quantidade" value={sel[i.id]} onChange={(e) => setSel({ ...sel, [i.id]: Number(e.target.value) })}>
                {Array.from({ length: i.quantity }, (_, k) => <option key={k} value={k + 1}>{k + 1}</option>)}
              </select>
            )}
          </label>
        ))}
      </fieldset>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <label><input type="radio" name="kind" checked={kind === "troca"} onChange={() => setKind("troca")} /> Trocar por outro tamanho</label>
        <label><input type="radio" name="kind" checked={kind === "reembolso"} onChange={() => setKind("reembolso")} /> Devolver e receber o dinheiro</label>
      </div>
      <label style={{ display: "grid", gap: 4 }}>Motivo
        <select name="reason" defaultValue="tamanho">{REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </label>
      <label style={{ display: "grid", gap: 4 }}>{kind === "troca" ? "Que tamanho queres em troca?" : "Notas (opcional)"}
        <textarea name="notes" rows={2} required={kind === "troca"} style={{ font: "inherit", padding: 8, borderRadius: 8, border: "1px solid var(--line)" }} />
      </label>
      {state.err && <p role="alert" style={{ color: "var(--warn)" }}>{state.err}</p>}
      <div><button className="btn" disabled={state.busy}>{state.busy ? "A enviar…" : "Enviar pedido"}</button></div>
    </form>
  );
}
