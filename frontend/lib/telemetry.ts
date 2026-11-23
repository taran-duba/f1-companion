/** Pure helpers for the rolling telemetry buffer and chart. No React here. */

import type { TelemetryWindow } from "./api";
import type { CarSample } from "./types";

/** One car sample at an absolute feed time (epoch ms, from CarData.Utc). */
export interface TelSample extends CarSample {
  t: number;
}

export const BUFFER_MS = 60_000;
export const SPEED_MAX = 350;
export const RPM_MAX = 13_000;
export const GAP_MS = 10_000;
/** How far back (s) to look for the live sample when aligning a fetched window. */
const MATCH_S = 10;

/** Parse a feed timestamp ("2024-05-26T13:04:05.123Z", maybe with 7 fraction digits or no zone). */
export function parseUtc(utc: string | null | undefined): number | null {
  if (!utc || typeof utc !== "string") return null;
  let s = utc.trim().replace(/(\.\d{3})\d+/, "$1");
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += "Z";
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function toSample(car: Partial<CarSample> | undefined, t: number | null): TelSample | null {
  if (!car || t == null) return null;
  return {
    t,
    speed: num(car.speed),
    throttle: Math.max(0, Math.min(100, num(car.throttle))),
    brake: Math.max(0, Math.min(100, num(car.brake))),
    gear: num(car.gear),
    rpm: num(car.rpm),
    drs: num(car.drs),
  };
}

/** Keep only samples within `windowMs` of the newest one. */
export function trim(buf: TelSample[], windowMs = BUFFER_MS): TelSample[] {
  if (!buf.length) return buf;
  const cutoff = buf[buf.length - 1].t - windowMs;
  let i = 0;
  while (i < buf.length && buf[i].t < cutoff) i++;
  return i === 0 ? buf : buf.slice(i);
}

/**
 * Append a live sample. Identical timestamps are ignored; a sample that jumps
 * back more than 1 s (seek without a fresh snapshot) restarts the buffer.
 */
export function appendSample(buf: TelSample[], s: TelSample, windowMs = BUFFER_MS): TelSample[] {
  const last = buf[buf.length - 1];
  if (last) {
    if (s.t === last.t) return buf;
    if (s.t < last.t - 1000) return [s];
    if (s.t < last.t) return buf;
  }
  return trim([...buf, s], windowMs);
}

/** Turn a /api/telemetry window (t relative to its newest sample) into absolute samples. */
export function fromWindow(win: TelemetryWindow | null | undefined, anchorMs: number): TelSample[] {
  if (!win || !Array.isArray(win.t)) return [];
  const out: TelSample[] = [];
  for (let i = 0; i < win.t.length; i++) {
    const s = toSample(
      { speed: win.speed?.[i], throttle: win.throttle?.[i], brake: win.brake?.[i], gear: win.gear?.[i], rpm: win.rpm?.[i], drs: win.drs?.[i] },
      anchorMs + Math.round(num(win.t[i]) * 1000),
    );
    if (s) out.push(s);
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * Anchor for a /api/telemetry window. Its newest row is the car's newest sample on the
 * server, which may be a push or two ahead of what this page has. The live samples we
 * already hold are exact (CarData.Utc), so find the newest one inside the window by its
 * values and line the window up on it. Falls back to `fallback` (the newest feed time).
 */
export function anchorWindow(win: TelemetryWindow | null | undefined, live: TelSample[], fallback: number | null): number | null {
  const last = live[live.length - 1];
  if (!last || !win || !Array.isArray(win.t)) return fallback;
  for (let i = win.t.length - 1; i >= 0 && num(win.t[i]) >= -MATCH_S; i--) {
    const row = toSample(
      { speed: win.speed?.[i], throttle: win.throttle?.[i], brake: win.brake?.[i], gear: win.gear?.[i], rpm: win.rpm?.[i], drs: win.drs?.[i] },
      0,
    );
    if (
      row &&
      row.speed === last.speed &&
      row.rpm === last.rpm &&
      row.gear === last.gear &&
      row.throttle === last.throttle &&
      row.brake === last.brake
    ) {
      return last.t - Math.round(num(win.t[i]) * 1000);
    }
  }
  return fallback;
}

/**
 * Merge fetched history into the buffer. History is the full-rate server record, so it
 * replaces what the buffer holds over its span; buffer samples before it (older history)
 * and after it (live samples that arrived while the request was in flight) are kept.
 */
export function mergeBackfill(history: TelSample[], buf: TelSample[], windowMs = BUFFER_MS): TelSample[] {
  if (!history.length) return buf;
  const first = history[0].t;
  const last = history[history.length - 1].t;
  const merged: TelSample[] = buf.filter((s) => s.t < first);
  for (const s of history) {
    if (merged.length && merged[merged.length - 1].t >= s.t) continue;
    merged.push(s);
  }
  for (const s of buf) if (s.t > last) merged.push(s);
  return trim(merged, windowMs);
}

/** Samples inside the visible window [newest - windowMs, newest]. */
export function visible(buf: TelSample[], windowMs: number): TelSample[] {
  if (!buf.length) return buf;
  const cutoff = buf[buf.length - 1].t - windowMs;
  // Include one sample before the cutoff so the line reaches the left edge.
  let i = buf.length - 1;
  while (i > 0 && buf[i - 1].t >= cutoff) i--;
  return buf.slice(Math.max(0, i - 1));
}

export type Channel = "speed" | "throttle" | "brake";

/**
 * SVG path data for a channel in a 0..w × 0..h box. x maps [newest-windowMs, newest]
 * to [0, w] (the one sample before the window gets a negative x so the first
 * segment keeps its true slope; the SVG clips it); y maps [0, max] to [h, 0]. Gaps longer than GAP_MS break the line (fast replays send sparse samples).
 */
export function linePath(samples: TelSample[], ch: Channel, windowMs: number, w: number, h: number, max: number): string {
  if (!samples.length) return "";
  const end = samples[samples.length - 1].t;
  const start = end - windowMs;
  let d = "";
  let prev: number | null = null;
  for (const s of samples) {
    const x = ((s.t - start) / windowMs) * w;
    const y = h - (Math.max(0, Math.min(max, s[ch])) / max) * h;
    const cmd = prev == null || s.t - prev > GAP_MS ? "M" : "L";
    d += `${cmd}${x.toFixed(1)} ${y.toFixed(1)}`;
    prev = s.t;
  }
  return d;
}

/** Closed area under a channel (for the throttle/brake bands). */
export function areaPath(samples: TelSample[], ch: Channel, windowMs: number, w: number, h: number, max: number): string {
  if (!samples.length) return "";
  const end = samples[samples.length - 1].t;
  const start = end - windowMs;
  const parts: string[] = [];
  let run: string[] = [];
  let runStartX = 0;
  let lastX = 0;
  let prev: number | null = null;
  const flush = () => {
    if (run.length) parts.push(`M${runStartX.toFixed(1)} ${h}${run.join("")}L${lastX.toFixed(1)} ${h}Z`);
    run = [];
  };
  for (const s of samples) {
    const x = ((s.t - start) / windowMs) * w;
    const y = h - (Math.max(0, Math.min(max, s[ch])) / max) * h;
    if (prev != null && s.t - prev > GAP_MS) flush();
    if (!run.length) runStartX = x;
    run.push(`L${x.toFixed(1)} ${y.toFixed(1)}`);
    lastX = x;
    prev = s.t;
  }
  flush();
  return parts.join("");
}

/** Plain-language summary of the visible window, for screen readers. */
export function summarise(samples: TelSample[], windowMs: number, code: string): string {
  const secs = Math.round(windowMs / 1000);
  if (!samples.length) return `No telemetry for ${code} in the last ${secs} seconds.`;
  const end = samples[samples.length - 1].t;
  const inWin = samples.filter((s) => s.t >= end - windowMs);
  let lo = Infinity;
  let hi = -Infinity;
  let full = 0;
  let brakes = 0;
  let braking = false;
  for (const s of inWin) {
    lo = Math.min(lo, s.speed);
    hi = Math.max(hi, s.speed);
    if (s.throttle >= 98) full++;
    const b = s.brake > 0;
    if (b && !braking) brakes++;
    braking = b;
  }
  const now = inWin[inWin.length - 1];
  const fullPct = Math.round((full / inWin.length) * 100);
  return (
    `${code}, last ${secs} seconds: speed between ${lo} and ${hi} km/h, now ${now.speed} km/h. ` +
    `Full throttle ${fullPct}% of the time. ${brakes === 0 ? "No braking" : `Braked ${brakes} time${brakes === 1 ? "" : "s"}`}.`
  );
}

export function gearLabel(gear: number): string {
  return gear <= 0 ? "N" : String(gear);
}
