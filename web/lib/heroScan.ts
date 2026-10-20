// Destaque da página inicial: "estúdio de digitalização". Cada produto materializa-se a partir de uma nuvem de pontos,
// uma linha de varrimento revela a fotografia real (recortada do fundo), que fica a flutuar em 3D com reflexo,
// sombra e um brilho a passar; depois volta a desfazer-se em pontos e forma o produto seguinte.
// Canvas 2D + CSS 3D, sem bibliotecas. Pára fora do ecrã; com "reduzir movimento" mostra a foto parada.

type Item = { name: string; cut: HTMLCanvasElement; url: string; w: number; h: number; pts: Float32Array; col: Uint16Array };
const S = 260;          // resolução da análise dos pontos
const BOX = 182;        // tamanho da forma (unidades) no lado maior

// ---------- recorte: fundo transparente, ou cor clara/cinza ligada à borda ----------
function cutout(src: CanvasImageSource, sw: number, sh: number, max = 900): HTMLCanvasElement | null {
  const k = Math.min(1, max / Math.max(sw, sh)), W = Math.max(1, Math.round(sw * k)), H = Math.max(1, Math.round(sh * k));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(src, 0, 0, W, H);
  let img: ImageData;
  try { img = g.getImageData(0, 0, W, H); } catch { return null; }
  const d = img.data, N = W * H;
  let opaque = 0; for (let i = 0; i < N; i++) if (d[i * 4 + 3] > 200) opaque++;
  if (opaque > N * 0.97) {
    const bgLike = (i: number) => { const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); return mx - mn < 26 && (mx + mn) / 510 > 0.55; };
    const bg = new Uint8Array(N), st: number[] = [];
    for (let x = 0; x < W; x++) st.push(x, N - W + x);
    for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
    while (st.length) { const i = st.pop()!; if (bg[i] || !bgLike(i)) continue; bg[i] = 1; const x = i % W;
      if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (i >= W) st.push(i - W); if (i < N - W) st.push(i + W); }
    // suavizar a borda (1 px) e apagar o fundo
    for (let i = 0; i < N; i++) if (bg[i]) d[i * 4 + 3] = 0;
    // tirar a orla clara (2 px) que fica do fundo
    for (let pass = 0; pass < 2; pass++) { const edge: number[] = [];
      for (let i = W; i < N - W; i++) if (!bg[i] && (bg[i - 1] || bg[i + 1] || bg[i - W] || bg[i + W])) edge.push(i);
      for (const i of edge) { bg[i] = 1; d[i * 4 + 3] = 0; } }
    g.putImageData(img, 0, 0);
  }
  // cortar à volta do produto
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let i = 0; i < N; i++) if (d[i * 4 + 3] > 100) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 - x0 < 10 || y1 - y0 < 10) return null;
  const o = document.createElement("canvas"); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext("2d")!.drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}

