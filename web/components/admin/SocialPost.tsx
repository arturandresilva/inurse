"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { uploadPublic, type Row } from "@/lib/admin/sb";
import { Field, Modal, toast } from "@/components/admin/ui";

// Publicação para redes sociais: a imagem é desenhada aqui (modelos da marca + foto do produto),
// com o texto e as hashtags; pré-visualização como no Instagram, Stories/Reels e TikTok.
export type PostContent = {
  caption?: string; hashtags?: string[] | string; headline?: string; subline?: string; badge?: string;
  product_id?: string; template?: "produto" | "promo" | "dica"; format?: "quadrado" | "retrato" | "story"; image_url?: string; image_brief?: string;
};
const SIZES = { quadrado: [1080, 1080], retrato: [1080, 1350], story: [1080, 1920] } as const;
const C = { ink: "#0F2F4A", mint: "#48BBAE", mintD: "#2A8378", coral: "#F27C79", sky: "#D7EAF7", soft: "#5B6B7F", tint: "#E3F4F1" };

const tagsOf = (h: PostContent["hashtags"]) => (Array.isArray(h) ? h : String(h ?? "").split(/[\s,]+/)).map((t) => t.trim()).filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`));
const loadOne = (src: string, cors: boolean) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); if (cors) i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
// fotos de outro domínio passam pelo otimizador de imagens do site (mesma origem), para o canvas poder ser exportado
const load = async (src: string) => {
  if (!src) return null;
  if (!/^https?:/.test(src) || src.startsWith(location.origin)) return loadOne(src, false);
  return (await loadOne(`/_next/image?url=${encodeURIComponent(src)}&w=1080&q=90`, false)) ?? loadOne(src, true);
};

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/).filter(Boolean), lines: string[] = []; let line = "";
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function fitImage(g: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const k = Math.min(w / im.naturalWidth, h / im.naturalHeight), iw = im.naturalWidth * k, ih = im.naturalHeight * k;
  g.drawImage(im, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

// desenha a publicação num canvas com o tamanho do formato
export function drawPost(cv: HTMLCanvasElement, c: PostContent, a: { photo: HTMLImageElement | null; logo: HTMLImageElement | null; logoW: HTMLImageElement | null }) {
  const [W, H] = SIZES[c.format ?? "quadrado"];
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d")!;
  const font = getComputedStyle(document.body).fontFamily || "Inter, Arial, sans-serif";
  const F = (w: number, s: number) => `${w} ${s}px ${font}`;
  const tall = H > W * 1.4, pad = 84;
  const head = (c.headline || "").trim(), sub = (c.subline || "").trim(), badge = (c.badge || "").trim();
  const tpl = c.template ?? "produto";
  g.clearRect(0, 0, W, H);

  if (tpl === "promo") {
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#13385A"); bg.addColorStop(1, "#0A2236");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(72,187,174,.16)"; g.beginPath(); g.arc(W * 0.85, H * 0.18, W * 0.42, 0, 7); g.fill();
    g.fillStyle = "rgba(242,124,121,.14)"; g.beginPath(); g.arc(W * 0.05, H * 0.95, W * 0.38, 0, 7); g.fill();
    const ph = tall ? H * 0.42 : H * 0.48, py = tall ? H * 0.36 : H * 0.36;
    g.fillStyle = "#fff"; rr(g, W * 0.12, py, W * 0.76, ph, 48); g.fill();
    if (a.photo) fitImage(g, a.photo, W * 0.16, py + 30, W * 0.68, ph - 60);
    g.fillStyle = "#fff"; g.font = F(800, tall ? 92 : 78); let y = tall ? 250 : 170;
    for (const l of wrap(g, head || "Campanha iNurse", W - pad * 2).slice(0, 3)) { g.fillText(l, pad, y); y += tall ? 100 : 86; }
    if (sub) { g.fillStyle = "rgba(255,255,255,.82)"; g.font = F(500, tall ? 40 : 34); for (const l of wrap(g, sub, W - pad * 2).slice(0, 2)) { g.fillText(l, pad, y + 6); y += 46; } }
    if (badge) { g.font = F(800, 54); const bw = g.measureText(badge).width + 80; g.fillStyle = C.coral; rr(g, W - pad - bw, py - 54, bw, 100, 50); g.fill(); g.fillStyle = "#fff"; g.fillText(badge, W - pad - bw + 40, py + 14); }
    if (a.logoW) { const lw = 300, lh = lw * a.logoW.naturalHeight / a.logoW.naturalWidth; g.drawImage(a.logoW, pad, H - pad - lh, lw, lh); }
    g.fillStyle = "rgba(255,255,255,.7)"; g.font = F(600, 30); g.textAlign = "right"; g.fillText("inurse.pt", W - pad, H - pad - 6); g.textAlign = "left";
    return;
  }

  if (tpl === "dica") {
    g.fillStyle = C.tint; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(72,187,174,.22)"; g.beginPath(); g.arc(W * 0.92, H * 0.08, W * 0.3, 0, 7); g.fill();
    g.font = F(800, 30); const label = "DICA iNURSE"; const lw0 = g.measureText(label).width + 56;
    g.fillStyle = C.mintD; rr(g, pad, pad + 10, lw0, 64, 32); g.fill(); g.fillStyle = "#fff"; g.fillText(label, pad + 28, pad + 54);
    g.fillStyle = C.coral; g.font = F(800, 200); g.fillText("“", pad - 10, pad + 300);
    g.fillStyle = C.ink; g.font = F(800, tall ? 76 : 64); let y = pad + 300;
    for (const l of wrap(g, head || "Uma dica para o teu turno", W - pad * 2).slice(0, 5)) { g.fillText(l, pad, y); y += tall ? 88 : 76; }
    if (sub) { g.fillStyle = C.soft; g.font = F(500, 36); y += 10; for (const l of wrap(g, sub, W - pad * 2 - (a.photo ? 280 : 0)).slice(0, 4)) { g.fillText(l, pad, y); y += 48; } }
    if (a.photo) { const s = tall ? 420 : 300; g.fillStyle = "#fff"; rr(g, W - pad - s, H - pad - s - 40, s, s, 40); g.fill(); fitImage(g, a.photo, W - pad - s + 24, H - pad - s - 16, s - 48, s - 48); }
    if (a.logo) { const lw = 280, lh = lw * a.logo.naturalHeight / a.logo.naturalWidth; g.drawImage(a.logo, pad, H - pad - lh, lw, lh); }
    return;
  }

  // produto
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#F5FAFC"); bg.addColorStop(1, C.sky);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(72,187,174,.18)"; g.beginPath(); g.arc(W * 0.78, H * (tall ? 0.55 : 0.62), W * 0.42, 0, 7); g.fill();
  g.fillStyle = C.ink; g.font = F(800, tall ? 88 : 74); let y = tall ? 240 : 170;
  for (const l of wrap(g, head || "Conforto para turnos longos", W - pad * 2).slice(0, 3)) { g.fillText(l, pad, y); y += tall ? 96 : 82; }
  if (sub) { g.fillStyle = C.soft; g.font = F(500, tall ? 40 : 34); for (const l of wrap(g, sub, W - pad * 2).slice(0, 2)) { g.fillText(l, pad, y + 4); y += 46; } }
  const top = y + 30, bottom = H - pad - 110, cardH = Math.max(200, bottom - top);
  g.fillStyle = "#fff"; g.shadowColor = "rgba(15,47,74,.14)"; g.shadowBlur = 40; g.shadowOffsetY = 18;
  rr(g, pad, top, W - pad * 2, cardH, 44); g.fill(); g.shadowColor = "transparent";
  if (a.photo) fitImage(g, a.photo, pad + 40, top + 30, W - pad * 2 - 80, cardH - 60);
  if (badge) { g.font = F(800, 44); const bw = g.measureText(badge).width + 64; g.fillStyle = C.coral; rr(g, W - pad - bw - 24, top + 24, bw, 84, 42); g.fill(); g.fillStyle = "#fff"; g.fillText(badge, W - pad - bw + 8, top + 81); }
  if (a.logo) { const lw = 280, lh = lw * a.logo.naturalHeight / a.logo.naturalWidth; g.drawImage(a.logo, pad, H - pad - lh, lw, lh); }
  g.fillStyle = C.mintD; g.font = F(700, 30); g.textAlign = "right"; g.fillText("inurse.pt", W - pad, H - pad - 6); g.textAlign = "left";
}

type Props = {
  channel: string; content: PostContent; products: Row[]; handle?: string;
  actions: (h: { content: PostContent; saveImage: () => Promise<PostContent>; busy: boolean; setBusy: (b: boolean) => void }) => React.ReactNode;
};
export default function SocialPost({ channel, content, products, handle = "inurse.pt", actions }: Props) {
  const [c, setC] = useState<PostContent>(() => ({ template: "produto", format: channel === "tiktok" ? "story" : "quadrado", ...content, hashtags: tagsOf(content.hashtags) }));
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<"" | "feed" | "story" | "tiktok">("");
  const [dataUrl, setDataUrl] = useState("");
  const cv = useRef<HTMLCanvasElement>(null);
  const prod = useMemo(() => products.find((p) => p.id === c.product_id), [products, c.product_id]);
  const photoUrl = prod?.image ?? "";
  const set = (k: keyof PostContent, v: unknown) => setC((o) => ({ ...o, [k]: v }));

  useEffect(() => {
    let alive = true;
    (async () => {
      const [photo, logo, logoW] = await Promise.all([load(photoUrl), load("/marca/inurse-logo.svg"), load("/marca/inurse-logo-fundo-escuro.svg")]);
      await document.fonts?.ready;
      if (!alive || !cv.current) return;
      drawPost(cv.current, c, { photo, logo, logoW });
      try { setDataUrl(cv.current.toDataURL("image/png")); } catch { setDataUrl(""); }
    })();
    return () => { alive = false; };
  }, [c, photoUrl]);

  const saveImage = async (): Promise<PostContent> => {
    if (!cv.current) throw new Error("A imagem ainda não está pronta.");
    const blob = await new Promise<Blob | null>((r) => { try { cv.current!.toBlob(r, "image/jpeg", 0.92); } catch { r(null); } });
    if (!blob) throw new Error("Não foi possível criar a imagem (a foto do produto não deixou ser usada). Escolhe outro produto.");
    const url = await uploadPublic("campanhas", `redes/${Date.now().toString(36)}-${channel}.jpg`, new File([blob], "post.jpg", { type: "image/jpeg" }));
    const next = { ...c, image_url: url };
    setC(next);
    return next;
  };
  const caption = String(c.caption ?? "");
  const tags = tagsOf(c.hashtags);
  const copy = () => navigator.clipboard.writeText([caption, tags.join(" ")].filter(Boolean).join("\n\n")).then(() => toast("Texto copiado"));
  const download = () => { if (!dataUrl) return; const a = document.createElement("a"); a.href = dataUrl; a.download = `inurse-${channel}.png`; a.click(); };

  return (
    <div className="a-post">
      <div className="a-post-canvas"><canvas ref={cv} /></div>
      <div className="a-post-form">
        <div className="a-grid-2">
          <Field label="Modelo">
            <select value={c.template} onChange={(e) => set("template", e.target.value)}><option value="produto">Produto</option><option value="promo">Promoção</option><option value="dica">Dica</option></select>
          </Field>
          <Field label="Formato">
            <select value={c.format} onChange={(e) => set("format", e.target.value)}><option value="quadrado">Quadrado 1:1 (feed)</option><option value="retrato">Retrato 4:5 (feed)</option><option value="story">Vertical 9:16 (Stories, Reels, TikTok)</option></select>
          </Field>
          <Field label="Produto na imagem" wide>
            <select value={c.product_id ?? ""} onChange={(e) => set("product_id", e.target.value || undefined)}>
              <option value="">Sem produto</option>
              {products.filter((p) => p.image).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </Field>
          <Field label="Título na imagem"><input value={c.headline ?? ""} maxLength={60} onChange={(e) => set("headline", e.target.value)} /></Field>
          <Field label="Destaque (ex.: -15%, NOVO)"><input value={c.badge ?? ""} maxLength={16} onChange={(e) => set("badge", e.target.value)} /></Field>
          <Field label="Frase na imagem" wide><input value={c.subline ?? ""} maxLength={90} onChange={(e) => set("subline", e.target.value)} /></Field>
          <Field label="Texto da publicação" wide><textarea rows={5} value={caption} onChange={(e) => set("caption", e.target.value)} /></Field>
          <Field label="Hashtags" wide hint={`${tags.length} hashtags`}><input value={tags.join(" ")} onChange={(e) => set("hashtags", tagsOf(e.target.value))} /></Field>
        </div>
        {c.image_brief && <p className="a-hint">Sugestão do agente para a imagem: {c.image_brief}</p>}
        <div className="a-post-actions">
          <button className="a-btn sm" type="button" onClick={() => setPreview(c.format === "story" ? (channel === "tiktok" ? "tiktok" : "story") : "feed")}>Pré-visualizar</button>
          <button className="a-btn sm ghost" type="button" onClick={download} disabled={!dataUrl}>Descarregar imagem</button>
          <button className="a-btn sm ghost" type="button" onClick={copy}>Copiar texto</button>
          {actions({ content: c, saveImage, busy, setBusy })}
        </div>
      </div>

      <Modal title="Pré-visualização" open={!!preview} onClose={() => setPreview("")} wide>
        <div className="a-tabs-mini">
          {(["feed", "story", "tiktok"] as const).map((k) => <button key={k} type="button" className={preview === k ? "on" : ""} onClick={() => setPreview(k)}>{{ feed: "Instagram (feed)", story: "Stories / Reels", tiktok: "TikTok" }[k]}</button>)}
        </div>
        <div className="a-phone-wrap">
          {preview === "feed" && (
            <div className="a-phone ig">
              <div className="ig-head"><img src="/marca/inurse-icone.svg" alt="" /><b>{handle}</b><span>•••</span></div>
              {dataUrl && <img className="ig-img" src={dataUrl} alt="" style={{ aspectRatio: c.format === "retrato" ? "4 / 5" : c.format === "story" ? "9 / 16" : "1 / 1" }} />}
              <div className="ig-icons"><Ico d="M12 21s-7-4.6-9.3-9A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 9.3 6c-2.3 4.4-9.3 9-9.3 9z" /><Ico d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z" /><Ico d="M22 3 11 14M22 3l-7 19-4-8-8-4 19-7z" /><span style={{ flex: 1 }} /><Ico d="M6 3h12v18l-6-4-6 4z" /></div>
              <div className="ig-cap"><b>Gosto de 124 pessoas</b><p><b>{handle}</b> <Caption text={caption} /> <span className="tags">{tags.join(" ")}</span></p><small>há 1 minuto</small></div>
            </div>
          )}
          {preview === "story" && (
            <div className="a-phone story">
              {dataUrl && <img src={dataUrl} alt="" style={{ objectFit: c.format === "story" ? "cover" : "contain" }} />}
              <div className="st-bar"><i /></div>
              <div className="st-head"><img src="/marca/inurse-icone.svg" alt="" /><b>{handle}</b><span>agora</span></div>
              <div className="st-foot"><span>Enviar mensagem</span><Ico d="M12 21s-7-4.6-9.3-9A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 9.3 6c-2.3 4.4-9.3 9-9.3 9z" /></div>
            </div>
          )}
          {preview === "tiktok" && (
            <div className="a-phone tiktok">
              {dataUrl && <img src={dataUrl} alt="" style={{ objectFit: c.format === "story" ? "cover" : "contain" }} />}
              <div className="tt-side">{["M12 21s-7-4.6-9.3-9A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 9.3 6c-2.3 4.4-9.3 9-9.3 9z", "M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z", "M6 3h12v18l-6-4-6 4z", "M14 4l7 8-7 8v-5c-6 0-9 2-11 5 1-6 4-10 11-11z"].map((d, i) => <Ico key={i} d={d} />)}</div>
              <div className="tt-cap"><b>@{handle.replace(/^@/, "")}</b><p><Caption text={caption} max={90} /> <span className="tags">{tags.slice(0, 4).join(" ")}</span></p></div>
            </div>
          )}
        </div>
        {c.format !== "story" && preview !== "feed" && <p className="a-hint">Para Stories, Reels e TikTok escolhe o formato vertical 9:16.</p>}
      </Modal>
    </div>
  );
}

function Caption({ text, max = 125 }: { text: string; max?: number }) {
  const [open, setOpen] = useState(false);
  if (open || text.length <= max) return <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>;
  return <span>{text.slice(0, max).trimEnd()}… <button type="button" className="ig-more" onClick={() => setOpen(true)}>mais</button></span>;
}
function Ico({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true"><path d={d} /></svg>;
}
