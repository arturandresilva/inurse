"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { callFunction, rpc, run, sb, type Row } from "@/lib/admin/sb";
import { dateTime, euro } from "@/lib/admin/format";
import { autoMap, FIELDS, findHeaderRow, linesFromTable, parseCsv, toImportRows, type Field, type ImportRow, type Mapping, type SourceLine } from "@/lib/admin/importer";
import { Alert, Badge, Card, Empty, Field as FormField, Loaded, PageHead, useLoad } from "@/components/admin/ui";

const STATUS: Record<string, [string, "ok" | "warn" | "muted" | "err" | "info"]> = {
  uploaded: ["Carregada", "muted"], mapping: ["A preparar", "muted"], review: ["Por rever", "warn"], applying: ["A aplicar", "info"],
  applied: ["Aplicada", "ok"], failed: ["Falhou", "err"], cancelled: ["Cancelada", "muted"],
};

type Sheet = { name: string; rows: string[][] };
type Stage =
  | { k: "pick" }
  | { k: "table"; file: File; sheets: Sheet[]; sheet: number; header: number; map: Mapping }
  | { k: "pdf"; file: File; path: string; pages: number; done: number; lines: SourceLine[]; notes: string[]; errors: string[] }
  | { k: "saving"; msg: string };

async function load() {
  const c = sb();
  const [jobs, suppliers] = await Promise.all([
    run(c.from("import_jobs").select("id,file_name,status,stats,created_at,applied_at,supplier_id,error").order("created_at", { ascending: false }).limit(30)),
    run(c.from("suppliers").select("id,name").eq("active", true).order("name")),
  ]);
  return { jobs, suppliers };
}

