/**
 * Workspace model: a layout is an ordered list of tiles on a 12-column grid. Pure data and
 * pure functions, no React: the UI lives in components/workspace and is driven by these.
 */

import type { TowerRow } from "./timing";

export type WidgetType =
  | "tower"
  | "telemetry"
  | "map"
  | "control"
  | "gaps"
  | "laps"
  | "strategy"
  | "pits"
  | "traces"
  | "sectors"
  | "weather"
  | "battles";

/** Who a tile is about: the followed driver, someone relative to them, or a fixed car. */
export type DriverRef = "follow" | "ahead" | "behind" | "leader" | `#${string}`;

export interface WidgetInfo {
  title: string;
  blurb: string;
  /** Shows a driver picker and follows the selection. */
  driver: boolean;
  w: number;
  h: number;
}

export const WIDGETS: Record<WidgetType, WidgetInfo> = {
  tower: { title: "Timing tower", blurb: "Running order, gaps, last laps and tyres for every car.", driver: false, w: 5, h: 12 },
  telemetry: { title: "Telemetry", blurb: "Live speed, gear, throttle and brake for one driver.", driver: true, w: 7, h: 6 },
  map: { title: "Track map", blurb: "Every car on circuit, with one driver highlighted.", driver: true, w: 4, h: 6 },
  control: { title: "Race control", blurb: "Flags, investigations and penalties, newest first.", driver: false, w: 3, h: 6 },
  gaps: { title: "Gap to car ahead", blurb: "How the gap has moved lap by lap, plus current battles.", driver: true, w: 6, h: 8 },
  laps: { title: "Lap times", blurb: "Every lap for one driver, pit laps and safety cars marked.", driver: true, w: 6, h: 6 },
  strategy: { title: "Tyre strategy", blurb: "Every stint of every car across the race.", driver: false, w: 7, h: 8 },
  pits: { title: "Pit stops", blurb: "Who is in the lane, stops so far, stop laps and time lost.", driver: false, w: 7, h: 8 },
  traces: { title: "Lap traces", blurb: "Last lap against best lap: speed, throttle, brake.", driver: true, w: 6, h: 8 },
  sectors: { title: "Sector times", blurb: "Lap-by-lap sector splits for one driver.", driver: true, w: 5, h: 8 },
  weather: { title: "Weather", blurb: "Air and track temperature, humidity, wind and rain.", driver: false, w: 3, h: 4 },
  battles: { title: "Battles", blurb: "Pairs of cars within a second of each other.", driver: false, w: 4, h: 5 },
};

export const WIDGET_ORDER: WidgetType[] = [
  "tower", "telemetry", "map", "pits", "strategy", "gaps", "laps", "traces", "sectors", "battles", "control", "weather",
];

export const W_STEPS = [3, 4, 5, 6, 7, 8, 9, 12] as const;
export const H_STEPS = [4, 5, 6, 8, 10, 12, 14] as const;

export interface Tile {
  id: string;
  type: WidgetType;
  /** Columns of 12. */
  w: number;
  /** Rows of the workspace grid. */
  h: number;
  driver: DriverRef;
}

export interface Layout {
  id: string;
  name: string;
  tiles: Tile[];
  /** Set for the built-in layouts: the key of the preset "Reset" restores. */
  preset?: string;
}

export interface Workspace {
  layouts: Layout[];
  active: string;
}

let counter = 0;
const uid = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

function tile(type: WidgetType, over: Partial<Pick<Tile, "w" | "h" | "driver">> = {}): Tile {
  const d = WIDGETS[type];
  return { id: "", type, w: d.w, h: d.h, driver: "follow", ...over };
}

/** Tile added from the UI (an event handler, so a runtime id is fine). */
function newTile(type: WidgetType): Tile {
  return { ...tile(type), id: uid() };
}

type PresetKey = "race" | "duel" | "pit" | "analysis";

