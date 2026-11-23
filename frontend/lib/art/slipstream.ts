/**
 * Slipstream: seeded generative background (see frontend/art/slipstream.md).
 * Pure functions, no DOM: the same seed and parameters always give the same scene.
 */

export interface ArtParams {
  seed: number;
  /** Number of lines. */
  density: number;
  /** 0–1: strength of the curl noise away from the circuit. */
  wander: number;
  /** 0–1: how narrow the circuit's pull is. */
  tightness: number;
}

export const DEFAULT_ART: ArtParams = { seed: 7, density: 850, wander: 0.55, tightness: 0.5 };
export const DENSITY_RANGE = [300, 1600] as const;

export interface Line {
  /** x0,y0,x1,y1,… in canvas pixels. */
  pts: Float32Array;
  /** 0–1 proximity to the circuit: brightness and comet eligibility. */
  weight: number;
  /** 0 amber, 1 warm white, 2 rust. */
  tone: 0 | 1 | 2;
  width: number;
}

export interface Scene {
  w: number;
  h: number;
  lines: Line[];
}

/** Small fast seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/** Seeded smooth value noise in [-1, 1], three octaves. */
function makeNoise(rand: () => number) {
  const N = 64;
  const grid = new Float32Array(N * N);
  for (let i = 0; i < grid.length; i++) grid[i] = rand() * 2 - 1;
  const at = (x: number, y: number) => grid[(y & (N - 1)) * N + (x & (N - 1))];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const base = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const sx = smooth(x - xi);
    const sy = smooth(y - yi);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
  return (x: number, y: number) => (base(x, y) * 0.6 + base(x * 2.1, y * 2.1) * 0.28 + base(x * 4.3, y * 4.3) * 0.12);
}

interface Circuit {
  /** Sample points x,y interleaved. */
  pts: Float32Array;
  count: number;
}

function makeCircuit(rand: () => number, w: number, h: number): Circuit {
  const count = 240;
  const k2 = 0.12 + rand() * 0.16;
  const k3 = 0.05 + rand() * 0.09;
  const p2 = rand() * Math.PI * 2;
  const p3 = rand() * Math.PI * 2;
  const p4 = rand() * Math.PI * 2;
  const norm = 1 / (1 + k2 + k3);
  const cx = w * (0.5 + (rand() - 0.5) * 0.12);
  const cy = h * (0.5 + (rand() - 0.5) * 0.12);
  const ax = w * 0.38 * norm;
  const ay = h * 0.34 * norm;
  const pts = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    pts[i * 2] = cx + ax * (Math.cos(t) + k2 * Math.cos(2 * t + p2) + k3 * Math.cos(3 * t + p3));
    pts[i * 2 + 1] = cy + ay * (Math.sin(t) + k2 * Math.sin(2 * t + p4) - k3 * Math.sin(3 * t + p3));
  }
  return { pts, count };
}

const GX = 72;

/** Distance to, and direction of, the nearest stretch of circuit on a coarse grid. */
function makeField(c: Circuit, w: number, h: number) {
  const gy = Math.max(2, Math.round((GX * h) / w));
  const dist = new Float32Array((GX + 1) * (gy + 1));
  const tx = new Float32Array(dist.length);
  const ty = new Float32Array(dist.length);
  for (let j = 0; j <= gy; j++) {
    for (let i = 0; i <= GX; i++) {
      const px = (i / GX) * w;
      const py = (j / gy) * h;
      let best = Infinity;
      let bx = 0;
      let by = 0;
      for (let s = 0; s < c.count; s++) {
        const x0 = c.pts[s * 2];
        const y0 = c.pts[s * 2 + 1];
        const n = (s + 1) % c.count;
        const dx = c.pts[n * 2] - x0;
        const dy = c.pts[n * 2 + 1] - y0;
        const len2 = dx * dx + dy * dy || 1;
        const u = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
        const ex = x0 + dx * u - px;
        const ey = y0 + dy * u - py;
        const d2 = ex * ex + ey * ey;
        if (d2 < best) {
          best = d2;
          const l = Math.sqrt(len2);
          bx = dx / l;
          by = dy / l;
        }
      }
      const k = j * (GX + 1) + i;
      dist[k] = Math.sqrt(best);
      tx[k] = bx;
      ty[k] = by;
    }
  }
  const sample = (x: number, y: number) => {
    const fx = Math.max(0, Math.min(GX - 1e-6, (x / w) * GX));
    const fy = Math.max(0, Math.min(gy - 1e-6, (y / h) * gy));
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const k = j * (GX + 1) + i;
    const lerp = (a: Float32Array) => (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + GX + 1] * (1 - u) + a[k + GX + 2] * u) * v;
    return { d: lerp(dist), tx: lerp(tx), ty: lerp(ty) };
  };
  return sample;
}

