/** Pure helpers that turn raw feed state into view models. No React here. */

import { asList } from "./merge";
import type { DriverInfo, LapRecord, RaceControlMessage, SectorTiming, Stint, TimingLine, TimingState } from "./types";

export type SectorMark = "purple" | "green" | "yellow" | "none";
export type Compound = "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET" | "UNKNOWN";

export interface Gap {
  seconds: number | null;
  lapsDown: number;
  leader: boolean;
  raw: string;
}

export interface TowerRow {
  num: string;
  code: string;
  name: string;
  team: string;
  teamColour: string;
  position: number;
  gap: Gap;
  interval: Gap;
  lastLap: { value: string; mark: SectorMark };
  bestLap: { value: string; mark: SectorMark };
  sectors: { value: string; mark: SectorMark }[];
  compound: Compound;
  tyreAge: number | null;
  tyreNew: boolean;
  pits: number;
  laps: number;
  inPit: boolean;
  pitOut: boolean;
  retired: boolean;
  stopped: boolean;
  battle: boolean;
  catching: boolean;
}

export function parseGap(raw: unknown): Gap {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { seconds: null, lapsDown: 0, leader: false, raw: "" };
  if (/^lap/i.test(s)) return { seconds: 0, lapsDown: 0, leader: true, raw: s };
  const lapped = s.match(/^\+?\s*(\d+)\s*L(?:AP)?S?$/i);
  if (lapped) return { seconds: null, lapsDown: Number(lapped[1]), leader: false, raw: s };
  const n = Number(s.replace(/^\+/, ""));
  return { seconds: Number.isFinite(n) ? n : null, lapsDown: 0, leader: false, raw: s };
}

export function parseLapTime(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return Math.round((Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000);
}

export function formatMs(ms: number | null | undefined, opts: { sector?: boolean } = {}): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const total = ms / 1000;
  if (opts.sector || total < 60) return total.toFixed(3);
  const m = Math.floor(total / 60);
  const s = (total - m * 60).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
}

export function formatGap(g: Gap, { leaderLabel = "Leader" } = {}): string {
  if (g.leader) return leaderLabel;
  if (g.lapsDown) return `+${g.lapsDown} lap${g.lapsDown > 1 ? "s" : ""}`;
  if (g.seconds == null) return "—";
  return `+${g.seconds.toFixed(3)}`;
}

function sectorMark(s: { OverallFastest?: boolean; PersonalFastest?: boolean; Value?: string } | undefined): SectorMark {
  if (!s || !s.Value) return "none";
  if (s.OverallFastest) return "purple";
  if (s.PersonalFastest) return "green";
  return "yellow";
}

export function normaliseCompound(c: unknown): Compound {
  const s = typeof c === "string" ? c.toUpperCase() : "";
  if (s === "SOFT" || s === "MEDIUM" || s === "HARD" || s === "INTERMEDIATE" || s === "WET") return s;
  return "UNKNOWN";
}

export function currentStint(state: TimingState, num: string): Stint | undefined {
  const stints = asList<Stint>(state.TimingAppData?.Lines?.[num]?.Stints).filter(Boolean);
  return stints[stints.length - 1];
}

export function stints(state: TimingState, num: string): Stint[] {
  return asList<Stint>(state.TimingAppData?.Lines?.[num]?.Stints).filter(Boolean);
}

export function driverList(state: TimingState): DriverInfo[] {
  return Object.values(state.DriverList ?? {}).filter((d) => d && d.RacingNumber);
}

export function teamColour(d: DriverInfo | undefined): string {
  const c = d?.TeamColour;
  return c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : "#8590a6";
}

