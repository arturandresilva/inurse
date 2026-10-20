"use client";
import { useCallback, useRef, useState } from "react";
import { rpc, sb, type Row } from "@/lib/admin/sb";
import { Empty, Modal, Pager, Tabs, toast, useDebounced, useLoad } from "@/components/admin/ui";

// Escolher uma imagem (ou vídeo) da galeria do site — fotos dos produtos e ficheiros das campanhas — ou enviar do computador.
// Uso: const picker = useMediaPicker(upload); … await picker.pick({ video: true }) → { url, kind } | null; e pôr {picker.node} na página.
export type Picked = { url: string; kind: "image" | "video" };
type Opts = { video?: boolean; title?: string };
const SIZE = 30;
const isVideoName = (n: string, t?: string) => String(t ?? "").startsWith("video/") || /\.(mp4|webm)$/i.test(n);

export function useMediaPicker(upload: (f: File) => Promise<string>) {
  const [state, setState] = useState<{ opts: Opts; resolve: (p: Picked | null) => void } | null>(null);
  const pick = useCallback((opts: Opts = {}) => new Promise<Picked | null>((resolve) => setState({ opts, resolve })), []);
  const done = (p: Picked | null) => { state?.resolve(p); setState(null); };
  const node = <MediaPickerModal open={!!state} opts={state?.opts ?? {}} upload={upload} onDone={done} />;
  return { pick, node };
}

function MediaPickerModal({ open, opts, upload, onDone }: { open: boolean; opts: Opts; upload: (f: File) => Promise<string>; onDone: (p: Picked | null) => void }) {
  const [bucket, setBucket] = useState("produtos");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const dq = useDebounced(q);
  const file = useRef<HTMLInputElement>(null);
  const s = useLoad(async () => (open ? rpc<{ total: number; items: Row[] }>("media_list", { p_bucket: bucket, p_q: dq || null, p_limit: SIZE, p_offset: page * SIZE }) : { total: 0, items: [] }), [open, bucket, dq, page]);
  const url = (b: string, name: string) => sb().storage.from(b).getPublicUrl(name).data.publicUrl;
  const accept = opts.video ? "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" : "image/jpeg,image/png,image/webp,image/gif";
  const items = (s.data?.items ?? []).filter((r) => opts.video || !isVideoName(r.name, r.type));
  const send = async (f?: File) => {
    if (!f) return;
    if (!opts.video && f.type.startsWith("video/")) { toast("Aqui só imagens.", "err"); return; }
    setBusy(true);
    try { onDone({ url: await upload(f), kind: f.type.startsWith("video/") ? "video" : "image" }); }
    catch (e) { toast((e as Error).message, "err"); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={opts.title ?? (opts.video ? "Escolher imagem ou vídeo" : "Escolher imagem")} open={open} onClose={() => onDone(null)} wide>
      <div className="a-picker-head">
        <Tabs tabs={[["produtos", "Fotos dos produtos"], ["campanhas", "Campanhas e página inicial"]]} value={bucket} onChange={(v) => { setBucket(v); setPage(0); }} />
        <div className="a-toolbar">
          <input type="search" placeholder="Procurar pelo nome do ficheiro" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Procurar" />
          <button className="a-btn" disabled={busy} onClick={() => file.current?.click()}>{busy ? "A enviar…" : "Enviar do computador"}</button>
          <input ref={file} type="file" hidden accept={accept} onChange={(e) => { send(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>
      {s.loading && !s.data ? <p className="a-hint">A carregar…</p> : !items.length ? <Empty title="Nada aqui">{dq ? "Experimenta outro nome." : "Usa “Enviar do computador”."}</Empty> : (
        <div className="a-picker">
          {items.map((r) => {
            const u = url(bucket, r.name), vid = isVideoName(r.name, r.type);
            return (
              <button key={r.name} type="button" className="a-picker-item" onClick={() => onDone({ url: u, kind: vid ? "video" : "image" })} title={r.name}>
                {vid ? <video src={u} muted preload="metadata" /> : <img src={u} alt="" loading="lazy" />}
                <span>{r.name.split("/").pop()}</span>
                {(r.used ?? []).length > 0 && <small>{(r.used as string[])[0]}</small>}
              </button>
            );
          })}
        </div>
      )}
      <Pager page={page} size={SIZE} total={s.data?.total ?? 0} onPage={setPage} />
    </Modal>
  );
}
