// Destaque da página inicial: modelos 3D verdadeiros feitos de partículas de luz (WebGL, sem bibliotecas).
// O coração do símbolo iNurse, uma soca e um collant de compressão são gerados em 3D (superfícies matemáticas),
// rodam 360° e transformam-se uns nos outros, sobre um chão de ondas concêntricas de partículas.
// Pára fora do ecrã; com "reduzir movimento" mostra um único fotograma.

type V3 = [number, number, number];
type Shape = { name: string; pos: Float32Array; col: Float32Array; nor: Float32Array };

// ---------- funções de distância (SDF) ----------
const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);
const len2 = (x: number, y: number) => Math.sqrt(x * x + y * y);
function ellipsoid(x: number, y: number, z: number, a: number, b: number, c: number) {
  const k0 = len3(x / a, y / b, z / c), k1 = len3(x / (a * a), y / (b * b), z / (c * c));
  return k1 === 0 ? -Math.min(a, b, c) : (k0 * (k0 - 1)) / k1;
}
function cone(p: V3, a: V3, b: V3, r1: number, r2: number) { // cápsula com raio variável
  const pa = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const h = Math.max(0, Math.min(1, (pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / (ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2])));
  return len3(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h) - (r1 + (r2 - r1) * h);
}
const smin = (a: number, b: number, k: number) => { const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k)); return b + (a - b) * h - k * h * (1 - h); };

// amostra pontos à superfície (|d| < eps) de uma SDF dentro de uma caixa; cor dada por uma função
type Raw = { pos: Float32Array; col: Float32Array; nor: Float32Array };
function sampleSDF(sdf: (x: number, y: number, z: number) => number, box: [V3, V3], n: number, eps: number, color: (x: number, y: number, z: number) => V3, inner = 0.08): Raw {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const [lo, hi] = box; let k = 0, guard = 0;
  while (k < n && guard < n * 4000) {
    guard++;
    const x = lo[0] + Math.random() * (hi[0] - lo[0]), y = lo[1] + Math.random() * (hi[1] - lo[1]), z = lo[2] + Math.random() * (hi[2] - lo[2]);
    const d = sdf(x, y, z);
    const ok = Math.abs(d) < eps || (d < 0 && Math.random() < inner * 0.02);
    if (!ok) continue;
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    const c = color(x, y, z); col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
    const e = 0.004, gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e), gl = len3(gx, gy, gz) || 1;
    nor[k * 3] = gx / gl; nor[k * 3 + 1] = gy / gl; nor[k * 3 + 2] = gz / gl;
    k++;
  }
  return { pos, col, nor };
}

