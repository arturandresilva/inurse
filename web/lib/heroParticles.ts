// Animação do destaque da página inicial: centenas de pequenos corações (o coração do logótipo) que formam
// o símbolo iNurse, uma soca e uma meia, rodam em 3D e se transformam de uma forma na outra.
// Canvas 2D puro, sem bibliotecas. Pára quando sai do ecrã ou o separador fica escondido.

type Shape = { name: string; path: Path2D; depth: number; color: (x: number, y: number) => number; holes?: number[][] };
type P = { a: number[]; ca: number; jitter: number[]; phase: number };


// cores das partículas: 0 coral, 1 menta, 2 branco
const COLORS = ["#F27C79", "#48BBAE", "#FFFFFF"];

// formas desenhadas numa caixa de 200×200
function heartPath() {
  const p = new Path2D();
  p.moveTo(100, 172);
  p.bezierCurveTo(88, 160, 28, 128, 28, 82);
  p.bezierCurveTo(28, 50, 52, 32, 76, 32);
  p.bezierCurveTo(90, 32, 98, 40, 100, 50);
  p.bezierCurveTo(102, 40, 110, 32, 124, 32);
  p.bezierCurveTo(148, 32, 172, 50, 172, 82);
  p.bezierCurveTo(172, 128, 112, 160, 100, 172);
  p.closePath();
  return p;
}
function clogPath() {
  // soca de perfil: calcanhar aberto à esquerda, biqueira fechada à direita, sola grossa
  const p = new Path2D();
  p.moveTo(14, 150);
  p.lineTo(168, 150);
  p.bezierCurveTo(186, 150, 194, 140, 192, 124);
  p.bezierCurveTo(190, 96, 168, 80, 140, 74);
  p.bezierCurveTo(116, 69, 92, 74, 78, 86);
  p.bezierCurveTo(70, 94, 64, 104, 60, 110);
  p.lineTo(36, 112);
  p.bezierCurveTo(22, 112, 14, 118, 14, 128);
  p.closePath();
  // correia do calcanhar
  const s = new Path2D();
  s.moveTo(20, 118);
  s.bezierCurveTo(18, 92, 40, 86, 62, 100);
  s.lineTo(58, 108);
  s.bezierCurveTo(42, 98, 30, 102, 30, 118);
  s.closePath();
  p.addPath(s);
  return p;
}
function sockPath() {
  // meia de compressão de perfil (até ao joelho)
  const p = new Path2D();
  p.moveTo(66, 14);
  p.lineTo(118, 14);
  p.lineTo(118, 112);
  p.bezierCurveTo(118, 126, 126, 134, 140, 138);
  p.lineTo(172, 148);
  p.bezierCurveTo(192, 154, 194, 180, 172, 184);
  p.lineTo(96, 186);
  p.bezierCurveTo(70, 186, 60, 170, 64, 146);
  p.lineTo(66, 128);
  p.closePath();
  return p;
}

const SHAPES: Shape[] = [
  { name: "logo", path: heartPath(), depth: 26, color: () => 0 },
  { name: "soca", path: clogPath(), depth: 34, color: (x, y) => (y > 138 ? 1 : x < 64 && y < 118 ? 1 : 0),
    holes: [[118, 86], [136, 84], [154, 90], [170, 102], [128, 102], [146, 104], [164, 118], [110, 104]] },
  { name: "meia", path: sockPath(), depth: 22, color: (x, y) => (y < 30 ? 1 : (y > 140 && x > 160) || (y > 150 && x < 90) ? 1 : 0) },
];

function sample(shape: Shape, n: number): { pts: number[][]; col: number[] } {
  const c = document.createElement("canvas");
  c.width = c.height = 200;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fill(shape.path);
  if (shape.holes) { g.globalCompositeOperation = "destination-out"; shape.holes.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 4.2, 0, Math.PI * 2); g.fill(); }); }
  const data = g.getImageData(0, 0, 200, 200).data;
  const isIn = (x: number, y: number) => x >= 0 && y >= 0 && x < 200 && y < 200 && data[(y * 200 + x) * 4 + 3] > 128;
  const inside: number[][] = [], edge: number[][] = [];
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) if (isIn(x, y)) {
    (isIn(x - 2, y) && isIn(x + 2, y) && isIn(x, y - 2) && isIn(x, y + 2) ? inside : edge).push([x, y]);
  }
  // casca 3D: o contorno forma as "paredes" (z ao longo da espessura) e o interior forma as faces da frente e de trás
  const pts: number[][] = []; const col: number[] = [];
  for (let i = 0; i < n; i++) {
    const onEdge = i % 2 === 0;
    const src = onEdge ? edge : inside;
    const [x0, y0] = src[Math.floor(Math.random() * src.length)];
    const x = x0 + Math.random() - 0.5, y = y0 + Math.random() - 0.5;
    const z = onEdge ? (Math.random() * 2 - 1) * shape.depth : (Math.random() < 0.5 ? -1 : 1) * shape.depth * (0.75 + Math.random() * 0.25);
    pts.push([x - 100, y - 100, z]);
    col.push(Math.random() < 0.05 ? 2 : shape.color(x, y));
  }
  return { pts, col };
}

