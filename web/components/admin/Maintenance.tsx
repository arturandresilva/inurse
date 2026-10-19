"use client";
import { useEffect, useState } from "react";
import { run, sb, type Row } from "@/lib/admin/sb";
import { Alert, Card, Field, useAction } from "./ui";

// Modo de manutenção: liga/desliga a loja para clientes. Quem liga continua a ver a loja neste browser (cookie de pré-visualização).
const COOKIE = "inurse.preview";
const setPreview = (on: boolean) => { document.cookie = `${COOKIE}=${on ? "1" : ""}; path=/; max-age=${on ? 60 * 60 * 24 * 30 : 0}; samesite=lax`; };
const hasPreview = () => document.cookie.split("; ").includes(`${COOKIE}=1`);
const toLocal = (d: string | null) => { if (!d) return ""; const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const MAINT_EVENT = "inurse-maintenance";

async function load(): Promise<Row> {
  const r = await run<Row | null>(sb().from("settings").select("value").eq("key", "public.maintenance").maybeSingle());
  return (r?.value ?? { enabled: false }) as Row;
}
async function store(value: Row) {
  await run(sb().from("settings").update({ value, updated_at: new Date().toISOString() }).eq("key", "public.maintenance"));
  window.dispatchEvent(new Event(MAINT_EVENT));
}

/** Aviso no topo do backoffice enquanto a loja está fechada. */
export function MaintenanceBar() {
  const [m, setM] = useState<Row | null>(null);
  const { busy, act } = useAction();
  useEffect(() => {
    const f = () => load().then(setM).catch(() => {});
    f(); window.addEventListener(MAINT_EVENT, f);
    return () => window.removeEventListener(MAINT_EVENT, f);
  }, []);
  if (!m?.enabled) return null;
  return (
    <div className="a-maint-bar" role="status">
      <strong>A loja está em manutenção.</strong> Os clientes veem a página de manutenção e não conseguem encomendar.
      <button className="a-btn sm" disabled={busy} onClick={() => act(async () => { await store({ ...m, enabled: false }); setM({ ...m, enabled: false }); }, "Loja aberta outra vez.")}>Reabrir a loja</button>
    </div>
  );
}

/** Cartão em Configurações → Loja. */
export function MaintenanceCard() {
  const [m, setM] = useState<Row | null>(null);
  const [preview, setPrev] = useState(false);
  const { busy, act } = useAction();
  useEffect(() => {
    const f = () => load().then(setM).catch(() => setM({ enabled: false }));
    f(); setPrev(hasPreview()); window.addEventListener(MAINT_EVENT, f);
    return () => window.removeEventListener(MAINT_EVENT, f);
  }, []);
  if (!m) return null;

  function submit(e: React.FormEvent<HTMLFormElement>, enabled: boolean) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const until = String(f.get("until") ?? "");
    const value = { enabled, message: String(f.get("message") ?? "").trim(), until: until ? new Date(until).toISOString() : null, changed_at: new Date().toISOString() };
    act(async () => {
      await store(value); setM(value);
      if (enabled) { setPreview(true); setPrev(true); }
    }, enabled ? "Loja em manutenção. Neste browser continuas a ver a loja normal para poderes testar." : "Guardado.");
  }

  return (
    <Card title="Modo de manutenção">
      {m.enabled
        ? <Alert tone="warn">A loja está <strong>fechada</strong> para clientes. As páginas de encomenda, avaliação, livre resolução e as páginas legais continuam abertas, e não entram encomendas novas.</Alert>
        : <p className="a-hint" style={{ marginBottom: 12 }}>Usa quando precisares de mexer na loja (preços, fotos, importações). Os clientes veem uma página “Estamos a melhorar a loja” com a mensagem abaixo e o teu contacto; não entram encomendas novas. Tu continuas a ver a loja neste browser.</p>}
      <form onSubmit={(e) => submit(e, !m.enabled)}>
        <div className="a-grid-2">
          <Field label="Mensagem para os clientes (opcional)" hint="Vazio usa “A loja está temporariamente em manutenção. Voltamos dentro de pouco tempo.”, já traduzida para EN/ES/FR. Uma mensagem tua aparece como a escreveres." wide>
            <textarea name="message" rows={2} defaultValue={m.message ?? ""} placeholder="Estamos a atualizar o catálogo. Voltamos hoje às 18h." />
          </Field>
          <Field label="Previsão de regresso (opcional)"><input name="until" type="datetime-local" defaultValue={toLocal(m.until ?? null)} /></Field>
        </div>
        <div className="a-formfoot">
          <a className="a-btn" href="/" target="_blank" rel="noopener">Abrir a loja</a>
          {m.enabled && (
            <button type="button" className="a-btn" onClick={() => { setPreview(!preview); setPrev(!preview); }}>
              {preview ? "Ver como cliente (página de manutenção)" : "Voltar a ver a loja normal"}
            </button>
          )}
          <button className={`a-btn ${m.enabled ? "primary" : "danger"}`} disabled={busy}>{m.enabled ? "Reabrir a loja" : "Pôr a loja em manutenção"}</button>
        </div>
      </form>
    </Card>
  );
}