export function buildScene(p: ArtParams, w: number, h: number): Scene {
  const rand = mulberry32(p.seed * 7919 + 13);
  const noise = makeNoise(rand);
  const circuit = makeCircuit(rand, w, h);
  const field = makeField(circuit, w, h);
  const unit = Math.min(w, h);
  const sigma = unit * (0.2 - 0.15 * Math.max(0, Math.min(1, p.tightness)));
  const heat = unit * 0.09;
  const wander = Math.max(0, Math.min(1, p.wander));
  const step = Math.max(2.2, unit * 0.0036);
  const eps = 1.5;
  const nScale = 1 / (unit * 0.32);

  /** Divergence-free swirl from the noise as a stream function. */
  const curl = (x: number, y: number): [number, number] => {
    const a = noise((x + eps) * nScale, y * nScale) - noise((x - eps) * nScale, y * nScale);
    const b = noise(x * nScale, (y + eps) * nScale) - noise(x * nScale, (y - eps) * nScale);
    return [b, -a];
  };

  const lines: Line[] = [];
  const count = Math.max(1, Math.round(p.density));
  for (let n = 0; n < count; n++) {
    let x: number;
    let y: number;
    if (rand() < 0.62) {
      const s = Math.floor(rand() * circuit.count);
      const a = circuit.pts[s * 2];
      const b = circuit.pts[s * 2 + 1];
      const nx = circuit.pts[((s + 1) % circuit.count) * 2 + 1] - b;
      const ny = -(circuit.pts[((s + 1) % circuit.count) * 2] - a);
      const nl = Math.hypot(nx, ny) || 1;
      const off = gauss(rand) * sigma * 0.9;
      x = a + (nx / nl) * off;
      y = b + (ny / nl) * off;
    } else {
      x = (rand() * 1.2 - 0.1) * w;
      y = (rand() * 1.2 - 0.1) * h;
    }
    const steps = 70 + Math.floor(rand() * 90);
    const pts: number[] = [x, y];
    let near = 0;
    let used = 0;
    for (let i = 0; i < steps; i++) {
      const f = field(x, y);
      const wgt = Math.exp(-((f.d / sigma) ** 2));
      const [cx, cy] = curl(x, y);
      let vx = wgt * f.tx + (1 - wgt) * wander * cx * 2.4;
      let vy = wgt * f.ty + (1 - wgt) * wander * cy * 2.4;
      const l = Math.hypot(vx, vy);
      if (l < 1e-4) break;
      vx /= l;
      vy /= l;
      x += vx * step;
      y += vy * step;
      // Heat is absolute closeness to the racing line, so a tight setting gives narrow, hot ribbons.
      near += Math.exp(-((f.d / heat) ** 2));
      used++;
      if (x < -w * 0.1 || x > w * 1.1 || y < -h * 0.1 || y > h * 1.1) break;
      pts.push(x, y);
    }
    if (pts.length < 8) continue;
    const weight = used ? near / used : 0;
    const r = rand();
    lines.push({
      pts: Float32Array.from(pts),
      weight,
      tone: r < 0.55 ? 0 : r < 0.7 ? 1 : 2,
      width: (0.5 + rand() * 0.9) * Math.max(1, unit / 900),
    });
  }
  return { w, h, lines };
}

// ---------------------------------------------------------------------------
// Drawing (accepts any Canvas 2D context)
// ---------------------------------------------------------------------------

const TONES = ["255,162,77", "255,238,222", "190,92,62"] as const;
/** Tapered alpha for the four quarters of a line. */
const TAPER = [0.35, 1, 1, 0.35];

/** Draw lines [from, to) additively. `alpha` scales the whole piece (0–1). */
export function drawLines(ctx: CanvasRenderingContext2D, scene: Scene, from: number, to: number, alpha: number) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = from; i < Math.min(to, scene.lines.length); i++) {
    const ln = scene.lines[i];
    const n = ln.pts.length / 2;
    const base = (0.1 + 0.34 * ln.weight) * alpha;
    ctx.lineWidth = ln.width;
    for (let q = 0; q < 4; q++) {
      const a = Math.floor((q / 4) * (n - 1));
      const b = Math.min(n - 1, Math.floor(((q + 1) / 4) * (n - 1)) + 1);
      ctx.strokeStyle = `rgba(${TONES[ln.tone]},${(base * TAPER[q]).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(ln.pts[a * 2], ln.pts[a * 2 + 1]);
      for (let k = a + 1; k <= b; k++) ctx.lineTo(ln.pts[k * 2], ln.pts[k * 2 + 1]);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Indices of the hottest lines, for comets. */
export function hottest(scene: Scene, n: number): number[] {
  return scene.lines
    .map((l, i) => [l.weight * Math.min(1, l.pts.length / 160), i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, n)
    .map(([, i]) => i);
}
