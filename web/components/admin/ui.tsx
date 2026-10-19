"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Tone } from "@/lib/admin/format";

/* ---------- Avisos (toast) ---------- */
type ToastMsg = { id: number; text: string; tone: "ok" | "err" };
const listeners = new Set<(t: ToastMsg) => void>();
let seq = 0;
export function toast(text: string, tone: "ok" | "err" = "ok") {
  const t = { id: ++seq, text, tone };
  listeners.forEach((l) => l(t));
}
export function Toasts() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const on = (t: ToastMsg) => {
      setItems((x) => [...x, t]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), t.tone === "err" ? 7000 : 3500);
    };
    listeners.add(on);
    return () => { listeners.delete(on); };
  }, []);
  return (
    <div className="a-toasts" role="status" aria-live="polite">
      {items.map((t) => <div key={t.id} className={`a-toast ${t.tone}`}>{t.text}</div>)}
    </div>
  );
}

/* ---------- Carregar dados ---------- */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await fnRef.current()); setError(null); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);
  return { data, error, loading, reload, setData };
}

/** Executa uma ação com estado "a trabalhar" e aviso de sucesso/erro. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const act = useCallback(async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    setBusy(true);
    try { const r = await fn(); if (ok) toast(ok); return r; }
    catch (e) { toast((e as Error).message, "err"); return undefined; }
    finally { setBusy(false); }
  }, []);
  return { busy, act };
}

/* ---------- Estrutura ---------- */
export function PageHead({ title, sub, back, children }: { title: React.ReactNode; sub?: React.ReactNode; back?: string; children?: React.ReactNode }) {
  return (
    <header className="a-head">
      <div>
        {back && <Link href={back} className="a-back">← Voltar</Link>}
        <h1>{title}</h1>
        {sub && <p className="a-sub">{sub}</p>}
      </div>
      {children && <div className="a-actions">{children}</div>}
    </header>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`a-card ${className}`}>
      {(title || actions) && <div className="a-card-head">{title && <h2>{title}</h2>}{actions && <div className="a-actions">{actions}</div>}</div>}
      {children}
    </section>
  );
}

export function Badge({ tone = "muted", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`a-badge ${tone}`}>{children}</span>;
}

export function Loading() {
  return <div className="a-loading" aria-label="A carregar"><span className="a-spin" /></div>;
}

export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="a-alert err">
      <strong>Não foi possível carregar.</strong> {error}
      {retry && <button className="a-btn sm" onClick={retry}>Tentar de novo</button>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="a-empty"><strong>{title}</strong>{children && <div>{children}</div>}</div>;
}

export function Alert({ tone = "info", children }: { tone?: Tone; children: React.ReactNode }) {
  return <div className={`a-alert ${tone}`}>{children}</div>;
}

/** Mostra carregamento/erro e só depois o conteúdo. */
export function Loaded<T>({ s, children }: { s: { data: T | null; error: string | null; loading: boolean; reload: () => void }; children: (d: T) => React.ReactNode }) {
  if (s.error) return <ErrorBox error={s.error} retry={s.reload} />;
  if (s.data == null) return <Loading />;
  return <>{children(s.data)}</>;
}

/* ---------- Formulários ---------- */
export function Field({ label, hint, children, wide }: { label: string; hint?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`a-field${wide ? " wide" : ""}`}>
      <span className="a-label">{label}</span>
      {children}
      {hint && <span className="a-hint">{hint}</span>}
    </label>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="a-tabs" role="tablist">
      {tabs.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: Tone }) {
  return (
    <div className={`a-stat ${tone ?? ""}`}>
      <span className="a-stat-l">{label}</span>
      <strong className="a-stat-v">{value}</strong>
      {hint && <span className="a-stat-h">{hint}</span>}
    </div>
  );
}

/** Janela de diálogo simples (sem dependências). */
export function Modal({ title, open, onClose, children, wide }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`a-modal${wide ? " wide" : ""}`} onClose={onClose} onCancel={onClose}>
      <div className="a-modal-head"><h2>{title}</h2><button className="a-x" onClick={onClose} aria-label="Fechar">×</button></div>
      <div className="a-modal-body">{open && children}</div>
    </dialog>
  );
}

export function Confirm({ text, onYes, children, className = "a-btn" }: { text: string; onYes: () => void; children: React.ReactNode; className?: string }) {
  return <button type="button" className={className} onClick={() => { if (window.confirm(text)) onYes(); }}>{children}</button>;
}

export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <div className="a-pager">
      <button className="a-btn sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>Anterior</button>
      <span>Página {page + 1} de {pages} · {total} resultados</span>
      <button className="a-btn sm" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Seguinte</button>
    </div>
  );
}

/** Pequeno atraso para pesquisas enquanto se escreve. */
export function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}
