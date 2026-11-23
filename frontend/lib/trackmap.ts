/** Pure helpers for the track map: fit the circuit to a box and place cars on it. No React. */

import { teamColour } from "./timing";
import type { TimingState } from "./types";

/** Bounds as [minX, minY, maxX, maxY] in feed units (decimetres). */
export type Bounds = [number, number, number, number];

export interface MapView {
  /** Padded view box in feed units. */
  minX: number;
  minY: number;
  width: number;
  height: number;
  /** width / height, used for the CSS aspect ratio. */
  aspect: number;
}

export type CarState = "running" | "pit" | "stopped" | "retired";

export interface CarMarker {
  num: string;
  code: string;
  name: string;
  colour: string;
  position: number | null;
  state: CarState;
  leader: boolean;
  /** Percent of the map box, origin top-left (feed Y is flipped). */
  left: number;
  top: number;
}

/** Feed units smaller than this are treated as "no extent" (1 m). */
const MIN_EXTENT = 10;

function boundsOf(points: readonly (readonly [number, number])[]): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

function union(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/**
 * Fit bounds into a padded view. Padding is a fraction of the larger side, so the stroke and
 * car dots never clip at the edges. Degenerate (single point / straight line) bounds are
 * widened so the view always has a sane aspect ratio.
 */
export function fitView(bounds: Bounds, padFraction = 0.06): MapView {
  let [minX, minY, maxX, maxY] = bounds;
  let w = maxX - minX;
  let h = maxY - minY;
  const major = Math.max(w, h, MIN_EXTENT);
  // Keep very thin shapes readable: no side smaller than 1/4 of the other.
  if (w < major / 4) {
    const grow = (major / 4 - w) / 2;
    minX -= grow;
    maxX += grow;
    w = maxX - minX;
  }
  if (h < major / 4) {
    const grow = (major / 4 - h) / 2;
    minY -= grow;
    maxY += grow;
    h = maxY - minY;
  }
  const pad = major * padFraction;
  const width = w + pad * 2;
  const height = h + pad * 2;
  return { minX: minX - pad, minY: minY - pad, width, height, aspect: width / height };
}

/** Map a feed point to SVG view coordinates (y flipped: feed Y grows up, SVG Y grows down). */
export function toView(view: MapView, x: number, y: number): [number, number] {
  return [x - view.minX, view.minY + view.height - y];
}

/** SVG path data for the outline in view coordinates. */
export function outlinePath(view: MapView, points: readonly (readonly [number, number])[], closed: boolean): string {
  if (!points.length) return "";
  const parts: string[] = [];
  points.forEach(([x, y], i) => {
    const [vx, vy] = toView(view, x, y);
    parts.push(`${i ? "L" : "M"}${Math.round(vx)} ${Math.round(vy)}`);
  });
  if (closed && points.length > 2) parts.push("Z");
  return parts.join("");
}

function clampPct(v: number): number {
  return Math.min(100, Math.max(0, v));
}

function isGarage(e: { X: number; Y: number; Z?: number }): boolean {
  return e.X === 0 && e.Y === 0 && (e.Z ?? 0) === 0;
}

/** Valid car coordinates from the Position topic (drops garage/zero samples). */
function carPoints(state: TimingState): [string, number, number][] {
  const out: [string, number, number][] = [];
  for (const [num, e] of Object.entries(state.Position?.Entries ?? {})) {
    if (!e || typeof e.X !== "number" || typeof e.Y !== "number") continue;
    if (!Number.isFinite(e.X) || !Number.isFinite(e.Y) || isGarage(e)) continue;
    out.push([num, e.X, e.Y]);
  }
  return out;
}

/**
 * The view for the current state. While the outline is still being traced, cars may be
 * outside it, so their positions extend the bounds; once closed, the circuit alone defines it
 * (so the map doesn't jump when a car wanders into the pit lane).
 */
export function mapView(state: TimingState): MapView | null {
  const tm = state.Derived?.TrackMap;
  const points = tm?.points ?? [];
  let b: Bounds | null = tm?.bounds ?? boundsOf(points);
  if (!tm?.closed) b = union(b, boundsOf(carPoints(state).map(([, x, y]) => [x, y] as [number, number])));
  return b ? fitView(b) : null;
}

function carState(line: { InPit?: boolean; Retired?: boolean; Stopped?: boolean } | undefined, status: string | undefined): CarState {
  if (line?.Retired) return "retired";
  if (line?.Stopped) return "stopped";
  if (line?.InPit) return "pit";
  if (status && status !== "OnTrack") return "stopped";
  return "running";
}

/** Car markers ordered by race position (unknown positions last), for DOM/tab order. */
export function carMarkers(state: TimingState, view: MapView): CarMarker[] {
  const lines = state.TimingData?.Lines ?? {};
  const drivers = state.DriverList ?? {};
  const entries = state.Position?.Entries ?? {};
  const cars: CarMarker[] = carPoints(state).map(([num, x, y]) => {
    const d = drivers[num];
    const line = lines[num];
    const pos = Number(line?.Position);
    const [vx, vy] = toView(view, x, y);
    return {
      num,
      code: d?.Tla ?? num,
      name: d?.FullName ?? d?.BroadcastName ?? d?.Tla ?? `Car ${num}`,
      colour: teamColour(d),
      position: Number.isFinite(pos) && pos > 0 ? pos : null,
      state: carState(line, entries[num]?.Status),
      leader: false,
      left: clampPct((vx / view.width) * 100),
      top: clampPct((vy / view.height) * 100),
    };
  });
  cars.sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || a.num.localeCompare(b.num, undefined, { numeric: true }));
  const first = cars[0];
  if (first && first.position === 1) first.leader = true;
  return cars;
}