// ---------- nuvem de pontos a partir do recorte (cor real, densidade maior no contorno e no detalhe) ----------
function cloud(cut: HTMLCanvasElement, n: number) {
  const k = Math.min(S / cut.width, S / cut.height), W = Math.max(2, Math.round(cut.width * k)), H = Math.max(2, Math.round(cut.height * k));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!; g.drawImage(cut, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data, N = W * H;
  const inside = (i: number) => d[i * 4 + 3] > 120;
  const L = (i: number) => (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
  const rim: number[] = [], det: number[] = [], body: number[] = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (!inside(i)) continue;
    if (!inside(i - 1) || !inside(i + 1) || !inside(i - W) || !inside(i + W)) { rim.push(i); continue; }
    const e = Math.abs(L(i + 1) - L(i - 1)) + Math.abs(L(i + W) - L(i - W));
    (e > 0.12 ? det : body).push(i);
  }
  const pick = (a: number[]) => a[(Math.random() * a.length) | 0];
  const sc = BOX / Math.max(W, H), pts = new Float32Array(n * 3), col = new Uint16Array(n);
  for (let j = 0; j < n; j++) {
    const src = j % 10 < 3 && rim.length ? rim : j % 10 < 5 && det.length ? det : body.length ? body : rim;
    const i = pick(src), x = (i % W) + Math.random() - 0.5, y = ((i / W) | 0) + Math.random() - 0.5;
    pts[j * 3] = (x - W / 2) * sc; pts[j * 3 + 1] = (y - H / 2) * sc; pts[j * 3 + 2] = (Math.random() - 0.5) * 18;
    const q = (v: number) => Math.min(15, Math.round(Math.min(255, v * 1.12 + 22) / 17));
    col[j] = (q(d[i * 4]) << 8) | (q(d[i * 4 + 1]) << 4) | q(d[i * 4 + 2]);
  }
  return { pts, col };
}

// símbolo iNurse em "3D" (coração brilhante e haste do i), desenhado em alta resolução
function symbolCanvas() {
  const c = document.createElement("canvas"); c.width = 560; c.height = 640;
  const g = c.getContext("2d")!;
  const heart = (cx: number, cy: number, s: number) => { const h = s / 2, p = new Path2D();
    p.moveTo(cx, cy + h * 0.95); p.bezierCurveTo(cx - h * 0.15, cy + h * 0.8, cx - h, cy + h * 0.25, cx - h, cy - h * 0.25);
    p.bezierCurveTo(cx - h, cy - h * 0.75, cx - h * 0.45, cy - h * 0.95, cx, cy - h * 0.45); p.bezierCurveTo(cx + h * 0.45, cy - h * 0.95, cx + h, cy - h * 0.75, cx + h, cy - h * 0.25);
    p.bezierCurveTo(cx + h, cy + h * 0.25, cx + h * 0.15, cy + h * 0.8, cx, cy + h * 0.95); p.closePath(); return p; };
  const hp = heart(280, 230, 440);
  const body = g.createRadialGradient(200, 130, 20, 280, 250, 300);
  body.addColorStop(0, "#FFC2BE"); body.addColorStop(0.35, "#F58A86"); body.addColorStop(0.8, "#D9534F"); body.addColorStop(1, "#A93A3A");
  g.fillStyle = body; g.fill(hp);
  g.save(); g.clip(hp);
  const rim = g.createLinearGradient(0, 380, 0, 460); rim.addColorStop(0, "rgba(120,20,30,0)"); rim.addColorStop(1, "rgba(120,20,30,.45)");
  g.fillStyle = rim; g.fillRect(0, 0, 560, 480);
  g.globalAlpha = 0.75; g.fillStyle = "#fff"; g.beginPath(); g.ellipse(195, 135, 70, 34, -0.6, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 0.35; g.beginPath(); g.ellipse(360, 120, 40, 18, 0.5, 0, Math.PI * 2); g.fill();
  g.restore();
  const st = g.createLinearGradient(240, 0, 320, 0);
  st.addColorStop(0, "#2A8378"); st.addColorStop(0.35, "#7FE3D6"); st.addColorStop(0.6, "#48BBAE"); st.addColorStop(1, "#1F6A61");
  g.fillStyle = st; g.beginPath(); g.roundRect(240, 470, 80, 160, 40); g.fill();
  g.fillStyle = "rgba(255,255,255,.5)"; g.beginPath(); g.roundRect(256, 488, 14, 120, 7); g.fill();
  return c;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image();
    if (/^https?:/.test(url) && !url.startsWith(location.origin)) im.crossOrigin = "anonymous";
    im.onload = () => res(im); im.onerror = () => res(null); im.src = url; setTimeout(() => res(null), 9000);
  });
}

