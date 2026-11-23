/** Pure scale, axis and data helpers for the hand-rolled SVG charts. No React here. */

import type { LapRecord, RaceControlMessage, Stint } from "./types";
import { normaliseCompound, type Compound } from "./timing";

// ---------------------------------------------------------------------------
// Scales and ticks
// ---------------------------------------------------------------------------

export interface Scale {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
}

/** Linear map from `domain` to `range`. A zero-width domain maps to the range midpoint. */
export function scaleLinear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const f = ((v: number) => (span === 0 ? (r0 + r1) / 2 : r0 + ((v - d0) / span) * (r1 - r0))) as Scale;
  f.domain = [d0, d1];
  f.range = [r0, r1];
  return f;
}

/** A "nice" step (1, 2 or 5 × 10^n) that splits `span` into about `count` parts. */
export function niceStep(span: number, count = 5): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  // Round to the nearest nice value on a log scale (same thresholds as d3).
  const nice = norm >= Math.sqrt(50) ? 10 : norm >= Math.sqrt(10) ? 5 : norm >= Math.SQRT2 ? 2 : 1;
  return nice * mag;
}

/** Ticks on nice round values covering [min, max] (inclusive where they land exactly). */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const step = niceStep(hi - lo, count);
  const first = Math.ceil(lo / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = first; v <= hi + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** Expand [min, max] outward to the nearest nice step. */
export function niceDomain(min: number, max: number, count = 5): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) return [min - 1, max + 1];
  const step = niceStep(max - min, count);
  return [Math.floor(min / step + 1e-9) * step, Math.ceil(max / step - 1e-9) * step];
}

/** Lap-axis ticks: 1, then every `step` laps up to `maxLap` (e.g. 1, 10, 20 … 50). */
export function lapTicks(maxLap: number, step = 10): number[] {
  if (!(maxLap >= 1)) return [];
  const out = [1];
  for (let l = step; l <= maxLap; l += step) out.push(l);
  return out;
}

/** [min, max] of the finite values, or null when there are none. */
export function extent(values: Iterable<number | null | undefined>): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo === Infinity ? null : [lo, hi];
}

