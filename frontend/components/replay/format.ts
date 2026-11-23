/** Pure helpers for the replay page (unit tested in tests/replay-format.test.ts). */

import type { SourceStatus } from "@/lib/types";

export interface LapMarker {
  t: number;
  lap: number;
}

export interface PeriodMarker {
  start: number;
  end: number;
  status: "yellow" | "sc" | "vsc" | "red" | string;
  label: string;
}

export interface ReplayMarkers {
  laps: LapMarker[];
  periods: PeriodMarker[];
}

export const REPLAY_KINDS = new Set(["replay", "demo", "fastf1"]);
export const DEFAULT_SPEEDS = [0.5, 1, 2, 5, 10, 30];

/** True when the active source can be paused, seeked and sped up. */
export function isReplayStatus(src: SourceStatus | null | undefined): boolean {
  return !!src && REPLAY_KINDS.has(src.kind) && typeof src.end === "number" && typeof src.position === "number";
}

/** Markers from the status payload, tolerating older backends without them. */
export function readMarkers(src: SourceStatus | null | undefined): ReplayMarkers {
  const m = (src?.markers ?? null) as Partial<ReplayMarkers> | null;
  const laps = Array.isArray(m?.laps) ? m.laps.filter((l) => Number.isFinite(l?.t) && Number.isFinite(l?.lap)) : [];
  const periods = Array.isArray(m?.periods)
    ? m.periods.filter((p) => Number.isFinite(p?.start) && Number.isFinite(p?.end) && p.end >= p.start)
    : [];
  return { laps, periods };
}

/** h:mm:ss for a duration in seconds (negative values clamp to 0). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Spoken form for aria-valuetext, e.g. "1 hour 2 minutes 5 seconds". */
export function spokenClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  parts.push(`${sec} second${sec === 1 ? "" : "s"}`);
  return parts.join(" ");
}

/** Lap running at recording time `t` (null before the first lap marker). */
export function lapAt(laps: LapMarker[], t: number): number | null {
  let lap: number | null = null;
  for (const l of laps) {
    if (l.t <= t + 1e-6) lap = l.lap;
    else break;
  }
  return lap;
}

/** Lap ticks worth labelling so labels don't collide: every 1, 5, 10 or 20 laps. */
export function labelEvery(lapCount: number, widthPx: number): number {
  const fit = Math.max(1, Math.floor(widthPx / 44));
  for (const step of [1, 5, 10, 20, 50]) if (lapCount / step <= fit) return step;
  return 100;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatSpeed(speed: number): string {
  return `${speed}×`;
}

/** Position clamped into [start, end]. */
export function clampPos(v: number, start: number, end: number): number {
  return Math.min(end, Math.max(start, v));
}