export type ScanHandlers = { onShape?: (name: string) => void; onPhase?: (phase: string) => void };
export function startHeroScan(stage: HTMLElement, images: { soca?: string; meia?: string }, h: ScanHandlers = {}) {
  const back = stage.querySelector<HTMLCanvasElement>(".fx-back")!, front = stage.querySelector<HTMLCanvasElement>(".fx-front")!;
  const wrap = stage.querySelector<HTMLDivElement>(".fx-photo")!, img = wrap.querySelector<HTMLImageElement>("img")!, sheen = wrap.querySelector<HTMLDivElement>(".fx-sheen")!;
  const bctx = back.getContext("2d"), fctx = front.getContext("2d");
  if (!bctx || !fctx) return () => {};
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = window.innerWidth < 700;
  const N = small ? 2600 : 5200;
  const items: Item[] = [];
  const add = (name: string, cut: HTMLCanvasElement) => { const { pts, col } = cloud(cut, N); items.push({ name, cut, url: cut.toDataURL("image/png"), w: cut.width, h: cut.height, pts, col }); };
  add("logo", symbolCanvas());
  let alive = true;
  (async () => {
    for (const [name, url] of [["soca", images.soca], ["meia", images.meia]] as const) {
      if (!url) continue;
      const im = await loadImage(url);
      const cut = im ? cutout(im, im.naturalWidth, im.naturalHeight) : null;
      if (cut && alive) add(name, cut);
    }
  })();

  let W = 0, H = 0, dpr = 1;
  const resize = () => {
    const r = stage.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = Math.max(1, r.width); H = Math.max(1, r.height);
    for (const c of [back, front]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  };
  resize();
  const palette = Array.from({ length: 4096 }, (_, v) => `rgb(${((v >> 8) & 15) * 17},${((v >> 4) & 15) * 17},${(v & 15) * 17})`);
  const buckets = new Map<number, number[]>();
  const jit = new Float32Array(N * 3).map(() => Math.random() * 2 - 1);
  const proj = new Float32Array(N * 2);

  // linha do tempo de cada produto (segundos)
  const ASM = 1.3, REV = 1.2, HOLD = 4.2, OUT = 0.7, STEP = ASM + REV + HOLD + OUT;
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  let mx = 0, my = 0, tx = 0, ty = 0;
  const onMove = (e: PointerEvent) => { const r = stage.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2; };
  window.addEventListener("pointermove", onMove, { passive: true });

  let raf = 0, running = false, t0 = performance.now(), paused = 0, pausedAt = 0, shown = "", phase = "";
  const draw = (now: number) => {
    const t = reduce ? ASM + REV + 1 : Math.max(0, (now - t0 - paused) / 1000);
    const total = items.length, k = Math.floor(t / STEP), lt = t - k * STEP;
    const cur = items[k % total], prev = items[(k + total - 1) % total];
    const scale = Math.min((W * 0.6) / BOX, (H * 0.64) / BOX);       // px por unidade
    const ox = W / 2, oy = H * 0.47;
    // fases
    const m = lt < ASM ? ease(lt / ASM) : 1;                            // pontos: do produto anterior para este
    const rev = lt < ASM ? 0 : lt < ASM + REV ? (lt - ASM) / REV : 1;  // varrimento a revelar a foto
    const out = lt > STEP - OUT ? (lt - (STEP - OUT)) / OUT : 0;       // foto a desfazer-se em pontos
    const ph = lt < ASM ? "assemble" : lt < ASM + REV ? "scan" : out > 0 ? "out" : "hold";
    if (ph !== phase) { phase = ph; h.onPhase?.(ph); }
    if (cur.name !== shown && lt >= ASM * 0.5) { shown = cur.name; h.onShape?.(cur.name); }

    // foto (DOM, com 3D em CSS)
    const fs = BOX / Math.max(cur.w, cur.h) * scale, pw = cur.w * fs, phh = cur.h * fs;
    if (img.dataset.k !== cur.url.slice(-40)) { img.src = cur.url; img.dataset.k = cur.url.slice(-40); sheen.style.webkitMaskImage = sheen.style.maskImage = `url(${cur.url})`; }
    mx += (tx - mx) * 0.06; my += (ty - my) * 0.06;
    const holdT = Math.max(0, lt - ASM - REV), env = smooth(Math.min(1, holdT / 0.9)) * (1 - smooth(out));
    const ry = (Math.sin(holdT * 0.9) * 9 + mx * 10) * env, rx = (-4 + my * 6) * env, fl = Math.sin(holdT * 1.3) * 6 * env;
    wrap.style.width = `${pw}px`; wrap.style.height = `${phh}px`;
    wrap.style.transform = `translate(${ox - pw / 2}px, ${oy - phh / 2 + fl}px) rotateY(${ry}deg) rotateX(${rx}deg)`;
    const visible = rev * (1 - out);
    wrap.style.opacity = String(Math.min(1, visible * 1.6));
    wrap.style.clipPath = rev < 1 ? `inset(0 0 ${(1 - rev) * 100}% 0)` : "none";
    sheen.style.backgroundPosition = `${(((holdT * 0.35) % 1.6) - 0.3) * 100}% 0`;

    // fundo: plataforma, sombra e anéis
    const b = bctx;
    b.setTransform(dpr, 0, 0, dpr, 0, 0); b.clearRect(0, 0, W, H);
    const ey = oy + phh / 2 + 22, rxp = Math.min(W * 0.36, 175), ryp = rxp * 0.16;
    const halo = b.createRadialGradient(ox, ey, 0, ox, ey, rxp * 1.2);
    halo.addColorStop(0, "rgba(72,187,174,.32)"); halo.addColorStop(1, "rgba(72,187,174,0)");
    b.fillStyle = halo; b.beginPath(); b.ellipse(ox, ey, rxp * 1.2, ryp * 2, 0, 0, Math.PI * 2); b.fill();
    const sh = b.createRadialGradient(ox, ey - 4, 0, ox, ey - 4, pw * 0.5);
    sh.addColorStop(0, `rgba(0,10,20,${0.55 * visible})`); sh.addColorStop(1, "rgba(0,10,20,0)");
    b.fillStyle = sh; b.beginPath(); b.ellipse(ox, ey - 4 - fl * 0.3, pw * 0.5 * (1 - fl / 60), ryp * 0.8, 0, 0, Math.PI * 2); b.fill();
    b.strokeStyle = "#5FD3C4"; b.lineWidth = 1;
    b.globalAlpha = 0.5; b.beginPath(); b.ellipse(ox, ey, rxp, ryp, 0, 0, Math.PI * 2); b.stroke();
    b.globalAlpha = 0.75; b.setLineDash([2, 7]); b.lineDashOffset = -t * 16;
    b.beginPath(); b.ellipse(ox, ey, rxp * 0.8, ryp * 0.8, 0, 0, Math.PI * 2); b.stroke(); b.setLineDash([]);
    b.globalAlpha = 0.35; b.beginPath();
    for (let a = 0; a < 90; a++) { const an = (a / 90) * Math.PI * 2 + t * 0.12, c = Math.cos(an), s = Math.sin(an), len = a % 5 === 0 ? 1.1 : 1.045;
      b.moveTo(ox + c * rxp, ey + s * ryp); b.lineTo(ox + c * rxp * len, ey + s * ryp * len); }
    b.stroke(); b.globalAlpha = 1;

    // frente: pontos (a montar, durante o varrimento só abaixo da linha, e a desfazer-se no fim)
    const f = fctx;
    f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, front.width, front.height);
    const ptsAlpha = lt < ASM ? 1 : rev < 1 ? 1 : out > 0 ? smooth(out) : 0;
    const scanY = oy - phh / 2 + phh * rev;
    if (ptsAlpha > 0.01 && !reduce) {
      const A = prev.pts, B = cur.pts, burst = Math.sin(Math.PI * m) * 55 + out * out * 40;
      const rot = (1 - m) * 1.2, cR = Math.cos(rot), sR = Math.sin(rot);
      buckets.clear();
      for (let i = 0; i < N; i++) {
        const i3 = i * 3;
        let x = A[i3] + (B[i3] - A[i3]) * m + jit[i3] * burst, y = A[i3 + 1] + (B[i3 + 1] - A[i3 + 1]) * m + jit[i3 + 1] * burst;
        const z = A[i3 + 2] + (B[i3 + 2] - A[i3 + 2]) * m + jit[i3 + 2] * burst;
        const x1 = x * cR + z * sR; x = x1;
        const px = ox + x * scale, py = oy + y * scale + fl;
        proj[i * 2] = px; proj[i * 2 + 1] = py;
        if (rev > 0 && rev < 1 && py < scanY) continue;      // já revelado pela linha
        const c = (m < 0.5 ? prev.col : cur.col)[i];
        const bk = buckets.get(c); if (bk) bk.push(i); else buckets.set(c, [i]);
      }
      const s = (small ? 1.6 : 1.35) * dpr;
      f.globalAlpha = 0.9 * ptsAlpha;
      buckets.forEach((list, c) => { f.fillStyle = palette[c]; f.beginPath(); for (const i of list) f.rect(proj[i * 2] * dpr - s / 2, proj[i * 2 + 1] * dpr - s / 2, s, s); f.fill(); });
    }
    // linha de varrimento
    if (rev > 0 && rev < 1) {
      f.setTransform(dpr, 0, 0, dpr, 0, 0); f.globalAlpha = 1;
      const x0 = ox - pw / 2 - 30, x1 = ox + pw / 2 + 30;
      const g = f.createLinearGradient(0, scanY - 40, 0, scanY);
      g.addColorStop(0, "rgba(95,211,196,0)"); g.addColorStop(1, "rgba(95,211,196,.22)");
      f.fillStyle = g; f.fillRect(x0, scanY - 40, x1 - x0, 40);
      const lg = f.createLinearGradient(x0, 0, x1, 0);
      lg.addColorStop(0, "rgba(166,245,234,0)"); lg.addColorStop(0.5, "rgba(230,255,252,1)"); lg.addColorStop(1, "rgba(166,245,234,0)");
      f.fillStyle = lg; f.fillRect(x0, scanY - 1, x1 - x0, 2);
      f.shadowColor = "#7FE3D6"; f.shadowBlur = 14; f.fillRect(x0 + 20, scanY - 0.5, x1 - x0 - 40, 1); f.shadowBlur = 0;
    }
    f.globalAlpha = 1;
    if (running && !reduce) raf = requestAnimationFrame(draw);
  };

  const start = () => { if (running || reduce) return; running = true; if (pausedAt) { paused += performance.now() - pausedAt; pausedAt = 0; } raf = requestAnimationFrame(draw); };
  const stop = () => { if (!running) return; running = false; pausedAt = performance.now(); cancelAnimationFrame(raf); };
  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !document.hidden) start(); else stop(); });
  io.observe(stage);
  const onVis = () => { if (visible && !document.hidden) start(); else stop(); };
  document.addEventListener("visibilitychange", onVis);
  const ro = new ResizeObserver(() => { resize(); if (!running) draw(performance.now()); });
  ro.observe(stage);
  if (reduce) draw(performance.now()); else start();
  return () => { alive = false; stop(); io.disconnect(); ro.disconnect(); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pointermove", onMove); };
}