export default function Importer() {
  const s = useLoad(load);
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ k: "pick" });
  const [supplier, setSupplier] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setErr(null);
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    try {
      if (ext === "pdf") {
        setStage({ k: "saving", msg: "A enviar o PDF…" });
        const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.pdf`;
        const { error } = await sb().storage.from("importacoes").upload(path, file, { contentType: "application/pdf" });
        if (error) throw new Error(error.message);
        const info = await callFunction<{ pages: number; ai: boolean }>("importar-folha", { mode: "info", path });
        if (!info.ai) throw new Error("Para ler PDFs falta a chave da API Anthropic nos segredos do Supabase (ANTHROPIC_API_KEY). Entretanto podes exportar a tabela para Excel/CSV.");
        const st: Stage = { k: "pdf", file, path, pages: info.pages, done: 0, lines: [], notes: [], errors: [] };
        setStage(st);
        readPdf(st);
      } else if (["xlsx", "xls", "xlsm", "ods"].includes(ext)) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheets = wb.SheetNames.map((name) => ({ name, rows: (XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" }) as unknown[][]).map((r) => r.map((c) => String(c ?? ""))) }));
        const sheet = sheets.reduce((b, x, i) => (x.rows.length > sheets[b].rows.length ? i : b), 0);
        const header = findHeaderRow(sheets[sheet].rows);
        setStage({ k: "table", file, sheets, sheet, header, map: autoMap(sheets[sheet].rows[header] ?? []) });
      } else if (["csv", "txt", "tsv"].includes(ext)) {
        const rows = parseCsv(await file.text());
        const header = findHeaderRow(rows);
        setStage({ k: "table", file, sheets: [{ name: file.name, rows }], sheet: 0, header, map: autoMap(rows[header] ?? []) });
      } else throw new Error("Formato não suportado. Usa PDF, Excel (.xlsx) ou CSV.");
    } catch (e) { setErr((e as Error).message); setStage({ k: "pick" }); }
  }

  async function readPdf(st: Extract<Stage, { k: "pdf" }>) {
    // 3 páginas em paralelo; cada página é lida em separado pela IA
    let next = 1; const cur = { ...st };
    const worker = async () => {
      while (next <= st.pages) {
        const page = next++;
        try {
          const r = await callFunction<{ lines: SourceLine[]; notes: string | null; truncated: boolean }>("importar-folha", { mode: "pdf", path: st.path, page, label: st.file.name });
          cur.lines = [...cur.lines, ...r.lines.map((l) => ({ ...l, review: [l.review, r.truncated ? "página muito longa: confirmar se faltam linhas" : null].filter(Boolean).join("; ") || null, raw: { página: String(page) } }))];
          if (r.notes) cur.notes = [...cur.notes, `p.${page}: ${r.notes}`];
        } catch (e) { cur.errors = [...cur.errors, `p.${page}: ${(e as Error).message}`]; }
        cur.done++;
        setStage({ ...cur });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    // repõe a ordem das páginas
    cur.lines.sort((a, b) => Number(a.raw?.["página"]) - Number(b.raw?.["página"]));
    setStage({ ...cur });
  }

  const rows: ImportRow[] = useMemo(() => {
    if (stage.k === "table") return toImportRows(linesFromTable(stage.sheets[stage.sheet].rows, stage.header, stage.map));
    if (stage.k === "pdf") return toImportRows(stage.lines);
    return [];
  }, [stage]);

  async function create() {
    setErr(null);
    try {
      let supplierId = supplier;
      if (supplier === "__new") {
        if (!newSupplier.trim()) throw new Error("Escreve o nome do fornecedor.");
        supplierId = (await run<Row>(sb().from("suppliers").insert({ name: newSupplier.trim() }).select("id").single())).id;
      }
      if (!supplierId) throw new Error("Escolhe o fornecedor desta folha.");
      if (rows.length === 0) throw new Error("Não há linhas para importar. Confirma o mapeamento das colunas.");
      const file = stage.k === "table" || stage.k === "pdf" ? stage.file : null;
      setStage({ k: "saving", msg: `A guardar ${rows.length} linhas…` });
      const job = await run<Row>(sb().from("import_jobs").insert({
        supplier_id: supplierId, file_name: file?.name ?? "folha", status: "mapping",
        file_path: stage.k === "pdf" ? stage.path : null,
        mapping: stage.k === "table" ? stage.map : { origem: "pdf-ia" },
        options: { create_new: true, update_costs: true, new_status: "draft" },
      }).select("id").single());
      for (let i = 0; i < rows.length; i += 500) {
        setStage({ k: "saving", msg: `A guardar linhas ${i + 1}–${Math.min(i + 500, rows.length)} de ${rows.length}…` });
        await run(sb().from("import_rows").insert(rows.slice(i, i + 500).map((r) => ({ ...r, job_id: job.id }))));
      }
      setStage({ k: "saving", msg: "A comparar com o catálogo…" });
      await rpc("match_import_job", { p_job: job.id });
      await rpc("link_import_candidates", { p_job: job.id });
      router.push(`/admin/importar/${job.id}`);
    } catch (e) { setErr((e as Error).message); setStage({ k: "pick" }); }
  }

  return (
    <>
      <PageHead title="Importar folha de fornecedor" sub="Carrega a tabela de preços (PDF, Excel ou CSV). A loja lê os artigos, junta os tamanhos, liga aos produtos que já tens e calcula o preço com a tua margem ou o PVPR. Nada muda no catálogo antes de reveres e aplicares." />
      {err && <Alert tone="err">{err}</Alert>}
      <Loaded s={s}>
        {(d) => (
          <>
            <Card title="1. Fornecedor e ficheiro">
              <div className="a-form" style={{ marginBottom: 14 }}>
                <FormField label="Fornecedor">
                  <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                    <option value="">Escolher…</option>
                    {d.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    <option value="__new">+ Novo fornecedor</option>
                  </select>
                </FormField>
                {supplier === "__new" && <FormField label="Nome do novo fornecedor"><input value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} /></FormField>}
              </div>
              {stage.k === "pick" && (
                <div className={`a-drop${over ? " over" : ""}`} role="button" tabIndex={0}
                  onClick={() => fileRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}
                  onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                  onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]); }}>
                  <strong>Arrasta a folha para aqui ou clica para escolher</strong>
                  <span>PDF, Excel (.xlsx, .xls) ou CSV</span>
                  <input ref={fileRef} type="file" hidden accept=".pdf,.xlsx,.xls,.xlsm,.ods,.csv,.txt" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
                </div>
              )}
              {stage.k === "saving" && <div className="a-inline"><span className="a-spin" /> {stage.msg}</div>}
            </Card>

            {stage.k === "pdf" && (
              <Card title={`2. Leitura do PDF (${stage.done} de ${stage.pages} páginas)`} actions={<button className="a-btn sm" onClick={() => setStage({ k: "pick" })}>Recomeçar</button>}>
                <div style={{ height: 8, background: "var(--a-line)", borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
                  <div style={{ width: `${(stage.done / Math.max(1, stage.pages)) * 100}%`, height: "100%", background: "var(--a-act)", transition: "width .3s" }} />
                </div>
                <p className="a-muted">{stage.lines.length} linhas de artigos encontradas → {rows.length} tamanhos. A IA lê cada página; revês tudo no passo seguinte.</p>
                {stage.errors.map((e) => <Alert key={e} tone="err">{e}</Alert>)}
                {stage.notes.length > 0 && <details style={{ marginTop: 8 }}><summary>Condições comerciais encontradas</summary><ul>{stage.notes.map((n) => <li key={n}>{n}</li>)}</ul></details>}
              </Card>
            )}

            {stage.k === "table" && (
              <Card title="2. Colunas" actions={<button className="a-btn sm" onClick={() => setStage({ k: "pick" })}>Outro ficheiro</button>}>
                <div className="a-form" style={{ marginBottom: 12 }}>
                  {stage.sheets.length > 1 && <FormField label="Folha">
                    <select value={stage.sheet} onChange={(e) => {
                      const sheet = Number(e.target.value); const header = findHeaderRow(stage.sheets[sheet].rows);
                      setStage({ ...stage, sheet, header, map: autoMap(stage.sheets[sheet].rows[header] ?? []) });
                    }}>{stage.sheets.map((x, i) => <option key={x.name} value={i}>{x.name} ({x.rows.length} linhas)</option>)}</select>
                  </FormField>}
                  <FormField label="Linha dos cabeçalhos" hint={(stage.sheets[stage.sheet].rows[stage.header] ?? []).filter(Boolean).slice(0, 6).join(" · ")}>
                    <input type="number" min={1} value={stage.header + 1} onChange={(e) => {
                      const header = Math.max(0, Number(e.target.value) - 1);
                      setStage({ ...stage, header, map: autoMap(stage.sheets[stage.sheet].rows[header] ?? []) });
                    }} />
                  </FormField>
                </div>
                <p className="a-hint" style={{ marginBottom: 10 }}>Reconhecemos as colunas automaticamente. Corrige se alguma estiver errada.</p>
                <div className="a-form">
                  {FIELDS.map((f) => (
                    <FormField key={f.key} label={f.label} hint={f.hint}>
                      <select value={stage.map[f.key] ?? ""} onChange={(e) => {
                        const map = { ...stage.map }; if (e.target.value === "") delete map[f.key as Field]; else map[f.key as Field] = Number(e.target.value);
                        setStage({ ...stage, map });
                      }}>
                        <option value="">— não existe —</option>
                        {(stage.sheets[stage.sheet].rows[stage.header] ?? []).map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>)}
                      </select>
                    </FormField>
                  ))}
                </div>
                {stage.map.cost == null && stage.map.rrp == null && <Alert tone="warn">Escolhe pelo menos a coluna do custo ou do PVPR.</Alert>}
              </Card>
            )}

            {(stage.k === "table" || (stage.k === "pdf" && stage.done === stage.pages)) && (
              <Card title={`3. Pré-visualização: ${rows.length} tamanhos em ${new Set(rows.map((r) => r.model_ref ?? r.title)).size} artigos`}
                actions={<button className="a-btn primary" onClick={create} disabled={rows.length === 0}>Continuar para revisão</button>}>
                {rows.length === 0 ? <Empty title="Nenhuma linha reconhecida">Verifica a linha dos cabeçalhos e as colunas.</Empty> : (
                  <div className="a-table-wrap" style={{ maxHeight: 380, overflow: "auto" }}>
                    <table className="a-table">
                      <thead><tr><th>Ref.</th><th>Nome</th><th>Tam.</th><th className="num">Custo</th><th className="num">PVPR</th><th>IVA</th><th>Categoria</th><th>Avisos</th></tr></thead>
                      <tbody>{rows.slice(0, 60).map((r) => (
                        <tr key={r.row_index} className={r.issues.length ? "a-row-issue" : ""}>
                          <td>{r.model_ref}</td><td>{r.title}</td><td>{r.size}</td><td className="num">{euro(r.cost_cents)}</td><td className="num">{euro(r.rrp_cents)}</td>
                          <td>{r.vat_rate}%</td><td className="a-small">{r.category_path}</td><td className="a-small">{r.issues.join("; ")}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                    {rows.length > 60 && <p className="a-hint" style={{ padding: 8 }}>… e mais {rows.length - 60} tamanhos.</p>}
                  </div>
                )}
              </Card>
            )}

            <Card title="Importações anteriores" className="flush">
              {d.jobs.length === 0 ? <Empty title="Ainda não importaste nenhuma folha" /> : (
                <table className="a-table">
                  <thead><tr><th>Ficheiro</th><th>Fornecedor</th><th>Estado</th><th>Resumo</th><th>Data</th></tr></thead>
                  <tbody>{d.jobs.map((j) => (
                    <tr key={j.id}>
                      <td><Link href={`/admin/importar/${j.id}`}>{j.file_name}</Link></td>
                      <td>{d.suppliers.find((x) => x.id === j.supplier_id)?.name ?? "—"}</td>
                      <td><Badge tone={STATUS[j.status]?.[1]}>{STATUS[j.status]?.[0] ?? j.status}</Badge></td>
                      <td className="a-small">{j.stats?.linhas ? `${j.stats.linhas} linhas · ${j.stats.criar ?? 0} novas · ${j.stats.atualizar ?? 0} a atualizar` : "—"}
                        {j.stats?.produtos_criados != null && ` → ${j.stats.produtos_criados} produtos criados`}</td>
                      <td className="a-muted nowrap">{dateTime(j.applied_at ?? j.created_at)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Card>
          </>
        )}
      </Loaded>
    </>
  );
}
