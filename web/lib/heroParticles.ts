// Animação do destaque da página inicial ("holograma"): milhares de pontos de luz desenham o símbolo iNurse
// e as fotografias reais de uma soca e de uma meia à venda — contorno e costuras em linhas finas, volume em 3D —
// e transformam-se de uma forma na outra enquanto rodam. Canvas 2D puro, sem bibliotecas.
// Pára quando sai do ecrã ou o separador fica escondido; com "reduzir movimento" fica parada.

type Cloud = { name: string; pts: Float32Array; col: Uint16Array; links: Uint16Array };
const S = 240; // resolução de análise das imagens

// ---------- formas vetoriais (símbolo e alternativas se uma foto não carregar) ----------
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
function drawSymbol(g: CanvasRenderingContext2D) {
  const grad = g.createLinearGradient(60, 30, 180, 170);
  grad.addColorStop(0, "#FF9C97"); grad.addColorStop(1, "#E5615E");
  g.fillStyle = grad; g.fill(heartPath(120, 92, 150));
  g.strokeStyle = "rgba(255,255,255,.95)"; g.lineWidth = 3; g.stroke(heartPath(120, 94, 112));
  g.strokeStyle = "rgba(255,255,255,.6)"; g.lineWidth = 2; g.stroke(heartPath(120, 96, 76));
  g.fillStyle = "#48BBAE"; g.beginPath(); g.roundRect(108, 178, 24, 50, 12); g.fill();
}
function drawClog(g: CanvasRenderingContext2D) {
  g.save(); g.translate(20, 40);
  const p = new Path2D("M14,150 L168,150 C186,150 194,140 192,124 C190,96 168,80 140,74 C116,69 92,74 78,86 C70,94 64,104 60,110 L36,112 C22,112 14,118 14,128 Z");
  g.fillStyle = "#48BBAE"; g.fill(p);
  g.fillStyle = "#2A8378"; g.fillRect(14, 138, 180, 12);
  g.fillStyle = "#0b2236"; for (const [x, y] of [[118, 86], [136, 84], [154, 90], [170, 102], [128, 102], [146, 104], [164, 118]]) { g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill(); }
  g.strokeStyle = "#48BBAE"; g.lineWidth = 9; g.beginPath(); g.moveTo(24, 118); g.bezierCurveTo(20, 92, 42, 88, 62, 102); g.stroke();
  g.restore();
}
function drawSock(g: CanvasRenderingContext2D) {
  g.save(); g.translate(20, 20);
  const p = new Path2D("M66,14 L118,14 L118,112 C118,126 126,134 140,138 L172,148 C192,154 194,180 172,184 L96,186 C70,186 60,170 64,146 L66,128 Z");
  g.fillStyle = "#F27C79"; g.fill(p);
  g.fillStyle = "#48BBAE"; g.fillRect(66, 14, 52, 16);
  g.strokeStyle = "rgba(255,255,255,.5)"; g.lineWidth = 1.5;
  for (let y = 40; y < 130; y += 9) { g.beginPath(); g.moveTo(68, y); g.lineTo(116, y); g.stroke(); }
  g.restore();
}

