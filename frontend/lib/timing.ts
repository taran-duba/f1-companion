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
  /** Starting position (races), when the feed has it. */
  grid: number | null;
  /** Places gained since the start (negative: lost). Races only. */
  gained: number | null;
  /** Holds the fastest lap of the session. */
  fastestLap: boolean;
  /** Qualifying: eliminated in an earlier part. */
  knockedOut: boolean;
  /** Qualifying: currently below the cut for the next part. */
  dropZone: boolean;
}

export type SessionKind = "race" | "quali" | "practice";

/** Race (and sprint), qualifying (and sprint qualifying), or practice. */
export function sessionKind(state: TimingState): SessionKind {
  const type = (state.SessionInfo?.Type ?? "").toLowerCase();
  const name = (state.SessionInfo?.Name ?? "").toLowerCase();
  if (type === "qualifying" || /qualifying|shootout/.test(name)) return "quali";
  if (type === "practice" || /practice/.test(name)) return "practice";
  return "race";
}

export interface QualiPart {
  /** 1, 2 or 3. */
  part: number;
  /** "Q2", or "SQ2" in sprint qualifying. */
  label: string;
  /** Cars from this position down are in the drop zone (null in the final part). */
  cutoff: number | null;
  /** Cars taking part in each part, e.g. [22, 16, 10]. */
  entries: number[];
}

/** Which part of qualifying is running and where the cut is. Null outside qualifying. */
export function qualiPart(state: TimingState): QualiPart | null {
  if (sessionKind(state) !== "quali") return null;
  const part = Number(state.TimingData?.SessionPart);
  if (!Number.isInteger(part) || part < 1) return null;
  const entries = asList<number>(state.TimingData?.NoEntries).map(Number);
  const next = entries[part];
  const sprint = /sprint|shootout/i.test(state.SessionInfo?.Name ?? "");
  return { part, label: `${sprint ? "SQ" : "Q"}${part}`, cutoff: Number.isFinite(next) && next > 0 ? next : null, entries };
}

