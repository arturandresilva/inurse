"use client";
import { useRef, useState } from "react";
import { rpc, run, sb, uploadPublic, type Row } from "@/lib/admin/sb";
import { dateTime } from "@/lib/admin/format";
import { Alert, Badge, Card, Empty, Loaded, PageHead, Pager, Tabs, toast, useAction, useDebounced, useLoad } from "@/components/admin/ui";

// Multimédia: todas as imagens e vídeos da loja (fotos dos produtos e campanhas), com onde estão a ser usados.
// Permite adicionar, substituir (o endereço mantém-se) e apagar.
const BUCKETS: Record<string, { label: string; max: number; accept: string; hint: string }> = {
  produtos: { label: "Imagens dos produtos", max: 5 * 1048576, accept: "image/jpeg,image/png,image/webp,image/gif", hint: "Imagens até 5 MB (JPG, PNG, WebP). Fotos de produto: quadradas, fundo branco, ~1200 × 1200 px." },
  campanhas: { label: "Campanhas e página inicial", max: 50 * 1048576, accept: "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm", hint: "Imagens e vídeos até 50 MB. Vídeos em MP4 (H.264) 1080p, sem som, até ~15 s." },
};
const SIZE = 60;
const kb = (n: number | null) => (n == null ? "—" : n >= 1048576 ? `${(n / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const isVideo = (r: Row) => String(r.type ?? "").startsWith("video/") || /\.(mp4|webm)$/i.test(r.name);

export default function MediaAdmin() {
  const [bucket, setBucket] = useState("produtos");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const dq = useDebounced(q);
  const { busy, act } = useAction();
  const input = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<Row | null>(null);
  const cfg = BUCKETS[bucket];
  const s = useLoad(() => rpc<{ total: number; items: Row[] }>("media_list", { p_bucket: bucket, p_q: dq || null, p_limit: SIZE, p_offset: page * SIZE }), [bucket, dq, page]);
  const url = (name: string) => sb().storage.from(bucket).getPublicUrl(name).data.publicUrl;

  const check = (f: File) => {
    if (f.size > cfg.max) throw new Error(`“${f.name}” tem ${kb(f.size)}; o máximo aqui é ${kb(cfg.max)}.`);
    if (!cfg.accept.split(",").includes(f.type)) throw new Error(`“${f.name}”: formato não aceite aqui.`);
  };
  const add = (files: FileList | null) => files?.length && act(async () => {
    for (const f of Array.from(files)) {
      check(f);
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const base = f.name.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 50) || "ficheiro";
      await uploadPublic(bucket, `biblioteca/${Date.now().toString(36)}-${base}.${ext}`, f);
    }
    setPage(0); s.reload();
  }, files.length === 1 ? "Ficheiro adicionado" : `${files.length} ficheiros adicionados`);
  const replace = (r: Row, f: File | undefined) => f && act(async () => {
    check(f);
    if (isVideo(r) !== f.type.startsWith("video/")) throw new Error("Substitui uma imagem por outra imagem (ou um vídeo por outro vídeo).");
    await uploadPublic(bucket, r.name, f);
    s.reload();
  }, "Substituído. Pode demorar alguns minutos até a versão nova aparecer em todo o lado.");
  const remove = (r: Row) => {
    const used: string[] = r.used ?? [];
    const msg = used.length
      ? `Este ficheiro está a ser usado em:\n• ${used.join("\n• ")}\n\nSe o apagares, desaparece desses sítios (nos produtos, a foto é retirada). Apagar mesmo assim?`
      : "Apagar este ficheiro? Não dá para desfazer.";
    if (!window.confirm(msg)) return;
    act(async () => {
      const { error } = await sb().storage.from(bucket).remove([r.name]);
      if (error) throw new Error(error.message);
      if (bucket === "produtos") await run(sb().from("product_images").delete().like("url", `%/${bucket}/${r.name}`));
      s.reload();
    }, "Ficheiro apagado");
  };
  const copy = (r: Row) => navigator.clipboard.writeText(url(r.name)).then(() => toast("Endereço copiado"), () => toast("Não foi possível copiar", "err"));

  return (
    <>
      <PageHead title="Multimédia" sub="Todas as imagens e vídeos do site: vê onde estão a ser usados, adiciona novos, substitui ou apaga.">
        <button className="a-btn primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? "A enviar…" : "Adicionar ficheiros"}</button>
        <input ref={input} type="file" multiple accept={cfg.accept} hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <input ref={replaceInput} type="file" accept={cfg.accept} hidden onChange={(e) => { if (replacing) replace(replacing, e.target.files?.[0]); e.target.value = ""; setReplacing(null); }} />
      </PageHead>
      <Tabs tabs={Object.entries(BUCKETS).map(([k, v]) => [k, v.label])} value={bucket} onChange={(v) => { setBucket(v); setPage(0); setQ(""); }} />
      <p className="a-hint">{cfg.hint} Para pôr uma foto num produto, abre o produto em Produtos; aqui ficam todas para consultar e gerir.</p>
      <div className="a-toolbar"><input type="search" placeholder="Procurar pelo nome do ficheiro" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Procurar" /></div>
      <Loaded s={s}>
        {({ total, items }) => !items.length ? <Card><Empty title={dq ? "Nada encontrado" : "Ainda não há ficheiros"}>{dq ? "Experimenta outro nome." : "Usa “Adicionar ficheiros” para enviar imagens ou vídeos."}</Empty></Card> : (
          <>
            <div className="a-media">
              {items.map((r) => {
                const used: string[] = r.used ?? [];
                const src = url(r.name);
                return (
                  <figure key={r.name} className="a-media-item">
                    <a href={src} target="_blank" rel="noreferrer" className="a-media-thumb">
                      {isVideo(r) ? <video src={src} muted preload="metadata" /> : <img src={src} alt="" loading="lazy" />}
                      {isVideo(r) && <span className="a-media-kind">Vídeo</span>}
                    </a>
                    <figcaption>
                      <b title={r.name}>{r.name.split("/").pop()}</b>
                      <small>{kb(r.size)} · {dateTime(r.updated_at ?? r.created_at)}</small>
                      <div className="a-media-used">{used.length ? used.slice(0, 3).map((u) => <Badge key={u} tone="ok">{u}</Badge>) : <Badge>Sem uso</Badge>}{used.length > 3 && <Badge>+{used.length - 3}</Badge>}</div>
                      <div className="a-media-actions">
                        <button className="a-btn sm" onClick={() => copy(r)}>Copiar endereço</button>
                        <button className="a-btn sm" disabled={busy} onClick={() => { setReplacing(r); replaceInput.current?.click(); }}>Substituir</button>
                        <button className="a-btn sm danger" disabled={busy} onClick={() => remove(r)}>Apagar</button>
                      </div>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
            <Pager page={page} size={SIZE} total={total} onPage={setPage} />
          </>
        )}
      </Loaded>
      <Alert tone="info">Ao substituir, o ficheiro mantém o mesmo endereço, por isso os produtos e campanhas que o usam passam a mostrar o novo (o browser pode guardar o antigo durante alguns minutos).</Alert>
    </>
  );
}