export function median(values: number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** SVG path through points; a null point breaks the line into a new segment. */
export function linePath(points: ([number, number] | null)[]): string {
  let d = "";
  let pen = false;
  for (const p of points) {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${round(p[0])},${round(p[1])}`;
    pen = true;
  }
  return d;
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

// ---------------------------------------------------------------------------
// Lap times
// ---------------------------------------------------------------------------

/** A lap that shouldn't set the y-scale: in/out laps and laps without a time. */
export function isPitLap(l: LapRecord) {
  return l.pitIn || l.pitOut;
}

/**
 * Y domain for lap times (ms): pit laps excluded, and the top capped at `cap` × the
 * fastest lap and `medianCap` × the median lap, so safety-car, red-flag or stopped
 * laps don't flatten the racing laps into a line. Laps above the cap are drawn at
 * the top edge as "off scale".
 */
export function lapTimeDomain(laps: LapRecord[], cap = 1.6, medianCap = 1.2): [number, number] | null {
  const ms = laps.filter((l) => !isPitLap(l) && l.ms != null && l.ms > 0).map((l) => l.ms as number);
  const e = extent(ms);
  if (!e) return null;
  const mid = median(ms) ?? e[1];
  const hi = Math.max(e[0], Math.min(e[1], e[0] * cap, mid * medianCap));
  const pad = Math.max(250, (hi - e[0]) * 0.08);
  return [e[0] - pad, hi + pad];
}

/** Lap-time axis label: "1:21" on whole-second steps, "1:21.5" on finer ones. */
export function formatLapTick(ms: number, stepMs: number): string {
  const digits = stepMs % 1000 === 0 ? 0 : stepMs % 100 === 0 ? 1 : stepMs % 10 === 0 ? 2 : 3;
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  const sec = s.toFixed(digits).padStart(digits ? 3 + digits : 2, "0");
  return m > 0 ? `${m}:${sec}` : sec;
}

/**
 * Consecutive runs of the same compound across a lap list (for the compound strip).
 * A run also breaks at a pit stop with the same compound: on an in-lap whose record
 * already shows a fresh set (tyre age 0), or on an out-lap unless the run started on
 * the in-lap just before it.
 */
export function compoundRuns(laps: LapRecord[]): { compound: Compound; start: number; end: number }[] {
  const out: { compound: Compound; start: number; end: number }[] = [];
  let prev: LapRecord | undefined;
  for (const l of laps) {
    const c = normaliseCompound(l.compound);
    const last = out[out.length - 1];
    const freshIn = l.pitIn && l.tyreAge === 0;
    const outLapBreak = l.pitOut && !(last && prev?.pitIn && last.start === l.lap - 1);
    if (last && last.compound === c && l.lap === last.end + 1 && !freshIn && !outLapBreak) last.end = l.lap;
    else out.push({ compound: c, start: l.lap, end: l.lap });
    prev = l;
  }
  return out;
}

export interface PitStop {
  /** In-lap (or the out-lap when no in-lap was recorded). */
  lap: number;
  /** Where to draw the marker on a lap axis: between in-lap and out-lap when both exist. */
  at: number;
}

/** One entry per pit stop, pairing an in-lap with the out-lap that follows it. */
export function pitStops(laps: LapRecord[]): PitStop[] {
  const out: PitStop[] = [];
  for (let i = 0; i < laps.length; i++) {
    const l = laps[i];
    if (l.pitIn) {
      const next = laps[i + 1];
      const paired = !!next && next.pitOut && next.lap === l.lap + 1;
      out.push({ lap: l.lap, at: paired ? l.lap + 0.5 : l.lap });
      if (paired) i++;
    } else if (l.pitOut) {
      out.push({ lap: l.lap, at: l.lap - 0.5 });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

export interface StintSpan {
  index: number;
  compound: Compound;
  /** First lap of the stint (1-based). */
  start: number;
  /** Last lap of the stint (inclusive). Less than `start` for a stint with no laps yet. */
  end: number;
  laps: number;
  isNew: boolean;
  current: boolean;
}

/**
 * Turn TimingAppData stints into lap spans. A stint's length is TotalLaps − StartLaps
 * (tyre age now minus age when fitted); start laps are cumulative. The current stint
 * is stretched to `completedLaps` so it ends at the car's current lap.
 */
export function stintSpans(stints: Stint[], completedLaps?: number | null): StintSpan[] {
  const out: StintSpan[] = [];
  let lap = 0; // laps completed before this stint
  stints.forEach((s, i) => {
    const total = typeof s.TotalLaps === "number" ? s.TotalLaps : 0;
    const startAge = typeof s.StartLaps === "number" ? s.StartLaps : 0;
    let laps = Math.max(0, total - startAge);
    const current = i === stints.length - 1;
    if (current && completedLaps != null && completedLaps > lap + laps) laps = completedLaps - lap;
    out.push({
      index: i,
      compound: normaliseCompound(s.Compound),
      start: lap + 1,
      end: lap + laps,
      laps,
      isNew: s.New !== "false",
      current,
    });
    lap += laps;
  });
  return out;
}

export const COMPOUND_STYLE: Record<Compound, { letter: string; colour: string; name: string }> = {
  SOFT: { letter: "S", colour: "var(--color-tyre-soft)", name: "Soft" },
  MEDIUM: { letter: "M", colour: "var(--color-tyre-medium)", name: "Medium" },
  HARD: { letter: "H", colour: "var(--color-tyre-hard)", name: "Hard" },
  INTERMEDIATE: {
    letter: "I",
    colour: "var(--color-tyre-inter)",
    name: "Intermediate",
  },
  WET: { letter: "W", colour: "var(--color-tyre-wet)", name: "Wet" },
  UNKNOWN: { letter: "?", colour: "var(--color-muted)", name: "Unknown" },
};

// ---------------------------------------------------------------------------
// Safety car windows
// ---------------------------------------------------------------------------

export interface NeutralWindow {
  kind: "SC" | "VSC";
  start: number;
  end: number;
}

/**
 * Safety-car / VSC lap windows from race-control messages (Category "SafetyCar").
 * Deployed opens a window; "in this lap" / "ending" closes it on that lap. A window
 * still open runs to `currentLap`.
 */
export function neutralWindows(messages: RaceControlMessage[], currentLap?: number | null): NeutralWindow[] {
  const out: NeutralWindow[] = [];
  let open: { kind: "SC" | "VSC"; start: number } | null = null;
  for (const m of messages) {
    const text = `${m.Mode ?? ""} ${m.Status ?? ""} ${m.Message ?? ""}`.toUpperCase();
    if (m.Category !== "SafetyCar" && !/SAFETY CAR/.test(text)) continue;
    if (typeof m.Lap !== "number") continue;
    const kind: "SC" | "VSC" = /VIRTUAL/.test(text) ? "VSC" : "SC";
    if (/DEPLOYED/.test(text)) {
      if (open) out.push({ ...open, end: Math.max(open.start, m.Lap) });
      open = { kind, start: m.Lap };
    } else if (/IN THIS LAP|ENDING|WITHDRAWN/.test(text) && open) {
      out.push({ ...open, end: Math.max(open.start, m.Lap) });
      open = null;
    }
  }
  if (open) out.push({ ...open, end: Math.max(open.start, currentLap ?? open.start) });
  return out;
}