const PRESET_NAMES: Record<PresetKey, string> = {
  race: "Race",
  duel: "Duel",
  pit: "Pit wall",
  analysis: "Analysis",
};

const PRESET_TILES: Record<PresetKey, () => Tile[]> = {
  // Three tiles at most: a layout is one idea, and the background art needs room to show.
  // Laptop heights are scarce and widths are not, so every tile is a full-height column.
  race: () => [
    tile("tower", { w: 4 }),
    tile("telemetry", { w: 4, h: 12 }),
    tile("map", { w: 4, h: 12 }),
  ],
  duel: () => [
    tile("tower", { w: 4 }),
    tile("telemetry", { w: 4, h: 12 }),
    tile("telemetry", { w: 4, h: 12, driver: "behind" }),
  ],
  pit: () => [
    tile("pits", { w: 5, h: 12 }),
    tile("strategy", { w: 7, h: 12 }),
  ],
  analysis: () => [
    tile("tower", { w: 4 }),
    tile("laps", { w: 4, h: 12 }),
    tile("sectors", { w: 4, h: 12 }),
  ],
};

/** Preset tiles get stable ids (this runs during prerender, where Date.now() is off limits). */
export function presetLayout(key: PresetKey): Layout {
  const tiles = PRESET_TILES[key]().map((t, i) => ({ ...t, id: `${key}-${i}` }));
  return { id: key, name: PRESET_NAMES[key], tiles, preset: key };
}

export function defaultWorkspace(): Workspace {
  return { layouts: (Object.keys(PRESET_NAMES) as PresetKey[]).map(presetLayout), active: "race" };
}

// ---------------------------------------------------------------------------
// Operations (all return new objects)
// ---------------------------------------------------------------------------

const nearest = (steps: readonly number[], v: number) =>
  steps.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), steps[0]);

/** Next value in `steps` above or below `v` (stays put at the ends). */
export function step(steps: readonly number[], v: number, dir: 1 | -1): number {
  const cur = nearest(steps, v);
  const i = steps.indexOf(cur) + dir;
  return steps[Math.max(0, Math.min(steps.length - 1, i))];
}

function mapActive(ws: Workspace, fn: (l: Layout) => Layout): Workspace {
  return { ...ws, layouts: ws.layouts.map((l) => (l.id === ws.active ? fn(l) : l)) };
}

export function activeLayout(ws: Workspace): Layout {
  return ws.layouts.find((l) => l.id === ws.active) ?? ws.layouts[0];
}

export function setActive(ws: Workspace, id: string): Workspace {
  return ws.layouts.some((l) => l.id === id) ? { ...ws, active: id } : ws;
}

