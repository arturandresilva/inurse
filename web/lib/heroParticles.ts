// Destaque da página inicial: "digitalização 3D" de inspiração médica. Uma grelha fina de pontos de luz reproduz
// fotografias reais (uma soca e uma meia à venda) e o símbolo iNurse — sombreado, contorno e volume a partir da foto —
// roda devagar e transforma-se de uma forma na outra. Canvas 2D puro, sem bibliotecas.
// Pára quando sai do ecrã ou o separador fica escondido; com "reduzir movimento" fica parada.

type Cloud = { name: string; pts: Float32Array; lum: Uint8Array; links: Uint16Array; tint: 0 | 1 };
const S = 300; // resolução de análise

function heartPath(cx: number, cy: number, s: number) {
  const h = s / 2, p = new Path2D();
  p.moveTo(cx, cy + h * 0.95);
  p.bezierCurveTo(cx - h * 0.15, cy + h * 0.8, cx - h, cy + h * 0.25, cx - h, cy - h * 0.25);
  p.bezierCurveTo(cx - h, cy - h * 0.75, cx - h * 0.45, cy - h * 0.95, cx, cy - h * 0.45);
  p.bezierCurveTo(cx + h * 0.45, cy - h * 0.95, cx + h, cy - h * 0.75, cx + h, cy - h * 0.25);
  p.bezierCurveTo(cx + h, cy + h * 0.25, cx + h * 0.15, cy + h * 0.8, cx, cy + h * 0.95);
  p.closePath();
  return p;
}
// símbolo com sombreado (para o volume e o brilho saírem do próprio desenho)
function drawSymbol(g: CanvasRenderingContext2D) {
  const grad = g.createRadialGradient(118, 70, 10, 150, 120, 150);
  grad.addColorStop(0, "#ffffff"); grad.addColorStop(0.35, "#c9c9c9"); grad.addColorStop(1, "#4a4a4a");
  g.fillStyle = grad; g.fill(heartPath(150, 112, 190));
  g.lineWidth = 2; g.strokeStyle = "#fff"; g.stroke(heartPath(150, 116, 140));
  const st = g.createLinearGradient(136, 0, 164, 0); st.addColorStop(0, "#777"); st.addColorStop(0.45, "#fff"); st.addColorStop(1, "#555");
  g.fillStyle = st; g.beginPath(); g.roundRect(135, 222, 30, 66, 15); g.fill();
}