// centra, escala para caber numa altura/largura dada e ordena por altura (as transformações fluem de cima a baixo)
function normalise(name: string, s: Raw, size: number): Shape {
  const n = s.pos.length / 3; let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (let i = 0; i < n; i++) { const x = s.pos[i * 3], y = s.pos[i * 3 + 1], z = s.pos[i * 3 + 2];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const k = size / Math.max(x1 - x0, y1 - y0, z1 - z0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => (s.pos[b * 3 + 1] + Math.random() * 0.04) - (s.pos[a * 3 + 1] + Math.random() * 0.04));
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  idx.forEach((j, i) => {
    nor[i * 3] = s.nor[j * 3]; nor[i * 3 + 1] = s.nor[j * 3 + 1]; nor[i * 3 + 2] = s.nor[j * 3 + 2];
    pos[i * 3] = (s.pos[j * 3] - cx) * k; pos[i * 3 + 1] = (s.pos[j * 3 + 1] - cy) * k; pos[i * 3 + 2] = (s.pos[j * 3 + 2] - cz) * k;
    col[i * 3] = s.col[j * 3]; col[i * 3 + 1] = s.col[j * 3 + 1]; col[i * 3 + 2] = s.col[j * 3 + 2];
  });
  return { name, pos, col, nor };
}

const MINT: V3 = [0.28, 0.78, 0.72], CORAL: V3 = [0.98, 0.45, 0.43], DEEP: V3 = [0.1, 0.45, 0.48], ICE: V3 = [0.62, 0.95, 0.92];
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ---------- coração do símbolo (superfície implícita) + haste do i ----------
function heart(n: number): Shape {
  const sdf = (x: number, y: number, z: number) => {
    if (y < -1.0) return cone([x, y, z], [0, -1.32, 0], [0, -1.78, 0], 0.17, 0.17);  // haste
    const F = (X: number, Y: number, Z: number) => { const a = X * X + 2.25 * Z * Z + Y * Y - 1; return a * a * a - X * X * Y * Y * Y - 0.1125 * Z * Z * Y * Y * Y; };
    const X = x, Y = y - 0.05, Z = z;
    const f = F(X, Y, Z);
    if (Math.abs(f) > 0.25) return f;
    const e = 1e-3, gx = (F(X + e, Y, Z) - F(X - e, Y, Z)) / (2 * e), gy = (F(X, Y + e, Z) - F(X, Y - e, Z)) / (2 * e), gz = (F(X, Y, Z + e) - F(X, Y, Z - e)) / (2 * e);
    return f / Math.max(0.05, len3(gx, gy, gz));
  };
  const s = sampleSDF(sdf, [[-1.3, -1.95, -0.8], [1.3, 1.35, 0.8]], n, 0.014, (x, y, z) => {
    if (y < -1.0) return mix(MINT, ICE, clamp01(0.3 + x * 2));
    const light = clamp01(0.5 + y * 0.35 - x * 0.25 + z * 0.4);
    return mix(mix([0.7, 0.22, 0.25], CORAL, clamp01(light * 1.6)), [1, 0.93, 0.92], clamp01((light - 0.72) * 3));
  });
  return normalise("logo", s, 2.2);
}

// ---------- soca (sola com balanço, gáspea alta com furos, calcanhar baixo e correia por cima) ----------
function clog(n: number): Shape {
  const U = { cx: 0.3, cy: 0.04, a: 0.78, b: 0.6, c: 0.42 };       // gáspea (elipsoide)
  const surf = (x: number, z: number) => U.cy + U.b * Math.sqrt(Math.max(0, 1 - ((x - U.cx) / U.a) ** 2 - (z / U.c) ** 2));
  const holes: V3[] = [];
  for (const x of [0.05, 0.27, 0.49, 0.7]) for (const sd of [-1, 1]) { const y = 0.2; holes.push([x, y, sd * U.c * Math.sqrt(Math.max(0, 1 - ((x - U.cx) / U.a) ** 2 - ((y - U.cy) / U.b) ** 2))]); }
  for (const [x, z] of [[0.28, -0.17], [0.28, 0.17], [0.48, 0], [0.6, -0.18], [0.6, 0.18], [0.78, -0.08], [0.78, 0.08]]) holes.push([x, surf(x, z), z]);
  const foot = (x: number, z: number) => smin((len2((x - 0.35) / 0.68, z / 0.43) - 1) * 0.43, (len2((x + 0.5) / 0.52, z / 0.35) - 1) * 0.35, 0.16);
  const soleBot = (x: number) => -0.07 + 0.22 * Math.max(0, x - 0.62) ** 2 + 0.1 * Math.max(0, -x - 0.75) ** 2; // balanço
  const strapY = (x: number) => 0.34 + 0.16 * Math.max(0, Math.min(1, (-x - 0.05) / 0.7));
  const parts = (x: number, y: number, z: number) => {
    const sb = soleBot(x);
    const sole = Math.max(foot(x, z), sb - y, y - (sb + 0.11)) - 0.012;
    let up = Math.abs(ellipsoid(x - U.cx, y - U.cy, z, U.a, U.b, U.c)) - 0.02;
    up = Math.max(up, -(y - 0.03), -(x + 0.18), -ellipsoid(x + 0.22, y - 0.66, z, 0.44, 0.3, 0.36));
    for (const h of holes) up = Math.max(up, -(len3(x - h[0], y - h[1], z - h[2]) - 0.07));
    const cup = Math.max(Math.abs(ellipsoid(x + 0.4, y - 0.03, z, 0.64, 0.3, 0.38)) - 0.02, -(y - 0.03), x + 0.12);
    const strap = Math.max(len2(len2(x + 0.42, z) - 0.39, (y - strapY(x)) * 1.2) - 0.055, x + 0.08, -(y - 0.1));
    return { sole, up, cup, strap };
  };
  const sdf = (x: number, y: number, z: number) => { const p = parts(x, y, z); return Math.min(p.sole, p.up, p.cup, p.strap); };
  const s = sampleSDF(sdf, [[-1.2, -0.12, -0.52], [1.2, 0.72, 0.52]], n, 0.01, (x, y, z) => {
    const p = parts(x, y, z);
    if (p.sole <= Math.min(p.up, p.cup, p.strap)) { const top = y > soleBot(x) + 0.085 ? 0.6 : 0; return mix(DEEP, ICE, top); } // sola escura, aresta clara
    let nearHole = 9; for (const h of holes) nearHole = Math.min(nearHole, len3(x - h[0], y - h[1], z - h[2]));
    const open = Math.abs(ellipsoid(x + 0.22, y - 0.66, z, 0.44, 0.3, 0.36));
    const edge = nearHole < 0.1 || (open < 0.035 && p.up < 0.02) || (p.strap < 0.02 && Math.abs(y - strapY(x)) > 0.045) ? 1 : 0;
    const light = clamp01(0.3 + y * 1.1 + z * 0.25);
    return mix(mix(MINT, ICE, light * 0.6), [0.92, 1, 0.98], edge * 0.8);
  });
  return normalise("soca", s, 2.7);
}

// ---------- collant de compressão (cinta, duas pernas, pés em bicos) ----------
function tights(n: number): Shape {
  const legs: [V3, number][][] = [-1, 1].map((s) => {
    const f = s < 0 ? 0.07 : -0.05; // uma perna ligeiramente à frente
    return [
      [[s * 0.19, 0.6, 0], 0.16], [[s * 0.19, 0.22, 0.02 + f * 0.3], 0.125], [[s * 0.17, -0.14, 0.05 + f * 0.6], 0.08],
      [[s * 0.17, -0.44, 0.0 + f * 0.8], 0.09], [[s * 0.16, -0.84, -0.02 + f], 0.05], [[s * 0.16, -0.93, -0.06 + f], 0.058],
      [[s * 0.16, -1.03, 0.08 + f], 0.047], [[s * 0.16, -1.08, 0.17 + f], 0.032],
    ] as [V3, number][];
  });
  const sdf = (x: number, y: number, z: number) => {
    const p: V3 = [x, y, z];
    let d = Math.max(ellipsoid(x, y - 0.68, z, 0.35, 0.3, 0.23), y - 0.9);
    for (const leg of legs) { let l = 9; for (let i = 0; i < leg.length - 1; i++) l = smin(l, cone(p, leg[i][0], leg[i + 1][0], leg[i][1], leg[i + 1][1]), 0.03); d = smin(d, l, 0.06); }
    return d;
  };
  const s = sampleSDF(sdf, [[-0.5, -1.15, -0.3], [0.5, 0.92, 0.35]], n, 0.01, (x, y, z) => {
    const knit = 0.78 + 0.22 * Math.sin(y * 95);                       // malha
    const grad = clamp01((-y + 0.4) * 0.55);                             // compressão graduada: mais forte no tornozelo
    const band = y > 0.82 ? 1 : 0;                                       // cinta
    const light = clamp01(0.45 + z * 1.2 - x * 0.4);
    const c = mix(mix(MINT, ICE, light * 0.55 + grad * 0.35), [0.95, 1, 1], band * 0.7);
    return [c[0] * knit, c[1] * knit, c[2] * knit];
  });
  return normalise("meia", s, 2.3);
}

// ---------- WebGL ----------
const VS = `
attribute vec3 aA; attribute vec3 aB; attribute vec3 aCA; attribute vec3 aCB; attribute vec4 aR; attribute vec3 aNA; attribute vec3 aNB;
uniform mat4 uPV; uniform float uM, uT, uRot, uSize, uBurst, uDpr;
varying vec3 vC; varying float vA;
void main(){
  float b = sin(3.14159 * uM);
  vec3 p = mix(aA, aB, smoothstep(0.0, 1.0, uM)) + aR.xyz * (uBurst * b + 0.006 * sin(uT * 2.0 + aR.w * 6.283));
  float c = cos(uRot + b * aR.w * 1.5), s = sin(uRot + b * aR.w * 1.5);
  p = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
  vec3 n = normalize(mix(aNA, aNB, uM) + 1e-4);
  n = vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c);
  float face = smoothstep(-0.15, 0.7, n.z);                 // faces viradas para a câmara
  float rim = pow(1.0 - abs(n.z), 3.0);                     // contorno luminoso (fresnel)
  float shade = mix(0.12 + 0.88 * face + 0.9 * rim * step(0.0, n.z + 0.2), 0.8, b);
  gl_Position = uPV * vec4(p, 1.0);
  float tw = 0.75 + 0.25 * sin(uT * 3.0 + aR.w * 40.0);
  gl_PointSize = uSize * uDpr * (0.7 + 0.8 * fract(aR.w * 13.7)) / gl_Position.w;
  vC = mix(aCA, aCB, uM) * tw * shade; vA = 1.0;
}`;
const FS = `
precision mediump float; varying vec3 vC; varying float vA; uniform float uAlpha;
void main(){ vec2 q = gl_PointCoord - 0.5; float d = dot(q, q) * 4.0; if (d > 1.0) discard; float a = exp(-d * 3.2); vec3 c = vC * a * uAlpha; gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); }`;
const VS_FLOOR = `
attribute vec3 aP; uniform mat4 uPV; uniform float uT, uDpr, uY;
varying float vA;
void main(){
  float r = length(aP.xz);
  float w = sin(r * 7.0 - uT * 2.2);
  vec3 p = vec3(aP.x, uY + w * 0.025, aP.z);
  gl_Position = uPV * vec4(p, 1.0);
  vA = (0.3 + 1.2 * pow(0.5 + 0.5 * w, 6.0)) * smoothstep(2.6, 0.5, r) * aP.y;
  gl_PointSize = 9.0 * uDpr / gl_Position.w;
}`;
const FS_FLOOR = `
precision mediump float; varying float vA;
void main(){ vec2 q = gl_PointCoord - 0.5; float d = dot(q, q) * 4.0; if (d > 1.0) discard; vec3 c = vec3(0.3, 0.85, 0.78) * vA * (1.0 - d); gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); }`;

function program(gl: WebGLRenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  return p;
}
function perspective(fov: number, asp: number, near: number, far: number) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function mul(a: number[], b: number[]) { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; }
function view(dist: number, elev: number, lift: number) { // câmara a olhar para a origem, um pouco acima
  const c = Math.cos(elev), s = Math.sin(elev);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, -lift * c, -dist, 1];
}