export function updateTile(ws: Workspace, id: string, patch: Partial<Pick<Tile, "w" | "h" | "driver">>): Workspace {
  return mapActive(ws, (l) => ({ ...l, tiles: l.tiles.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
}

export function resizeTile(ws: Workspace, id: string, axis: "w" | "h", dir: 1 | -1): Workspace {
  const t = activeLayout(ws).tiles.find((x) => x.id === id);
  if (!t) return ws;
  return updateTile(ws, id, { [axis]: step(axis === "w" ? W_STEPS : H_STEPS, t[axis], dir) });
}

export function moveTile(ws: Workspace, id: string, to: number): Workspace {
  return mapActive(ws, (l) => {
    const from = l.tiles.findIndex((t) => t.id === id);
    if (from < 0) return l;
    const tiles = l.tiles.slice();
    const [t] = tiles.splice(from, 1);
    tiles.splice(Math.max(0, Math.min(tiles.length, to)), 0, t);
    return { ...l, tiles };
  });
}

export function removeTile(ws: Workspace, id: string): Workspace {
  return mapActive(ws, (l) => ({ ...l, tiles: l.tiles.filter((t) => t.id !== id) }));
}

export function addTile(ws: Workspace, type: WidgetType): Workspace {
  return mapActive(ws, (l) => ({ ...l, tiles: [...l.tiles, newTile(type)] }));
}

/** New custom layout, copied from the active one so there's something to start from. */
export function addLayout(ws: Workspace): Workspace {
  const from = activeLayout(ws);
  const n = ws.layouts.filter((l) => !l.preset).length + 1;
  const id = `custom-${uid()}`;
  const copy: Layout = { id, name: `My layout ${n}`, tiles: from.tiles.map((t) => ({ ...t, id: uid() })) };
  return { layouts: [...ws.layouts, copy], active: id };
}

export function renameLayout(ws: Workspace, id: string, name: string): Workspace {
  const clean = name.trim().slice(0, 24);
  return clean ? { ...ws, layouts: ws.layouts.map((l) => (l.id === id ? { ...l, name: clean } : l)) } : ws;
}

/** Custom layouts are deleted; built-in ones are restored to their preset. */
export function removeOrResetLayout(ws: Workspace, id: string): Workspace {
  const l = ws.layouts.find((x) => x.id === id);
  if (!l) return ws;
  if (l.preset) {
    return { ...ws, layouts: ws.layouts.map((x) => (x.id === id ? { ...presetLayout(l.preset as PresetKey), name: x.name } : x)) };
  }
  const layouts = ws.layouts.filter((x) => x.id !== id);
  return { layouts, active: ws.active === id ? layouts[0].id : ws.active };
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

/** The racing number a tile is about, or null (e.g. "car ahead" of the leader). */
export function resolveDriver(ref: DriverRef, rows: TowerRow[], selected: string | null): string | null {
  if (ref.startsWith("#")) return ref.slice(1) || null;
  if (ref === "leader") return rows[0]?.num ?? null;
  const i = rows.findIndex((r) => r.num === selected);
  if (ref === "follow") return selected;
  if (i < 0) return null;
  return (ref === "ahead" ? rows[i - 1] : rows[i + 1])?.num ?? null;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export const STORAGE_KEY = "f1c.workspace.v3";

const isType = (v: unknown): v is WidgetType => typeof v === "string" && v in WIDGETS;
const isRef = (v: unknown): v is DriverRef =>
  v === "follow" || v === "ahead" || v === "behind" || v === "leader" || (typeof v === "string" && /^#\d{1,3}$/.test(v));

/** Parse saved JSON defensively: anything malformed falls back to the defaults. */
export function parseWorkspace(raw: string | null): Workspace {
  const fallback = defaultWorkspace();
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw) as Partial<Workspace>;
    if (!data || !Array.isArray(data.layouts)) return fallback;
    const layouts: Layout[] = [];
    for (const l of data.layouts) {
      if (!l || typeof l.id !== "string" || typeof l.name !== "string" || !Array.isArray(l.tiles)) continue;
      const tiles: Tile[] = [];
      for (const t of l.tiles) {
        if (!t || !isType(t.type)) continue;
        tiles.push({
          id: typeof t.id === "string" ? t.id : uid(),
          type: t.type,
          w: nearest(W_STEPS, Number(t.w) || WIDGETS[t.type].w),
          h: nearest(H_STEPS, Number(t.h) || WIDGETS[t.type].h),
          driver: isRef(t.driver) ? t.driver : "follow",
        });
      }
      layouts.push({ id: l.id, name: l.name.slice(0, 24), tiles, ...(l.preset && l.preset in PRESET_NAMES ? { preset: l.preset } : {}) });
    }
    if (!layouts.length) return fallback;
    // Built-in layouts added in later versions show up even for older saves.
    for (const p of fallback.layouts) if (!layouts.some((l) => l.id === p.id)) layouts.push(p);
    const active = layouts.some((l) => l.id === data.active) ? (data.active as string) : layouts[0].id;
    return { layouts, active };
  } catch {
    return fallback;
  }
}