function analyse(src: CanvasImageSource, sw: number, sh: number, name: string, n: number, tint: 0 | 1): Cloud | null {
  const c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  const k0 = Math.min(S / sw, S / sh) * 0.98;
  g.drawImage(src, (S - sw * k0) / 2, (S - sh * k0) / 2, sw * k0, sh * k0);
  let d: Uint8ClampedArray;
  try { d = g.getImageData(0, 0, S, S).data; } catch { return null; }
  const N = S * S, inside = new Uint8Array(N);
  // fundo: transparência; se a imagem não tiver, a cor clara parecida com a dos cantos e ligada à borda
  let opaque = 0; for (let i = 0; i < N; i++) if (d[i * 4 + 3] > 128) opaque++;
  if (opaque < N * 0.97) { for (let i = 0; i < N; i++) inside[i] = d[i * 4 + 3] > 128 ? 1 : 0; }
  else {
    const bgLike = (i: number) => { const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); return mx - mn < 24 && (mx + mn) / 510 > 0.52; };
    inside.fill(1); const st: number[] = [];
    for (let i = 0; i < S; i++) st.push(i, N - S + i, i * S, i * S + S - 1);
    while (st.length) {
      const i = st.pop()!; if (!inside[i] || !bgLike(i)) continue; inside[i] = 0; const x = i % S, y = (i / S) | 0;
      if (x > 0) st.push(i - 1); if (x < S - 1) st.push(i + 1); if (y > 0) st.push(i - S); if (y < S - 1) st.push(i + S);
    }
  }
  let x0 = S, y0 = S, x1 = 0, y1 = 0, area = 0;
  for (let i = 0; i < N; i++) if (inside[i]) { area++; const x = i % S, y = (i / S) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (area < N * 0.02) return null;
  const L = new Float32Array(N);
  for (let i = 0; i < N; i++) L[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
  // sombreado normalizado dentro do objeto (fotos escuras ou claras ficam com o mesmo contraste)
  let lo = 1, hi = 0; for (let i = 0; i < N; i++) if (inside[i]) { if (L[i] < lo) lo = L[i]; if (L[i] > hi) hi = L[i]; }
  const span = Math.max(0.05, hi - lo);
  const dist = new Float32Array(N); for (let i = 0; i < N; i++) dist[i] = inside[i] ? 1e9 : 0;
  for (let y = 1; y < S; y++) for (let x = 1; x < S - 1; x++) { const i = y * S + x; if (dist[i]) dist[i] = Math.min(dist[i], dist[i - 1] + 1, dist[i - S] + 1, dist[i - S - 1] + 1.4, dist[i - S + 1] + 1.4); }
  for (let y = S - 2; y >= 0; y--) for (let x = S - 2; x > 0; x--) { const i = y * S + x; if (dist[i]) dist[i] = Math.min(dist[i], dist[i + 1] + 1, dist[i + S] + 1, dist[i + S + 1] + 1.4, dist[i + S - 1] + 1.4); }
  let dmax = 1; for (let i = 0; i < N; i++) if (dist[i] > dmax && dist[i] < 1e8) dmax = dist[i];
  const E = new Float32Array(N); let emax = 1e-3;
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const i = y * S + x; if (!inside[i]) continue;
    const gx = L[i - S + 1] + 2 * L[i + 1] + L[i + S + 1] - L[i - S - 1] - 2 * L[i - 1] - L[i + S - 1];
    const gy = L[i + S - 1] + 2 * L[i + S] + L[i + S + 1] - L[i - S - 1] - 2 * L[i - S] - L[i - S + 1];
    E[i] = Math.hypot(gx, gy); if (E[i] > emax) emax = E[i];
  }
  // candidatos: grelha regular (aspeto de digitalização) + contorno exato + linhas de detalhe
  const rim: number[] = [], det: number[] = [], grid: number[] = [];
  const step = Math.max(1, Math.round(Math.sqrt(area / (n * 0.62))));
  for (let i = 0; i < N; i++) {
    if (!inside[i]) continue; const x = i % S, y = (i / S) | 0;
    if (dist[i] <= 1.5) rim.push(i);
    else if (E[i] > emax * 0.28) det.push(i);
    if (x % step === 0 && y % step === 0) grid.push(i);
  }
  const shuffle = (a: number[]) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const nRim = Math.min(rim.length, Math.round(n * 0.2)), nDet = Math.min(det.length, Math.round(n * 0.18));
  const chosen = [...shuffle(rim).slice(0, nRim), ...shuffle(det).slice(0, nDet)];
  const g2 = shuffle(grid); for (let k = 0; chosen.length < n; k++) chosen.push(g2[k % g2.length]);
  const scale = 182 / Math.max(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const pts = new Float32Array(n * 3), lum = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const i = chosen[k], x = i % S, y = (i / S) | 0;
    const relief = Math.sqrt(Math.min(1, dist[i] / dmax)), l = (L[i] - lo) / span;
    pts[k * 3] = (x - cx) * scale; pts[k * 3 + 1] = (y - cy) * scale;
    pts[k * 3 + 2] = -(relief * 30 + l * 8) + 19;
    const e = E[i] / emax;
    lum[k] = Math.round(Math.min(1, k < nRim ? 1 : 0.1 + Math.pow(l, 1.35) * 0.85 + e * 0.5) * 31);
  }
  // linhas do contorno e do detalhe: cada ponto liga-se ao vizinho mais próximo do mesmo tipo
  const links: number[] = [], cell = 6, buckets = new Map<number, number[]>();
  const key = (x: number, y: number) => (Math.floor(x / cell) + 200) * 1000 + Math.floor(y / cell) + 200;
  for (let k = 0; k < nRim + nDet; k++) { const kk = key(pts[k * 3], pts[k * 3 + 1]); const b = buckets.get(kk); if (b) b.push(k); else buckets.set(kk, [k]); }
  for (let k = 0; k < nRim + nDet; k++) {
    const gx = Math.floor(pts[k * 3] / cell) + 200, gy = Math.floor(pts[k * 3 + 1] / cell) + 200;
    let best = -1, bd = 1e9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of buckets.get((gx + a) * 1000 + gy + b) ?? []) {
      if (j <= k || (k < nRim) !== (j < nRim)) continue;
      const dd = (pts[j * 3] - pts[k * 3]) ** 2 + (pts[j * 3 + 1] - pts[k * 3 + 1]) ** 2;
      if (dd > 1 && dd < 30 && dd < bd) { bd = dd; best = j; }
    }
    if (best >= 0) links.push(k, best);
  }
  return { name, pts, lum, links: Uint16Array.from(links), tint };
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image();
    if (/^https?:/.test(url) && !url.startsWith(location.origin)) im.crossOrigin = "anonymous";
    im.decoding = "async"; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; setTimeout(() => res(null), 9000);
  });
}