function heartSprite(color: string, px: number) {
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d")!;
  g.scale(px / 200, px / 200);
  g.shadowColor = color; g.shadowBlur = 40;
  g.fillStyle = color;
  g.fill(heartPath());
  return c;
}

export function startHeroParticles(canvas: HTMLCanvasElement, onShape?: (name: string) => void) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, dpr = 1, N = 0;
  let sets: { pts: number[][]; col: number[] }[] = [];
  let parts: P[] = [];
  const sprites: HTMLCanvasElement[] = [];

  const build = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const want = Math.round(Math.min(1300, Math.max(500, (W * H) / 150)));
    if (want !== N) {
      N = want;
      sets = SHAPES.map((s) => sample(s, N));
      parts = Array.from({ length: N }, () => ({ a: [0, 0, 0], ca: 0, jitter: [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1], phase: Math.random() * Math.PI * 2 }));
    }
    sprites.length = 0;
    COLORS.forEach((c) => sprites.push(heartSprite(c, Math.round(26 * dpr))));
  };
  build();

  // sequência: logo → soca → meia → logo …
  const HOLD = 3.4, MORPH = 1.8, STEP = HOLD + MORPH;
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let mx = 0, my = 0, tx = 0, ty = 0;
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  let raf = 0, running = false, t0 = performance.now(), lastShape = -1, paused = 0, pausedAt = 0;
  const frame = (now: number) => {
    const t = Math.max(0, (now - t0 - paused) / 1000);
    const k = Math.floor(t / STEP), local = t - k * STEP;
    const from = k % SHAPES.length, to = (k + 1) % SHAPES.length;
    const m = local < HOLD ? 0 : ease((local - HOLD) / MORPH);
    const cur = m < 0.5 ? from : to;
    if (cur !== lastShape) { lastShape = cur; onShape?.(SHAPES[cur].name); }
    mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;
    const rotY = Math.sin(t * 0.55) * 0.75 + mx * 0.35 + m * Math.PI * 2 * (k % 2 ? -1 : 1) * 0.5;
    const rotX = -0.12 + my * 0.18 + Math.sin(t * 0.4) * 0.06;
    const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
    const scale = Math.min(W, H) / 230, focal = 520;
    const burst = Math.sin(Math.PI * m) * 46;
    const A = sets[from], B = sets[to];

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < N; i++) {
      const p = parts[i], a = A.pts[i], b = B.pts[i], j = p.jitter;
      const breathe = Math.sin(t * 1.6 + p.phase) * 1.2;
      let x = a[0] + (b[0] - a[0]) * m + j[0] * (burst + breathe);
      let y = a[1] + (b[1] - a[1]) * m + j[1] * (burst + breathe);
      let z = a[2] + (b[2] - a[2]) * m + j[2] * (burst * 1.4);
      // rotação 3D e perspetiva
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      const y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
      const f = focal / (focal + z2 * 1.4);
      const px = (W / 2 + x1 * scale * f) * dpr, py = (H / 2 + 6 + y1 * scale * f) * dpr;
      const size = (2.1 + (f - 0.8) * 3.4) * scale * dpr * (p.phase > 6.05 ? 1.7 : 1);
      ctx.globalAlpha = Math.max(0.25, Math.min(0.95, 0.3 + (f - 0.75) * 1.8));
      const c = m < 0.5 ? A.col[i] : B.col[i];
      ctx.drawImage(sprites[c], px - size, py - size, size * 2, size * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    if (running && !reduce) raf = requestAnimationFrame(frame);
  };

  const start = () => { if (running) return; running = true; if (pausedAt) { paused += performance.now() - pausedAt; pausedAt = 0; } raf = requestAnimationFrame(frame); };
  const stop = () => { if (!running) return; running = false; pausedAt = performance.now(); cancelAnimationFrame(raf); };

  if (reduce) { t0 = performance.now() - (STEP + 0.5) * 1000; frame(performance.now()); return () => window.removeEventListener("pointermove", onMove); }

  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible && !document.hidden ? start() : stop(); });
  io.observe(canvas);
  const onVis = () => (visible && !document.hidden ? start() : stop());
  document.addEventListener("visibilitychange", onVis);
  const ro = new ResizeObserver(() => { build(); if (!running) frame(performance.now()); });
  ro.observe(canvas);
  start();
  return () => { stop(); io.disconnect(); ro.disconnect(); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pointermove", onMove); };
}

