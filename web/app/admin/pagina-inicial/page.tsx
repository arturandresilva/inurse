"use client";
import { useRef, useState } from "react";
import { run, sb, uploadPublic, type Row } from "@/lib/admin/sb";
import { dateTime } from "@/lib/admin/format";
import { Alert, Badge, Card, Confirm, Empty, Field, Loaded, PageHead, Tabs, useAction, useLoad } from "@/components/admin/ui";

// Página inicial: campanhas (sliders de imagens/vídeos com datas) e imagens do destaque normal e das categorias
const PLACE: Record<string, string> = { topo: "Destaque do topo", faixa: "Faixa a meio da página" };
const MAX = 50 * 1024 * 1024;
const toLocal = (d: string | null) => { if (!d) return ""; const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

function state(c: Row): [string, "ok" | "warn" | "muted"] {
  const now = Date.now();
  if (c.status !== "active") return ["Rascunho", "muted"];
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return ["Agendada", "warn"];
  if (c.ends_at && new Date(c.ends_at).getTime() <= now) return ["Terminou", "muted"];
  return ["No ar", "ok"];
}

async function upload(f: File, folder: string) {
  if (f.size > MAX) throw new Error(`“${f.name}” tem ${(f.size / 1048576).toFixed(0)} MB; o máximo é 50 MB. Para vídeos, exporta em MP4 (H.264) 1080p, sem som, até ~15 s.`);
  const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
  return uploadPublic("campanhas", `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`, f);
}
const isVideo = (f: File) => f.type.startsWith("video/");

export default function HomePageAdmin() {
  const [tab, setTab] = useState("campanhas");
  return (
    <>
      <PageHead title="Página inicial" sub="Campanhas com imagens ou vídeos que passam sozinhos, com datas de início e fim, e as imagens do destaque e das categorias." />
      <Tabs tabs={[["campanhas", "Campanhas e sliders"], ["imagens", "Imagens da página inicial"]]} value={tab} onChange={setTab} />
      {tab === "campanhas" ? <Campaigns /> : <Images />}
    </>
  );
}

/* ---------- Campanhas ---------- */
function Campaigns() {
  const s = useLoad(async () => (await run(sb().from("home_campaigns").select("*, home_slides(id)").order("position").order("created_at", { ascending: false }))) as Row[]);
  const [open, setOpen] = useState<string | null>(null);
  const { busy, act } = useAction();
  const create = () => act(async () => {
    const row = await run<Row>(sb().from("home_campaigns").insert({ name: "Nova campanha", placement: "topo", status: "draft" }).select("*").single());
    await s.reload(); setOpen(row.id);
  });

  return (
    <Loaded s={s}>
      {(rows) => {
        const live = rows.filter((c) => state(c)[0] === "No ar");
        const tops = live.filter((c) => c.placement === "topo");
        return (
          <>
            <Alert>Uma campanha no <strong>destaque do topo</strong> substitui o destaque normal enquanto estiver no ar; quando termina, volta o normal. As <strong>faixas</strong> aparecem a meio da página. Os textos são traduzidos automaticamente para EN/ES/FR pelo tradutor.</Alert>
            {tops.length > 1 && <Alert tone="warn">Há {tops.length} campanhas do topo no ar ao mesmo tempo; aparece só a primeira da lista (“{tops[0].name}”).</Alert>}
            <Card className="flush" title="Campanhas" actions={<button className="a-btn primary sm" disabled={busy} onClick={create}>Nova campanha</button>}>
              {!rows.length ? <Empty title="Sem campanhas">Cria uma campanha e adiciona imagens ou vídeos (por exemplo “Black Friday” ou “Nova coleção”).</Empty> : (
                <div className="a-table-wrap">
                  <table className="a-table">
                    <thead><tr><th>Nome</th><th>Onde</th><th>Período</th><th className="num">Diapositivos</th><th>Estado</th><th></th></tr></thead>
                    <tbody>
                      {rows.map((c) => {
                        const [l, t] = state(c);
                        return (
                          <tr key={c.id} className={open === c.id ? "on" : ""}>
                            <td><strong>{c.name}</strong></td>
                            <td>{PLACE[c.placement]}</td>
                            <td className="a-small">{c.starts_at || c.ends_at ? `${c.starts_at ? dateTime(c.starts_at) : "já"} → ${c.ends_at ? dateTime(c.ends_at) : "sem fim"}` : "Sempre"}</td>
                            <td className="num">{c.home_slides?.length ?? 0}</td>
                            <td><Badge tone={t}>{l}</Badge></td>
                            <td className="nowrap"><button className="a-btn sm" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? "Fechar" : "Editar"}</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            {open && rows.find((c) => c.id === open) && <Editor key={open} c={rows.find((c) => c.id === open)!} onChange={s.reload} onDeleted={() => { setOpen(null); s.reload(); }} />}
          </>
        );
      }}
    </Loaded>
  );
}

function Editor({ c, onChange, onDeleted }: { c: Row; onChange: () => void; onDeleted: () => void }) {
  const slidesL = useLoad(async () => (await run(sb().from("home_slides").select("*").eq("campaign_id", c.id).order("position"))) as Row[], [c.id]);
  const { busy, act } = useAction();
  const file = useRef<HTMLInputElement>(null);

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? "").trim();
    const row = { name: g("name") || "Campanha", placement: g("placement"), status: g("status"), starts_at: fromLocal(g("starts_at")), ends_at: fromLocal(g("ends_at")),
      interval_s: Math.min(30, Math.max(2, Number(g("interval_s")) || 6)), position: Number(g("position")) || 0, updated_at: new Date().toISOString() };
    act(async () => {
      if (row.starts_at && row.ends_at && row.ends_at <= row.starts_at) throw new Error("A data de fim tem de ser depois da data de início.");
      if (row.status === "active" && !(slidesL.data ?? []).length) throw new Error("Adiciona pelo menos uma imagem ou vídeo antes de pôr a campanha no ar.");
      await run(sb().from("home_campaigns").update(row).eq("id", c.id)); onChange();
    }, row.status === "active" ? "Campanha guardada e ativa (aparece na loja dentro das datas)." : "Campanha guardada como rascunho.");
  }

  const addSlides = (files: FileList | null) => act(async () => {
    if (!files?.length) return;
    let pos = (slidesL.data ?? []).length;
    for (const f of Array.from(files)) {
      const url = await upload(f, c.id);
      await run(sb().from("home_slides").insert({ campaign_id: c.id, media_url: url, kind: isVideo(f) ? "video" : "image", position: pos++ }));
    }
    await slidesL.reload(); onChange();
  }, "Adicionado. Escreve os textos e o botão em cada diapositivo (opcional).");

  const move = (list: Row[], k: number, d: number) => act(async () => {
    const n = [...list]; const [x] = n.splice(k, 1); n.splice(k + d, 0, x);
    for (const [i, sl] of n.entries()) await run(sb().from("home_slides").update({ position: i }).eq("id", sl.id));
    await slidesL.reload();
  });

  return (
    <Card title={`Editar: ${c.name}`} actions={<Confirm className="a-btn sm danger" text={`Apagar a campanha “${c.name}” e todos os diapositivos?`} onYes={() => act(async () => { await run(sb().from("home_campaigns").delete().eq("id", c.id)); onDeleted(); }, "Campanha apagada.")}>Apagar campanha</Confirm>}>
      <form onSubmit={save}>
        <div className="a-grid-2">
          <Field label="Nome (interno)"><input name="name" defaultValue={c.name} required /></Field>
          <Field label="Onde aparece">
            <select name="placement" defaultValue={c.placement}>{Object.entries(PLACE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
          <Field label="Começa" hint="Vazio = já."><input name="starts_at" type="datetime-local" defaultValue={toLocal(c.starts_at)} /></Field>
          <Field label="Acaba" hint="Vazio = sem fim."><input name="ends_at" type="datetime-local" defaultValue={toLocal(c.ends_at)} /></Field>
          <Field label="Segundos por diapositivo"><input name="interval_s" type="number" min={2} max={30} defaultValue={c.interval_s} /></Field>
          <Field label="Ordem" hint="Menor aparece primeiro (faixas e várias campanhas)."><input name="position" type="number" defaultValue={c.position} /></Field>
          <Field label="Estado">
            <select name="status" defaultValue={c.status}><option value="draft">Rascunho (não aparece)</option><option value="active">Ativa (aparece nas datas)</option></select>
          </Field>
        </div>
        <div className="a-formfoot"><button className="a-btn primary" disabled={busy}>Guardar campanha</button></div>
      </form>

      <h3 className="a-h3" style={{ marginTop: 24 }}>Diapositivos</h3>
      <p className="a-hint">Imagens: {c.placement === "topo" ? "1920 × 800 px" : "1600 × 500 px"} (JPG/WebP, até ~500 KB). Telemóvel (opcional): 900 × 1200 px. Vídeos: MP4 1080p, sem som, 5–15 s, idealmente até 10 MB. A loja escurece ou clareia a imagem atrás do texto para se ler bem.</p>
      <input ref={file} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={(e) => { addSlides(e.target.files); e.target.value = ""; }} />
      <button className="a-btn" disabled={busy} onClick={() => file.current?.click()} style={{ margin: "8px 0 14px" }}>{busy ? "A enviar…" : "Adicionar imagens ou vídeos"}</button>
      <Loaded s={slidesL}>
        {(list) => !list.length ? <Empty title="Sem diapositivos">Adiciona uma ou mais imagens ou vídeos.</Empty> : (
          <div className="a-slides">
            {list.map((sl, k) => <SlideEditor key={sl.id} sl={sl} folder={c.id} first={k === 0} last={k === list.length - 1} onMove={(d) => move(list, k, d)} onChange={slidesL.reload} />)}
          </div>
        )}
      </Loaded>
    </Card>
  );
}

function SlideEditor({ sl, folder, first, last, onMove, onChange }: { sl: Row; folder: string; first: boolean; last: boolean; onMove: (d: number) => void; onChange: () => void }) {
  const [v, setV] = useState<Row>(sl);
  const [dirty, setDirty] = useState(false);
  const { busy, act } = useAction();
  const media = useRef<HTMLInputElement>(null), mobile = useRef<HTMLInputElement>(null), poster = useRef<HTMLInputElement>(null);
  const set = (k: string, x: unknown) => { setV((o) => ({ ...o, [k]: x })); setDirty(true); };
  const pick = (k: "media_url" | "mobile_url" | "poster_url") => async (files: FileList | null) => {
    const f = files?.[0]; if (!f) return;
    await act(async () => {
      if (k !== "media_url" && isVideo(f)) throw new Error("Aqui só imagens.");
      const url = await upload(f, folder);
      const patch: Row = { [k]: url }; if (k === "media_url") patch.kind = isVideo(f) ? "video" : "image";
      await run(sb().from("home_slides").update(patch).eq("id", sl.id)); setV((o) => ({ ...o, ...patch })); onChange();
    }, "Ficheiro trocado.");
  };
  const save = () => act(async () => {
    const t = (x: unknown) => (String(x ?? "").trim() || null);
    if (t(v.cta_label) && !t(v.cta_url)) throw new Error("O botão precisa de um link (ex.: /c/calcado/socas ou /loja).");
    await run(sb().from("home_slides").update({ eyebrow: t(v.eyebrow), title: t(v.title), body: t(v.body), cta_label: t(v.cta_label), cta_url: t(v.cta_url), theme: v.theme, align: v.align }).eq("id", sl.id));
    setDirty(false); onChange();
  }, "Diapositivo guardado.");

  return (
    <div className="a-slide">
      <div className={`a-slide-prev theme-${v.theme} al-${v.align}`}>
        {v.kind === "video" ? <video src={v.media_url} poster={v.poster_url ?? undefined} muted loop autoPlay playsInline /> : <img src={v.media_url} alt="" />}
        <div className="a-slide-txt">{v.eyebrow && <small>{v.eyebrow}</small>}{v.title && <strong>{v.title}</strong>}{v.body && <span>{v.body}</span>}{v.cta_label && <em>{v.cta_label}</em>}</div>
        <Badge tone="info">{v.kind === "video" ? "Vídeo" : "Imagem"}</Badge>
      </div>
      <div>
        <div className="a-grid-2">
          <Field label="Texto pequeno (por cima)"><input value={v.eyebrow ?? ""} onChange={(e) => set("eyebrow", e.target.value)} placeholder="Nova coleção" /></Field>
          <Field label="Título"><input value={v.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Socas para turnos longos" /></Field>
          <Field label="Texto" wide><textarea rows={2} value={v.body ?? ""} onChange={(e) => set("body", e.target.value)} /></Field>
          <Field label="Botão (texto)"><input value={v.cta_label ?? ""} onChange={(e) => set("cta_label", e.target.value)} placeholder="Ver modelos" /></Field>
          <Field label="Link" hint="Toda a imagem fica clicável. Ex.: /c/calcado/socas, /loja, /produto/…"><input value={v.cta_url ?? ""} onChange={(e) => set("cta_url", e.target.value)} placeholder="/loja" /></Field>
          <Field label="Cor do texto">
            <select value={v.theme} onChange={(e) => set("theme", e.target.value)}><option value="dark">Branco (para imagens escuras)</option><option value="light">Escuro (para imagens claras)</option></select>
          </Field>
          <Field label="Posição do texto">
            <select value={v.align} onChange={(e) => set("align", e.target.value)}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select>
          </Field>
        </div>
        <input ref={media} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={(e) => { pick("media_url")(e.target.files); e.target.value = ""; }} />
        <input ref={mobile} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => { pick("mobile_url")(e.target.files); e.target.value = ""; }} />
        <input ref={poster} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => { pick("poster_url")(e.target.files); e.target.value = ""; }} />
        <div className="a-slide-actions">
          <button className="a-btn primary sm" disabled={busy || !dirty} onClick={save}>Guardar textos</button>
          <button className="a-btn sm" disabled={busy} onClick={() => media.current?.click()}>Trocar imagem/vídeo</button>
          {v.kind === "image" && <button className="a-btn sm" disabled={busy} onClick={() => mobile.current?.click()}>{v.mobile_url ? "Trocar imagem de telemóvel" : "Imagem para telemóvel"}</button>}
          {v.kind === "image" && v.mobile_url && <button className="a-btn sm" disabled={busy} onClick={() => act(async () => { await run(sb().from("home_slides").update({ mobile_url: null }).eq("id", sl.id)); setV((o) => ({ ...o, mobile_url: null })); })}>Sem imagem de telemóvel</button>}
          {v.kind === "video" && <button className="a-btn sm" disabled={busy} onClick={() => poster.current?.click()}>{v.poster_url ? "Trocar capa do vídeo" : "Capa do vídeo"}</button>}
          <button className="a-btn sm" disabled={busy || first} onClick={() => onMove(-1)} aria-label="Subir">↑</button>
          <button className="a-btn sm" disabled={busy || last} onClick={() => onMove(1)} aria-label="Descer">↓</button>
          <Confirm className="a-btn sm danger" text="Remover este diapositivo?" onYes={() => act(async () => { await run(sb().from("home_slides").delete().eq("id", sl.id)); onChange(); }, "Diapositivo removido.")}>Remover</Confirm>
        </div>
      </div>
    </div>
  );
}

/* ---------- Imagens do destaque normal e das categorias ---------- */
function Images() {
  const s = useLoad(async () => {
    const [set, cats, prods] = await Promise.all([
      run<Row | null>(sb().from("settings").select("value").eq("key", "public.home").maybeSingle()),
      run(sb().from("categories").select("id,name,path,parent_id").order("position")),
      run(sb().from("products").select("product_images(url,position)").eq("status", "active").order("featured", { ascending: false }).limit(3)),
    ]);
    return { value: (set?.value ?? { hero_images: [], tiles: {} }) as Row, cats: cats as Row[], auto: (prods as Row[]).map((p) => [...(p.product_images ?? [])].sort((a: Row, b: Row) => a.position - b.position)[0]?.url).filter(Boolean) as string[] };
  });
  const { busy, act } = useAction();
  const store = (value: Row) => act(async () => {
    await run(sb().from("settings").update({ value, updated_at: new Date().toISOString() }).eq("key", "public.home")); await s.reload();
  }, "Guardado. Já aparece na loja.");
  const pickFile = (cb: (url: string) => void) => {
    const i = document.createElement("input"); i.type = "file"; i.accept = "image/jpeg,image/png,image/webp";
    i.onchange = () => { const f = i.files?.[0]; if (f) act(async () => cb(await upload(f, "inicio"))); };
    i.click();
  };

  return (
    <Loaded s={s}>
      {({ value, cats }) => {
                const tiles: Record<string, string> = value.tiles ?? {};
        const tileCats = [...cats.filter((c) => c.path.startsWith("CALÇADO>") && c.path.split(">").length === 2 && !c.path.includes("COMPRAR POR")), ...cats.filter((c) => !c.parent_id && c.path !== "CALÇADO")].slice(0, 4);
        return (
          <>
            <Card title="Destaque normal (quando não há campanha no topo)">
              <p className="a-hint">À direita do título aparecem modelos 3D feitos de partículas de luz — o coração do símbolo iNurse, uma soca e um collant — que rodam e se transformam uns nos outros. Para mostrar fotos ou vídeo no topo, cria uma campanha em “Topo da página”.</p>
            </Card>
            <Card title="Imagens das categorias (“Compra por categoria”)">
              <p className="a-hint">Sem imagem escolhida, a loja usa a foto de um produto dessa categoria. Formato ao alto ou quadrado, ~800 × 1000 px.</p>
              {!tileCats.length ? <Empty title="Sem categorias">Cria as categorias primeiro.</Empty> : (
                <div className="a-img-slots">
                  {tileCats.map((c) => (
                    <div key={c.id} className="a-img-slot">
                      {tiles[c.id] ? <img src={tiles[c.id]} alt="" /> : <span>Automática</span>}
                      <small>{c.name.charAt(0) + c.name.slice(1).toLowerCase()}</small>
                      <div>
                        <button className="a-btn sm" disabled={busy} onClick={() => pickFile((u) => store({ ...value, tiles: { ...tiles, [c.id]: u } }))}>{tiles[c.id] ? "Trocar" : "Escolher"}</button>
                        {tiles[c.id] && <button className="a-btn sm" disabled={busy} onClick={() => { const n = { ...tiles }; delete n[c.id]; store({ ...value, tiles: n }); }}>Remover</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        );
      }}
    </Loaded>
  );
}