// ---------- análise de uma imagem: máscara, contornos, detalhe e volume ----------
function analyse(draw: (g: CanvasRenderingContext2D) => void, name: string, n: number, alphaOnly: boolean): Cloud | null {
  const c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  draw(g);
  let d: Uint8ClampedArray;
  try { d = g.getImageData(0, 0, S, S).data; } catch { return null; } // imagem sem CORS
  const N = S * S, bg = new Uint8Array(N);
  // fundo: transparente, ou parecido com a cor dos cantos (fotos de produto em fundo branco/cinza) e ligado à borda
  const corner = [0, S - 1, N - S, N - 1].map((i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
  const ref = [0, 1, 2].map((k) => corner.reduce((s, x) => s + x[k], 0) / 4);
  const isBg = (i: number) => d[i * 4 + 3] < 24 || (!alphaOnly && Math.abs(d[i * 4] - ref[0]) + Math.abs(d[i * 4 + 1] - ref[1]) + Math.abs(d[i * 4 + 2] - ref[2]) < 46);
  const stack: number[] = [];
  for (let i = 0; i < S; i++) stack.push(i, N - S + i, i * S, i * S + S - 1);
  while (stack.length) {
    const i = stack.pop()!; if (bg[i] || !isBg(i)) continue; bg[i] = 1; const x = i % S, y = (i / S) | 0;
    if (x > 0) stack.push(i - 1); if (x < S - 1) stack.push(i + 1); if (y > 0) stack.push(i - S); if (y < S - 1) stack.push(i + S);
  }
  let x0 = S, y0 = S, x1 = 0, y1 = 0, area = 0;
  for (let i = 0; i < N; i++) if (!bg[i]) { area++; const x = i % S, y = (i / S) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (area < N * 0.02 || area > N * 0.9) return null;
  // luminância, contornos (Sobel) e distância à borda (volume)
  const L = new Float32Array(N); for (let i = 0; i < N; i++) L[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
  const E = new Float32Array(N), dist = new Float32Array(N);
  for (let i = 0; i < N; i++) dist[i] = bg[i] ? 0 : 1e9;
  for (let y = 1; y < S; y++) for (let x = 1; x < S - 1; x++) { const i = y * S + x; if (dist[i]) dist[i] = Math.min(dist[i], dist[i - 1] + 1, dist[i - S] + 1, dist[i - S - 1] + 1.4, dist[i - S + 1] + 1.4); }
  for (let y = S - 2; y >= 0; y--) for (let x = S - 2; x > 0; x--) { const i = y * S + x; if (dist[i]) dist[i] = Math.min(dist[i], dist[i + 1] + 1, dist[i + S] + 1, dist[i + S + 1] + 1.4, dist[i + S - 1] + 1.4); }
  let dmax = 1, emax = 0.001;
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const i = y * S + x; if (bg[i]) continue; if (dist[i] > dmax) dmax = dist[i];
    const gx = L[i - S + 1] + 2 * L[i + 1] + L[i + S + 1] - L[i - S - 1] - 2 * L[i - 1] - L[i + S - 1];
    const gy = L[i + S - 1] + 2 * L[i + S] + L[i + S + 1] - L[i - S - 1] - 2 * L[i - S] - L[i - S + 1];
    E[i] = Math.hypot(gx, gy); if (E[i] > emax) emax = E[i];
  }
  const rim: number[] = [], det: number[] = [], body: number[] = [];
  for (let i = 0; i < N; i++) { if (bg[i]) continue; if (dist[i] <= 1.5) rim.push(i); else if (E[i] > emax * 0.22) det.push(i); else body.push(i); }
  const scale = 182 / Math.max(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const pts = new Float32Array(n * 3), col = new Uint16Array(n);
  const pick = (a: number[]) => a[(Math.random() * a.length) | 0];
  const nr = Math.round(n * 0.26), nd = det.length ? Math.round(n * 0.34) : 0;
  for (let k = 0; k < n; k++) {
    const src = k < nr ? rim : k < nr + nd ? det : body.length ? body : rim;
    const i = pick(src), x = (i % S) + Math.random() - 0.5, y = ((i / S) | 0) + Math.random() - 0.5;
    const relief = Math.sqrt(dist[i] / dmax);
    pts[k * 3] = (x - cx) * scale; pts[k * 3 + 1] = (y - cy) * scale;
    pts[k * 3 + 2] = (relief - 0.45) * 46 + (Math.random() - 0.5) * 3;
    // cor real da foto, aclarada para brilhar sobre o fundo escuro (os tons escuros puxam para menta)
    let r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
    const l = L[i];
    if (l < 0.42) { const t = 0.62 - l; r = r + (72 - r) * t + 40; gg = gg + (187 - gg) * t + 40; b = b + (174 - b) * t + 40; }
    else { r = r + (255 - r) * 0.12; gg = gg + (255 - gg) * 0.12; b = b + (255 - b) * 0.12; }
    const q = (v: number) => Math.min(15, Math.max(0, Math.round(v / 17)));
    col[k] = (q(r) << 8) | (q(gg) << 4) | q(b);
  }
  // ligações entre pontos vizinhos do contorno e do detalhe (o "desenho a linhas")
  const nl = nr + nd, cell = 7, grid = new Map<number, number[]>();
  const keyOf = (k: number) => (Math.floor(pts[k * 3] / cell) + 100) * 1000 + Math.floor(pts[k * 3 + 1] / cell) + 100;
  for (let k = 0; k < nl; k++) { const key = keyOf(k); const a = grid.get(key); if (a) a.push(k); else grid.set(key, [k]); }
  const links: number[] = [];
  for (let k = 0; k < nl; k++) {
    const gx = Math.floor(pts[k * 3] / cell) + 100, gy = Math.floor(pts[k * 3 + 1] / cell) + 100;
    let best = -1, bd = 1e9, second = -1, sd = 1e9;
    for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) for (const j of grid.get((gx + a) * 1000 + gy + b2) ?? []) {
      if (j <= k) continue;
      const dd = (pts[j * 3] - pts[k * 3]) ** 2 + (pts[j * 3 + 1] - pts[k * 3 + 1]) ** 2;
      if (dd < 2 || dd > 42) continue;
      if (dd < bd) { second = best; sd = bd; best = j; bd = dd; } else if (dd < sd) { second = j; sd = dd; }
    }
    if (best >= 0) links.push(k, best);
    if (second >= 0 && Math.random() < 0.5) links.push(k, second);
  }
  return { name, pts, col, links: Uint16Array.from(links) };
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image(); im.crossOrigin = "anonymous"; im.decoding = "async";
    im.onload = () => res(im); im.onerror = () => res(null); im.src = url; setTimeout(() => res(null), 8000);
  });
}
const fit = (im: HTMLImageElement) => (g: CanvasRenderingContext2D) => {
  const k = Math.min(S / im.naturalWidth, S / im.naturalHeight) * 0.96, w = im.naturalWidth * k, h = im.naturalHeight * k;
  g.fillStyle = "#fff"; g.fillRect(0, 0, S, S); g.drawImage(im, (S - w) / 2, (S - h) / 2, w, h);
};

export function startHeroParticles(canvas: HTMLCanvasElement, images: { soca?: string; meia?: string }, onShape?: (name: string) => void) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = window.innerWidth < 700;
  const N = small ? 2200 : 4200;
  const first = analyse(drawSymbol, "logo", N, true);
  if (!first) return () => {};
  const clouds: Cloud[] = [first];
  let alive = true;

  let W = 0, H = 0, dpr = 1;
  const resize = () => { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = Math.max(1, r.width); H = Math.max(1, r.height); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); };
  resize();
  const glow = (() => { if (small) return false; ctx.filter = "blur(1px)"; const ok = ctx.filter === "blur(1px)"; ctx.filter = "none"; return ok; })();
  const palette = Array.from({ length: 4096 }, (_, v) => `rgb(${((v >> 8) & 15) * 17},${((v >> 4) & 15) * 17},${(v & 15) * 17})`);
  const buckets = new Map<number, number[]>();
  const proj = new Float32Array(N * 3);
  const jit = new Float32Array(N * 3).map(() => Math.random() * 2 - 1);

  const HOLD = 3.6, MORPH = 2.0, STEP = HOLD + MORPH;
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let mx = 0, my = 0, tx = 0, ty = 0;
  const onMove = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2; };
  window.addEventListener("pointermove", onMove, { passive: true });

  let raf = 0, running = false, t0 = performance.now(), paused = 0, pausedAt = 0, last = "";
  const draw = (now: number) => {
    const g = ctx;
    const total = clouds.length;
    const t = reduce ? HOLD * 0.5 + STEP : Math.max(0, (now - t0 - paused) / 1000);
    const k = Math.floor(t / STEP), local = t - k * STEP;
    const from = clouds[k % total], to = clouds[(k + 1) % total];
    const m = total < 2 || local < HOLD ? 0 : ease((local - HOLD) / MORPH);
    const cur = m < 0.5 ? from : to;
    if (cur.name !== last) { last = cur.name; onShape?.(cur.name); }
    mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;
    const rotY = Math.sin(t * 0.5) * 0.5 + mx * 0.3 + m * Math.PI * 2;
    const rotX = 0.1 + my * 0.15 + Math.sin(t * 0.37) * 0.05;
    const cY = Math.cos(rotY), sY = Math.sin(rotY), cX = Math.cos(rotX), sX = Math.sin(rotX);
    const sc = (Math.min(W * 0.92, H) / 245) * dpr, focal = 560, burst = Math.sin(Math.PI * m) * 60;
    const A = from.pts, B = to.pts, ox = (W / 2) * dpr, oy = (H / 2 - H * 0.03) * dpr;
    const scanY = (((t * 0.32) % 1.4) - 0.2) * H * dpr;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.filter = "none";
    g.clearRect(0, 0, canvas.width, canvas.height);
    // plataforma do holograma: anéis de luz por baixo da forma
    const ry = H * 0.055 * dpr, rx = W * 0.3 * dpr, ey = oy + H * 0.41 * dpr;
    g.lineWidth = 1.2 * dpr; g.strokeStyle = "#48BBAE";
    g.globalAlpha = 0.35; g.beginPath(); g.ellipse(ox, ey, rx, ry, 0, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 0.5; g.setLineDash([6 * dpr, 10 * dpr]); g.lineDashOffset = -t * 30 * dpr;
    g.beginPath(); g.ellipse(ox, ey, rx * 0.78, ry * 0.78, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    const halo = g.createRadialGradient(ox, ey, 0, ox, ey, rx);
    halo.addColorStop(0, "rgba(72,187,174,.28)"); halo.addColorStop(1, "rgba(72,187,174,0)");
    g.globalAlpha = 1; g.fillStyle = halo; g.beginPath(); g.ellipse(ox, ey, rx, ry * 1.6, 0, 0, Math.PI * 2); g.fill();
    buckets.clear();
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      const x = A[i3] + (B[i3] - A[i3]) * m + jit[i3] * burst;
      const y = A[i3 + 1] + (B[i3 + 1] - A[i3 + 1]) * m + jit[i3 + 1] * burst;
      const z = A[i3 + 2] + (B[i3 + 2] - A[i3 + 2]) * m + jit[i3 + 2] * burst * 1.3;
      const x1 = x * cY + z * sY, z1 = -x * sY + z * cY;
      const y1 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
      const f = focal / (focal + z2);
      proj[i3] = ox + x1 * sc * f; proj[i3 + 1] = oy + y1 * sc * f; proj[i3 + 2] = f;
      const c = (m < 0.5 ? from.col : to.col)[i];
      const b = buckets.get(c); if (b) b.push(i); else buckets.set(c, [i]);
    }
    // linhas (contornos e costuras), que se desfazem durante a transformação
    const la = Math.pow(1 - Math.sin(Math.PI * m), 6) * 0.38;
    if (la > 0.02) {
      const Ls = cur.links;
      g.globalAlpha = la; g.strokeStyle = "#8EF0E4"; g.lineWidth = 0.7 * dpr; g.beginPath();
      for (let j = 0; j < Ls.length; j += 2) { const a = Ls[j] * 3, b = Ls[j + 1] * 3; g.moveTo(proj[a], proj[a + 1]); g.lineTo(proj[b], proj[b + 1]); }
      g.stroke();
    }
    // pontos de luz, agrupados por cor
    const base = 1.55 * dpr * (small ? 1.1 : 1);
    g.globalAlpha = 0.92;
    buckets.forEach((list, c) => {
      g.fillStyle = palette[c]; g.beginPath();
      for (const i of list) { const s = base * proj[i * 3 + 2] * (i % 47 === 0 ? 2 : 1); g.rect(proj[i * 3] - s / 2, proj[i * 3 + 1] - s / 2, s, s); }
      g.fill();
    });
    // linha de varrimento: os pontos por onde passa acendem
    g.globalAlpha = 0.9; g.fillStyle = "#FFFFFF"; g.beginPath();
    for (let i = 0; i < N; i++) { if (Math.abs(proj[i * 3 + 1] - scanY) < 5 * dpr) { const s = base * 1.6; g.rect(proj[i * 3] - s / 2, proj[i * 3 + 1] - s / 2, s, s); } }
    g.fill();
    if (glow) { g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.55; g.filter = `blur(${4 * dpr}px)`; g.drawImage(canvas, 0, 0); g.filter = "none"; }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    if (running && !reduce) raf = requestAnimationFrame(draw);
  };

  (async () => {
    for (const [name, url, fallback] of [["soca", images.soca, drawClog], ["meia", images.meia, drawSock]] as const) {
      const im = url ? await loadImage(url) : null;
      const cl = (im && analyse(fit(im), name, N, false)) || analyse(fallback, name, N, true);
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