/** The part of qualifying a knocked-out car fell in (1 or 2), from its final position. */
export function knockedOutIn(position: number, q: QualiPart): number {
  const second = q.entries[1];
  return Number.isFinite(second) && position > second ? 1 : 2;
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
  const kind = sessionKind(state);
  const quali = qualiPart(state);
  const rows: TowerRow[] = [];
  for (const [num, line] of Object.entries(lines) as [string, TimingLine][]) {
    if (!line) continue;
    const d = drivers[num];
    const sectors = asList<SectorTiming>(line.Sectors);
    const stint = currentStint(state, num);
    const pos = Number(line.Position ?? line.Line ?? 99);
    const grid = Number(state.TimingAppData?.Lines?.[num]?.GridPos);
    // Away from a race, gaps are to the fastest lap of the session (or of this part).
    const stat = quali ? asList<{ TimeDiffToFastest?: string; TimeDifftoPositionAhead?: string }>(line.Stats)[quali.part - 1] : undefined;
    const interval = kind === "race" ? parseGap(line.IntervalToPositionAhead?.Value) : parseGap(line.TimeDiffToPositionAhead ?? stat?.TimeDifftoPositionAhead);
    const gap = kind === "race" ? parseGap(line.GapToLeader) : parseGap(line.TimeDiffToFastest ?? stat?.TimeDiffToFastest);
    // A knocked-out car keeps the last time it set; everyone else shows this part's best.
    const bests = quali ? asList<{ Value?: string }>(line.BestLapTimes).map((b) => b?.Value ?? "") : [];
    const partBest = quali ? (line.KnockedOut ? bests.filter(Boolean).pop() : bests[quali.part - 1]) : undefined;
    rows.push({
      num,
      code: d?.Tla ?? num,
      name: d?.FullName ?? d?.BroadcastName ?? num,
      team: d?.TeamName ?? "",
      teamColour: teamColour(d),
      position: Number.isFinite(pos) ? pos : 99,
      gap,
      interval,
      lastLap: { value: line.LastLapTime?.Value ?? "", mark: sectorMark(line.LastLapTime) },
      // In qualifying the time that counts is this part's best. Purple is assigned below.
      bestLap: { value: (quali ? partBest || (quali.part === 1 ? line.BestLapTime?.Value : "") : line.BestLapTime?.Value) ?? "", mark: "none" },
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
      grid: Number.isInteger(grid) && grid > 0 ? grid : null,
      gained: kind === "race" && Number.isInteger(grid) && grid > 0 && Number.isFinite(pos) && !line.Retired ? grid - pos : null,
      fastestLap: false,
      knockedOut: !!line.KnockedOut,
      dropZone: false,
    });
  }
  rows.sort((a, b) => a.position - b.position);
  // Away from a race the car on top is the reference everyone's gap is measured to.
  if (kind !== "race" && rows[0]?.position === 1) {
    rows[0].gap = { seconds: 0, lapsDown: 0, leader: true, raw: "" };
    rows[0].interval = { seconds: 0, lapsDown: 0, leader: true, raw: "" };
  }
  if (quali?.cutoff != null) {
    for (const r of rows) r.dropZone = !r.knockedOut && r.position > quali.cutoff && r.position < 99;
  }
  // Fastest best lap overall gets purple.
  let fastest: TowerRow | null = null;
  let fastestMs = Infinity;
  for (const r of rows) {
    const ms = r.knockedOut ? null : parseLapTime(r.bestLap.value);
    if (ms != null && ms < fastestMs) {
      fastestMs = ms;
      fastest = r;
    }
  }
  if (fastest) {
    fastest.bestLap.mark = "purple";
    fastest.fastestLap = true;
  }
  // A zero interval to a car ahead is a feed artefact (e.g. while pitting), not a tie.
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].interval.seconds === 0 && !rows[i].interval.leader) rows[i].interval.seconds = null;
  }
  // Gaps are only refreshed at timing points, so a car in the pit lane keeps the gap it had
  // before it dropped places. A gap smaller than any car ahead's is stale: show it as missing.
  // (Compare with the largest gap so far, not just the car directly ahead, which may itself
  // be pitting with no gap.)
  let maxAhead: number | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const g = r.gap.seconds;
    if (i > 0 && kind === "race" && (r.inPit || r.pitOut) && g != null && maxAhead != null && g < maxAhead) {
      r.gap.seconds = null;
      r.interval.seconds = null;
      continue;
    }
    if (g != null && !r.gap.lapsDown) maxAhead = maxAhead == null ? g : Math.max(maxAhead, g);
  }
  // Battles: within 1.0 s of the car ahead, both racing. Under SC/VSC/red flag
  // or after the chequered flag cars can't race, so nothing is a battle.
  if (kind === "race" && racingAllowed(state)) {
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

/** The season a session belongs to: SessionInfo.StartDate, else the archive path ("2026/…"). */
export function season(state: TimingState): number | null {
  const fromDate = Number(state.SessionInfo?.StartDate?.slice(0, 4));
  if (Number.isInteger(fromDate) && fromDate > 1949) return fromDate;
  const fromPath = Number((state.SessionInfo as { Path?: string } | undefined)?.Path?.match(/^(\d{4})\//)?.[1]);
  return Number.isInteger(fromPath) && fromPath > 1949 ? fromPath : null;
}

/**
 * Overtaking aids by season: DRS until 2025; from 2026 every car runs active aero (low-drag
 * straight mode on marked straights) and a car within a second of the one ahead gets overtake
 * mode (extra electrical energy). An unknown season counts as the current year.
 */
export function aeroRules(state: TimingState, now = new Date()): "drs" | "active" {
  return (season(state) ?? now.getFullYear()) >= 2026 ? "active" : "drs";
}

export function drsLabel(drs: number): { label: string; state: "off" | "eligible" | "open" } {
  if (drs === 10 || drs === 12 || drs === 14) return { label: "DRS open", state: "open" };
  if (drs === 8) return { label: "DRS available", state: "eligible" };
  return { label: "DRS off", state: "off" };
}