export type HoloHandlers = { onShape?: (name: string) => void; onAngle?: (deg: number) => void };
export function startHeroParticles(canvas: HTMLCanvasElement, images: { soca?: string; meia?: string }, h: HoloHandlers = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = window.innerWidth < 700;
  const N = small ? 3600 : 8000;
  const sym = document.createElement("canvas"); sym.width = sym.height = S; drawSymbol(sym.getContext("2d")!);
  const first = analyse(sym, S, S, "logo", N, 1);
  if (!first) return () => {};
  const clouds: Cloud[] = [first];
  let alive = true;

  let W = 0, H = 0, dpr = 1;
  const resize = () => { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = Math.max(1, r.width); H = Math.max(1, r.height); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); };
  resize();
  const glow = (() => { if (small) return false; ctx.filter = "blur(1px)"; const ok = ctx.filter === "blur(1px)"; ctx.filter = "none"; return ok; })();
  // paletas: 0 = menta → branco (produtos), 1 = coral → branco (símbolo); 32 níveis de brilho
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const ramp = (dark: number[], mid: number[]) => Array.from({ length: 32 }, (_, k) => { const t = k / 31; const c = t < 0.7 ? mix(dark, mid, t / 0.7) : mix(mid, [255, 255, 255], ((t - 0.7) / 0.3) * 0.85); return `rgb(${c[0]},${c[1]},${c[2]})`; });
  const pal = [ramp([22, 96, 108], [88, 214, 198]), ramp([140, 52, 60], [246, 112, 108])];
  const groups: number[][] = Array.from({ length: 64 }, () => []);
  const proj = new Float32Array(N * 3);
  const jit = new Float32Array(N * 3).map(() => Math.random() * 2 - 1);

  const HOLD = 4.2, MORPH = 2.2, STEP = HOLD + MORPH;
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let mx = 0, my = 0, tx = 0, ty = 0;
  const onMove = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2; };
  window.addEventListener("pointermove", onMove, { passive: true });

  let raf = 0, running = false, t0 = performance.now(), paused = 0, pausedAt = 0, last = "", lastAngle = -1;
  const draw = (now: number) => {
    const g = ctx, total = clouds.length;
    const t = reduce ? STEP + HOLD * 0.4 : Math.max(0, (now - t0 - paused) / 1000);
    const k = Math.floor(t / STEP), local = t - k * STEP;
    const from = clouds[k % total], to = clouds[(k + 1) % total];
    const m = total < 2 || local < HOLD ? 0 : ease((local - HOLD) / MORPH);
    const cur = m < 0.5 ? from : to;
    if (cur.name !== last) { last = cur.name; h.onShape?.(cur.name); }
    mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;
    const rotY = Math.sin(t * 0.45) * 0.42 + mx * 0.25 + m * Math.PI * 2;
    const rotX = 0.06 + my * 0.12 + Math.sin(t * 0.33) * 0.04;
    const deg = Math.round(((((rotY * 180) / Math.PI) % 360) + 360) % 360);
    if (deg !== lastAngle) { lastAngle = deg; h.onAngle?.(deg); }
    const cY = Math.cos(rotY), sY = Math.sin(rotY), cX = Math.cos(rotX), sX = Math.sin(rotX);
    const sc = (Math.min(W * 0.9, H * 0.86) / 190) * dpr, focal = 600, burst = Math.sin(Math.PI * m) * 70;
    const A = from.pts, B = to.pts, ox = (W / 2) * dpr, oy = H * 0.47 * dpr;
    const scan = ((t * 0.22) % 1.3) - 0.15; // linha de varrimento (0 = topo da forma, 1 = base)

    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.filter = "none";
    g.clearRect(0, 0, canvas.width, canvas.height);
    // plataforma: anéis de luz e marcas de escala
    const ey = oy + 98 * sc, rx = 88 * sc, ry = 15 * sc;
    const halo = g.createRadialGradient(ox, ey, 0, ox, ey, rx * 1.1);
    halo.addColorStop(0, "rgba(72,187,174,.30)"); halo.addColorStop(1, "rgba(72,187,174,0)");
    g.fillStyle = halo; g.beginPath(); g.ellipse(ox, ey, rx * 1.1, ry * 1.9, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#5FD3C4"; g.lineWidth = 1 * dpr;
    g.globalAlpha = 0.45; g.beginPath(); g.ellipse(ox, ey, rx, ry, 0, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 0.7; g.setLineDash([2 * dpr, 7 * dpr]); g.lineDashOffset = -t * 18 * dpr;
    g.beginPath(); g.ellipse(ox, ey, rx * 0.82, ry * 0.82, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.globalAlpha = 0.35; g.beginPath();
    for (let a = 0; a < 72; a++) {
      const an = (a / 72) * Math.PI * 2 + t * 0.15, c1 = Math.cos(an), s1 = Math.sin(an), len = a % 6 === 0 ? 1.12 : 1.05;
      g.moveTo(ox + c1 * rx, ey + s1 * ry); g.lineTo(ox + c1 * rx * len, ey + s1 * ry * len);
    }
    g.stroke();

    for (const gr of groups) gr.length = 0;
    let minY = 1e9, maxY = -1e9;
    const tintOff = (m < 0.5 ? from.tint : to.tint) * 32, lumArr = m < 0.5 ? from.lum : to.lum;
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      const x = A[i3] + (B[i3] - A[i3]) * m + jit[i3] * burst;
      const y = A[i3 + 1] + (B[i3 + 1] - A[i3 + 1]) * m + jit[i3 + 1] * burst;
      const z = A[i3 + 2] + (B[i3 + 2] - A[i3 + 2]) * m + jit[i3 + 2] * burst * 1.2;
      const x1 = x * cY + z * sY, z1 = -x * sY + z * cY;
      const y1 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
      const f = focal / (focal + z2);
      const py = oy + y1 * sc * f;
      proj[i3] = ox + x1 * sc * f; proj[i3 + 1] = py; proj[i3 + 2] = f;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      groups[tintOff + lumArr[i]].push(i);
    }
    const scanY = minY + (maxY - minY) * scan;
    // contornos em linha fina (desaparecem durante a transformação)
    const la = Math.pow(1 - Math.sin(Math.PI * m), 6);
    if (la > 0.02) {
      const Ls = cur.links;
      g.globalAlpha = 0.55 * la; g.strokeStyle = cur.tint ? "#FFB3AE" : "#A6F5EA"; g.lineWidth = 0.8 * dpr; g.beginPath();
      for (let j = 0; j < Ls.length; j += 2) { const a = Ls[j] * 3, b = Ls[j + 1] * 3; g.moveTo(proj[a], proj[a + 1]); g.lineTo(proj[b], proj[b + 1]); }
      g.stroke();
    }
    // pontos: o brilho vem do sombreado da foto
    const base = (small ? 1.5 : 1.3) * dpr;
    g.globalAlpha = 0.95;
    for (let gi = 0; gi < 64; gi++) {
      const list = groups[gi]; if (!list.length) continue;
      g.fillStyle = pal[gi >> 5][gi & 31]; g.beginPath();
      const sz = base * (0.55 + (gi & 31) / 31 * 0.85); // meio-tom: zonas claras com pontos maiores
      for (const i of list) { const s = sz * proj[i * 3 + 2]; g.rect(proj[i * 3] - s / 2, proj[i * 3 + 1] - s / 2, s, s); }
      g.fill();
    }
    // linha de varrimento: os pontos por onde passa acendem
    if (scan > 0 && scan < 1 && la > 0.3) {
      const band = 7 * dpr;
      g.fillStyle = "#FFFFFF"; g.globalAlpha = 0.9 * la; g.beginPath();
      for (let i = 0; i < N; i++) { if (Math.abs(proj[i * 3 + 1] - scanY) < band) { const s = base * 1.5; g.rect(proj[i * 3] - s / 2, proj[i * 3 + 1] - s / 2, s, s); } }
      g.fill();
      const lg = g.createLinearGradient(0, scanY - 30 * dpr, 0, scanY + 2 * dpr);
      lg.addColorStop(0, "rgba(95,211,196,0)"); lg.addColorStop(1, "rgba(95,211,196,.16)");
      g.globalAlpha = la; g.fillStyle = lg; g.fillRect(ox - 110 * sc, scanY - 30 * dpr, 220 * sc, 32 * dpr);
      g.fillStyle = "rgba(166,245,234,.8)"; g.fillRect(ox - 110 * sc, scanY, 220 * sc, 1 * dpr);
    }
    if (glow) { g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.45; g.filter = `blur(${3 * dpr}px)`; g.drawImage(canvas, 0, 0); g.filter = "none"; }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    if (running && !reduce) raf = requestAnimationFrame(draw);
  };

  (async () => {
    for (const [name, url] of [["soca", images.soca], ["meia", images.meia]] as const) {
      if (!url) continue;
      const im = await loadImage(url);
      const cl = im ? analyse(im, im.naturalWidth, im.naturalHeight, name, N, 0) : null;
      if (cl && alive) clouds.push(cl);
    }
    if (reduce && alive) draw(performance.now());
  })();

  const start = () => { if (running || reduce) return; running = true; if (pausedAt) { paused += performance.now() - pausedAt; pausedAt = 0; } raf = requestAnimationFrame(draw); };
  const stop = () => { if (!running) return; running = false; pausedAt = performance.now(); cancelAnimationFrame(raf); };
  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !document.hidden) start(); else stop(); });
  io.observe(canvas);
  const onVis = () => { if (visible && !document.hidden) start(); else stop(); };
  document.addEventListener("visibilitychange", onVis);
  const ro = new ResizeObserver(() => { resize(); if (!running) draw(performance.now()); });
  ro.observe(canvas);
  if (reduce) draw(performance.now()); else start();
  return () => { alive = false; stop(); io.disconnect(); ro.disconnect(); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pointermove", onMove); };
}