/** Build the timing tower rows, ordered by position. */
export function towerRows(state: TimingState): TowerRow[] {
  const lines = state.TimingData?.Lines ?? {};
  const drivers = state.DriverList ?? {};
  const rows: TowerRow[] = [];
  for (const [num, line] of Object.entries(lines) as [string, TimingLine][]) {
    if (!line) continue;
    const d = drivers[num];
    const sectors = asList<SectorTiming>(line.Sectors);
    const stint = currentStint(state, num);
    const pos = Number(line.Position ?? line.Line ?? 99);
    const interval = parseGap(line.IntervalToPositionAhead?.Value);
    rows.push({
      num,
      code: d?.Tla ?? num,
      name: d?.FullName ?? d?.BroadcastName ?? num,
      team: d?.TeamName ?? "",
      teamColour: teamColour(d),
      position: Number.isFinite(pos) ? pos : 99,
      gap: parseGap(line.GapToLeader),
      interval,
      lastLap: { value: line.LastLapTime?.Value ?? "", mark: sectorMark(line.LastLapTime) },
      bestLap: { value: line.BestLapTime?.Value ?? "", mark: "none" }, // purple assigned below
      sectors: [0, 1, 2].map((i) => ({ value: sectors[i]?.Value ?? "", mark: sectorMark(sectors[i]) })),
      compound: normaliseCompound(stint?.Compound),
      tyreAge: typeof stint?.TotalLaps === "number" ? stint.TotalLaps : null,
      tyreNew: stint?.New === "true",
      pits: line.NumberOfPitStops ?? 0,
      laps: line.NumberOfLaps ?? 0,
      inPit: !!line.InPit,
      pitOut: !!line.PitOut,
      retired: !!line.Retired,
      stopped: !!line.Stopped,
      battle: false,
      catching: !!line.IntervalToPositionAhead?.Catching,
    });
  }
  rows.sort((a, b) => a.position - b.position);
  // Fastest best lap overall gets purple.
  let fastest: TowerRow | null = null;
  let fastestMs = Infinity;
  for (const r of rows) {
    const ms = parseLapTime(r.bestLap.value);
    if (ms != null && ms < fastestMs) {
      fastestMs = ms;
      fastest = r;
    }
  }
  if (fastest) fastest.bestLap.mark = "purple";
  // A zero interval to a car ahead is a feed artefact (e.g. while pitting), not a tie.
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].interval.seconds === 0 && !rows[i].interval.leader) rows[i].interval.seconds = null;
  }
  // Battles: within 1.0 s of the car ahead, both racing. Under SC/VSC/red flag
  // or after the chequered flag cars can't race, so nothing is a battle.
  if (racingAllowed(state)) {
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const ahead = rows[i - 1];
      const s = r.interval.seconds;
      if (s != null && s > 0 && s < 1.0 && isRacing(r) && isRacing(ahead)) r.battle = true;
    }
  }
  return rows;
}

function isRacing(r: TowerRow): boolean {
  return !r.retired && !r.stopped && !r.inPit && !r.pitOut;
}

/** False under safety car, VSC, red flag, or once the race is over. */
export function racingAllowed(state: TimingState): boolean {
  const tone = trackStatus(state).tone;
  return tone === "green" || tone === "yellow" || tone === "unknown";
}

export interface TrackStatusView {
  code: string;
  label: string;
  tone: "green" | "yellow" | "sc" | "vsc" | "red" | "chequered" | "unknown";
}

export function trackStatus(state: TimingState): TrackStatusView {
  const session = state.SessionStatus?.Status;
  if (session === "Finished" || session === "Finalised" || session === "Ends") {
    return { code: "chequered", label: "Chequered flag", tone: "chequered" };
  }
  const code = state.TrackStatus?.Status ?? "";
  switch (code) {
    case "1":
      return { code, label: "Green flag", tone: "green" };
    case "2":
      return { code, label: "Yellow flag", tone: "yellow" };
    case "4":
      return { code, label: "Safety car", tone: "sc" };
    case "5":
      return { code, label: "Red flag", tone: "red" };
    case "6":
      return { code, label: "Virtual safety car", tone: "vsc" };
    case "7":
      return { code, label: "VSC ending", tone: "vsc" };
    default:
      return { code, label: state.TrackStatus?.Message || "Track status unknown", tone: "unknown" };
  }
}

export function raceControl(state: TimingState): RaceControlMessage[] {
  return asList<RaceControlMessage>(state.RaceControlMessages?.Messages).filter(Boolean).slice().reverse();
}

export function lapHistory(state: TimingState, num: string): LapRecord[] {
  return asList<LapRecord>(state.Derived?.LapHistory?.[num]).filter(Boolean);
}

export function findDriverByCode(state: TimingState, code: string): DriverInfo | undefined {
  const c = code.toUpperCase();
  return driverList(state).find((d) => d.Tla?.toUpperCase() === c || d.RacingNumber === code);
}

export function sessionTitle(state: TimingState): { meeting: string; session: string } {
  return {
    meeting: state.SessionInfo?.Meeting?.Name ?? "No session",
    session: state.SessionInfo?.Name ?? "",
  };
}

export function weather(state: TimingState) {
  const w = state.WeatherData ?? {};
  const num = (k: string) => (w[k] != null && w[k] !== "" && Number.isFinite(Number(w[k])) ? Number(w[k]) : null);
  return {
    air: num("AirTemp"),
    track: num("TrackTemp"),
    humidity: num("Humidity"),
    wind: num("WindSpeed"),
    rain: w.Rainfall === "1" || Number(w.Rainfall) > 0,
    known: Object.keys(w).length > 0,
  };
}

export function drsLabel(drs: number): { label: string; state: "off" | "eligible" | "open" } {
  if (drs === 10 || drs === 12 || drs === 14) return { label: "DRS open", state: "open" };
  if (drs === 8) return { label: "DRS available", state: "eligible" };
  return { label: "DRS off", state: "off" };
}