const STATE_WORD: Record<CarState, string> = { running: "", pit: "in pit", stopped: "stopped", retired: "retired" };

/** Short state word for labels and screen readers ("" when running). */
export function carStateWord(s: CarState): string {
  return STATE_WORD[s];
}

/** Accessible description of one car, e.g. "NOR, P3, in pit". */
export function carDescription(c: CarMarker): string {
  const parts = [c.code, c.position ? `P${c.position}` : "position unknown"];
  const word = carStateWord(c.state);
  if (word) parts.push(word);
  return parts.join(", ");
}

/** One-sentence summary for the figure caption. */
export function mapSummary(cars: CarMarker[], selected: string | null, closed: boolean): string {
  const onTrack = cars.filter((c) => c.state === "running").length;
  const inPit = cars.filter((c) => c.state === "pit").length;
  const out = cars.filter((c) => c.state === "stopped" || c.state === "retired").length;
  let s = `${closed ? "Circuit map" : "Partial circuit map"} with ${cars.length} car${cars.length === 1 ? "" : "s"}: ${onTrack} running`;
  if (inPit) s += `, ${inPit} in the pits`;
  if (out) s += `, ${out} stopped or retired`;
  s += ".";
  const leader = cars.find((c) => c.leader);
  if (leader) s += ` ${leader.code} leads.`;
  const sel = cars.find((c) => c.num === selected);
  if (sel && !sel.leader) s += ` Selected: ${sel.code}${sel.position ? ` in P${sel.position}` : ""}.`;
  else if (sel) s += ` Selected: ${sel.code}.`;
  return s;
}

export type LabelSide = "right" | "left" | "above" | "below";

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Px of clearance between boxes, so labels stay apart while neighbouring dots glide at different speeds. */
const MARGIN = 2;
const overlaps = (a: Box, b: Box) =>
  a.x0 < b.x1 + MARGIN && b.x0 < a.x1 + MARGIN && a.y0 < b.y1 + MARGIN && b.y0 < a.y1 + MARGIN;

/** Rough width of a 12px semibold label (Fira Sans caps ≈ 7.4px each) plus chip padding. */
export function labelWidth(text: string): number {
  return Math.ceil(text.length * 7.4 + 8);
}

/**
 * Greedy label placement in pixels. Priority order: selected, leader, then race order. Each
 * label tries right, left, above, below of its dot and takes the first spot that stays inside
 * the map and clears every dot and already-placed label. Lower-priority labels with no free
 * spot are dropped (the dot keeps its accessible name, so nothing is lost for screen readers);
 * the selected car and leader always keep a label, on their least-crowded side.
 */
export function placeLabels(
  cars: { num: string; left: number; top: number; label: string; priority: number; radius: number }[],
  width: number,
  height: number,
): Map<string, LabelSide> {
  const out = new Map<string, LabelSide>();
  if (width <= 0 || height <= 0) {
    for (const c of cars) if (c.label) out.set(c.num, "right");
    return out;
  }
  const H = 16;
  const dots: (Box & { num: string })[] = cars.map((c) => {
    const x = (c.left / 100) * width;
    const y = (c.top / 100) * height;
    return { num: c.num, x0: x - c.radius, y0: y - c.radius, x1: x + c.radius, y1: y + c.radius };
  });
  const placed: Box[] = [];
  const order = cars.filter((c) => c.label).sort((a, b) => a.priority - b.priority);
  for (const c of order) {
    const x = (c.left / 100) * width;
    const y = (c.top / 100) * height;
    const w = labelWidth(c.label);
    const gap = c.radius + 3;
    const candidates: [LabelSide, Box][] = [
      ["right", { x0: x + gap, y0: y - H / 2, x1: x + gap + w, y1: y + H / 2 }],
      ["left", { x0: x - gap - w, y0: y - H / 2, x1: x - gap, y1: y + H / 2 }],
      ["above", { x0: x - w / 2, y0: y - gap - H, x1: x + w / 2, y1: y - gap }],
      ["below", { x0: x - w / 2, y0: y + gap, x1: x + w / 2, y1: y + gap + H }],
    ];
    let best: [LabelSide, Box] | null = null;
    let bestHits = Infinity;
    for (const cand of candidates) {
      const b = cand[1];
      const outside = b.x0 < 0 || b.y0 < 0 || b.x1 > width || b.y1 > height;
      const hits = placed.filter((p) => overlaps(p, b)).length + dots.filter((d) => d.num !== c.num && overlaps(d, b)).length;
      if (!outside && hits === 0) {
        best = cand;
        bestHits = 0;
        break;
      }
      const score = hits + (outside ? 100 : 0);
      if (score < bestHits) {
        bestHits = score;
        best = cand;
      }
    }
    if (!best) continue;
    if (bestHits > 0 && c.priority > 1) continue;
    out.set(c.num, best[0]);
    placed.push(best[1]);
  }
  return out;
}

/** Short visible state for a hollow dot's label, so the hollow style is never the only cue. */
const LABEL_STATE: Record<CarState, string> = { running: "", pit: "pit", stopped: "out", retired: "out" };

/**
 * Visible label text for a car: code when codes are on or it's selected, plus "pit"/"out" for
 * hollow dots; "P1" for the leader.
 */
export function carLabel(car: CarMarker, selected: boolean, showCode: boolean): string {
  let code = showCode || selected ? car.code : "";
  if (code && LABEL_STATE[car.state]) code += ` ${LABEL_STATE[car.state]}`;
  if (car.leader) return code ? `P1 ${code}` : "P1";
  return code;
}
