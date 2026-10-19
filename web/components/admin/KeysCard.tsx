"use client";
import { useState } from "react";
import { callFunction, type Row } from "@/lib/admin/sb";
import { Badge, Card, useAction } from "./ui";

// Estado das chaves guardadas nos segredos do Supabase (a função "chaves" testa cada uma sem nunca mostrar o valor)
const TONE: Record<string, ["ok" | "warn" | "err" | "muted", string]> = { ok: ["ok", "A funcionar"], aviso: ["warn", "Atenção"], erro: ["err", "Com erro"], falta: ["muted", "Em falta"] };

export default function KeysCard() {
  const [r, setR] = useState<Row | null>(null);
  const { busy, act } = useAction();
  return (
    <Card title="Chaves dos serviços" actions={<button className="a-btn sm" disabled={busy} onClick={() => act(async () => setR(await callFunction<Row>("chaves")))}>{busy ? "A verificar…" : "Verificar chaves"}</button>}>
      <p className="a-hint">As chaves ficam em Supabase → Edge Functions → Secrets, nunca aqui. Este teste confirma se cada uma existe e se o serviço a aceita, sem mostrar o valor.</p>
      {r && (
        <div className="a-table-wrap" style={{ marginTop: 10 }}>
          <table className="a-table">
            <thead><tr><th>Chave</th><th>Serve para</th><th>Estado</th><th>Detalhe</th></tr></thead>
            <tbody>
              {(r.checks as Row[]).map((c) => (
                <tr key={c.key}><td><code>{c.key}</code></td><td>{c.servico}</td><td><Badge tone={TONE[c.estado]?.[0] ?? "muted"}>{TONE[c.estado]?.[1] ?? c.estado}</Badge></td><td className="a-small">{c.detalhe}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
