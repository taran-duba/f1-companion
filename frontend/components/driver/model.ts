/** Pure view-model helpers for the driver pages. No React here. */

import { asList } from "@/lib/merge";
import { normaliseCompound, type Compound } from "@/lib/timing";
import type { LapRecord, Stint, TimingState } from "@/lib/types";

export type TimeKey = "s1" | "s2" | "s3" | "ms";
export type Bests = Record<TimeKey, number | null>;
export const TIME_KEYS: TimeKey[] = ["s1", "s2", "s3", "ms"];

function valid(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/** Fastest value per column over a set of laps. */
export function bestsOf(laps: LapRecord[]): Bests {
  const out: Bests = { s1: null, s2: null, s3: null, ms: null };
  for (const lap of laps) {
    if (!lap) continue;
    for (const k of TIME_KEYS) {
      const v = lap[k];
      if (valid(v) && (out[k] == null || v < out[k]!)) out[k] = v;
    }
  }
  return out;
}

/** Fastest value per column across every driver's lap history. */
export function fieldBests(state: TimingState): Bests {
  const all: LapRecord[] = [];
  for (const laps of Object.values(state.Derived?.LapHistory ?? {})) {
    all.push(...asList<LapRecord>(laps).filter(Boolean));
  }
  return bestsOf(all);
}

export type Mark = "purple" | "green" | "none";

/** ◆ purple = fastest in the field, ▲ green = this driver's best, otherwise plain. */
export function markFor(v: number | null, personal: number | null, overall: number | null): Mark {
  if (!valid(v)) return "none";
  if (overall != null && v === overall) return "purple";
  if (personal != null && v === personal) return "green";
  return "none";
}

export interface StintView {
  index: number;
  compound: Compound;
  isNew: boolean;
  /** Laps driven in this stint. */
  laps: number;
  /** Race lap the stint started on (1-based). */
  startLap: number;
  /** Tyre age when fitted (laps already on a used set). */
  ageAtFit: number;
  current: boolean;
}

/**
 * Feed stints carry tyre age (TotalLaps) and the age when fitted (StartLaps);
 * laps driven = TotalLaps - StartLaps, and stints follow each other, so the
 * start lap is the running sum of the earlier stints.
 */
export function stintViews(stints: Stint[]): StintView[] {
  let lap = 1;
  return stints.map((s, i) => {
    const total = typeof s.TotalLaps === "number" ? s.TotalLaps : 0;
    const fitted = typeof s.StartLaps === "number" ? s.StartLaps : 0;
    const laps = Math.max(0, total - fitted);
    const view: StintView = {
      index: i,
      compound: normaliseCompound(s.Compound),
      isNew: s.New === "true",
      laps,
      startLap: lap,
      ageAtFit: fitted,
      current: i === stints.length - 1,
    };
    lap += laps;
    return view;
  });
}

/**
 * Tyre a lap was driven on. The backend stamps a lap with the tyre fitted when
 * the lap is recorded, so a pit-in lap shows the new set at age 0. When the
 * feed's stints cover the lap, they say which set it really was.
 */
export function lapTyre(lap: LapRecord, stints: StintView[]): { compound: Compound; age: number | null; known: boolean } {
  const s = lap.pitIn ? stints.find((v) => lap.lap >= v.startLap && lap.lap < v.startLap + v.laps) : undefined;
  if (s) return { compound: s.compound, age: s.ageAtFit + (lap.lap - s.startLap), known: true };
  return { compound: normaliseCompound(lap.compound), age: lap.tyreAge ?? null, known: !!lap.compound };
}

export interface TracePoint {
  dist: number;
  speed: number;
  throttle: number;
  brake: number;
}

/** Map backend trace rows using its column names, sorted by distance. */
export function tracePoints(columns: string[], rows: number[][] | undefined): TracePoint[] {
  if (!rows?.length) return [];
  const idx = (name: string, fallback: number) => {
    const i = columns.indexOf(name);
    return i >= 0 ? i : fallback;
  };
  const d = idx("dist", 0);
  const sp = idx("speed", 1);
  const th = idx("throttle", 2);
  const br = idx("brake", 3);
  const pts = rows
    .filter((r) => Array.isArray(r) && Number.isFinite(r[d]))
    .map((r) => ({ dist: r[d], speed: num(r[sp]), throttle: num(r[th]), brake: num(r[br]) }));
  // Brake is 0/1 on some feeds and 0–100 on others: show both as a percentage.
  const brakeMax = pts.reduce((m, p) => Math.max(m, p.brake), 0);
  if (brakeMax > 0 && brakeMax <= 1) for (const p of pts) p.brake *= 100;
  return pts.sort((a, b) => a.dist - b.dist);
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Value of `key` at distance `dist` (nearest sample at or before it). */
export function sampleAt(points: TracePoint[], dist: number): TracePoint | null {
  if (!points.length) return null;
  let lo = 0;
  let hi = points.length - 1;
  if (dist <= points[0].dist) return points[0];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].dist <= dist) lo = mid;
    else hi = mid - 1;
  }
  return points[lo];
}

export function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km`;
  return `${Math.round(m)} m`;
}