export type Hero3DHandlers = { onShape?: (name: string) => void };
export function startHero3D(canvas: HTMLCanvasElement, h: Hero3DHandlers = {}) {
  const gl = (canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true }) as WebGLRenderingContext | null);
  if (!gl) return () => {};
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = window.innerWidth < 700;
  const N = small ? 11000 : 24000;
  let prog: WebGLProgram, floorProg: WebGLProgram;
  try { prog = program(gl, VS, FS); floorProg = program(gl, VS_FLOOR, FS_FLOOR); } catch { return () => {}; }

  // formas: o coração já; as outras logo a seguir, sem bloquear a página
  const shapes: Shape[] = [heart(N)];
  let alive = true;
  const later = (fn: () => void) => ((window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 60)))(fn);
  later(() => { if (alive) shapes.push(clog(N)); later(() => { if (alive) shapes.push(tights(N)); }); });

  const buf = (data: Float32Array) => { const b = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
  const rnd = new Float32Array(N * 4); for (let i = 0; i < N; i++) { const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u); rnd.set([r * Math.cos(th), u, r * Math.sin(th), Math.random()], i * 4); }
  const bR = buf(rnd);
  const cache = new Map<Shape, { p: WebGLBuffer; c: WebGLBuffer; n: WebGLBuffer }>();
  const bufs = (s: Shape) => { let b = cache.get(s); if (!b) { b = { p: buf(s.pos), c: buf(s.col), n: buf(s.nor) }; cache.set(s, b); } return b; };
  // chão: anéis concêntricos de partículas
  const FN = small ? 4000 : 9000, fl = new Float32Array(FN * 3);
  for (let i = 0; i < FN; i++) { const ring = 1 + Math.floor(Math.random() * 13), r = ring * 0.19 + (Math.random() - 0.5) * 0.02, a = Math.random() * Math.PI * 2; fl.set([Math.cos(a) * r, 0.55 + Math.random() * 0.45, Math.sin(a) * r], i * 3); }
  const bF = buf(fl);

  const L = (p: WebGLProgram, n: string) => gl.getAttribLocation(p, n);
  const U = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const attr = (loc: number, b: WebGLBuffer, size: number) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };

  let W = 1, H = 1, dpr = 1;
  const resize = () => { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = Math.max(1, r.width); H = Math.max(1, r.height); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); };
  resize();

  const HOLD = 5.0, MORPH = 2.4, STEP = HOLD + MORPH;
  let mx = 0, my = 0, tx = 0, ty = 0;
  const onMove = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2; };
  window.addEventListener("pointermove", onMove, { passive: true });

  let raf = 0, running = false, t0 = performance.now(), paused = 0, pausedAt = 0, last = "";
  const draw = (now: number) => {
    const t = reduce ? HOLD * 0.6 + STEP : Math.max(0, (now - t0 - paused) / 1000);
    const total = shapes.length, k = Math.floor(t / STEP), lt = t - k * STEP;
    const A = shapes[k % total], B = shapes[(k + 1) % total];
    const m = total < 2 || lt < HOLD ? 0 : (lt - HOLD) / MORPH;
    const cur = m < 0.5 ? A : B;
    if (cur.name !== last) { last = cur.name; h.onShape?.(cur.name); }
    mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;
    const asp = W / H;
    const pv = mul(perspective(0.62, asp, 0.1, 50), view(asp < 1 ? 6.8 : 5.6, 0.24 + my * 0.06, 0.1));

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.disable(gl.DEPTH_TEST);

    // chão
    gl.useProgram(floorProg);
    attr(L(floorProg, "aP"), bF, 3);
    gl.uniformMatrix4fv(U(floorProg, "uPV"), false, pv);
    gl.uniform1f(U(floorProg, "uT"), t); gl.uniform1f(U(floorProg, "uDpr"), dpr); gl.uniform1f(U(floorProg, "uY"), -1.45);
    gl.drawArrays(gl.POINTS, 0, FN);
    gl.disableVertexAttribArray(L(floorProg, "aP"));

    // forma
    gl.useProgram(prog);
    const a = bufs(A), b = bufs(B);
    attr(L(prog, "aA"), a.p, 3); attr(L(prog, "aB"), b.p, 3); attr(L(prog, "aCA"), a.c, 3); attr(L(prog, "aCB"), b.c, 3); attr(L(prog, "aR"), bR, 4); attr(L(prog, "aNA"), a.n, 3); attr(L(prog, "aNB"), b.n, 3);
    gl.uniformMatrix4fv(U(prog, "uPV"), false, pv);
    gl.uniform1f(U(prog, "uM"), m); gl.uniform1f(U(prog, "uT"), t);
    gl.uniform1f(U(prog, "uRot"), t * 0.42 + mx * 0.6);
    gl.uniform1f(U(prog, "uSize"), small ? 13.0 : 12.0); gl.uniform1f(U(prog, "uDpr"), dpr);
    gl.uniform1f(U(prog, "uBurst"), 0.9); gl.uniform1f(U(prog, "uAlpha"), small ? 0.8 : 0.66);
    gl.drawArrays(gl.POINTS, 0, N);
    for (const n of ["aA", "aB", "aCA", "aCB", "aR", "aNA", "aNB"]) gl.disableVertexAttribArray(L(prog, n));
    if (running && !reduce) raf = requestAnimationFrame(draw);
  };

  const start = () => { if (running || reduce) return; running = true; if (pausedAt) { paused += performance.now() - pausedAt; pausedAt = 0; } raf = requestAnimationFrame(draw); };
  const stop = () => { if (!running) return; running = false; pausedAt = performance.now(); cancelAnimationFrame(raf); };
  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !document.hidden) start(); else stop(); });
  io.observe(canvas);
  const onVis = () => { if (visible && !document.hidden) start(); else stop(); };
  document.addEventListener("visibilitychange", onVis);
  const ro = new ResizeObserver(() => { resize(); if (!running) draw(performance.now()); });
  ro.observe(canvas);
  if (reduce) later(() => later(() => draw(performance.now()))); else start();
  return () => { alive = false; stop(); io.disconnect(); ro.disconnect(); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pointermove", onMove); };
}
