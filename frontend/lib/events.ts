/**
 * Race moments worth an alert, found by comparing two consecutive states: overtakes, pit
 * stops (with the tyre change), a new fastest lap, retirements, flags, stewards' decisions
 * and team radio. Pure functions, no React: components/Toasts turns them into alerts.
 */

import { asList } from "./merge";
import type { EventKind, NotifyLevel } from "./prefs";
import { normaliseCompound, parseLapTime, racingAllowed, sessionKind, stints, towerRows, trackStatus, type TowerRow } from "./timing";
import type { RaceControlMessage, TeamRadioCapture, TimingState } from "./types";

export type EventTone = "info" | "good" | "warn" | "danger" | "purple";

export interface RaceEvent {
  id: string;
  kind: EventKind;
  /** Drivers involved (racing numbers), the main one first. Empty for track-wide events. */
  nums: string[];
  title: string;
  detail?: string;
  tone: EventTone;
  /** Team colour of the main driver. */
  colour?: string;
  /** Team radio: the clip to play and, in the demo, what is said. */
  radio?: { path: string; text?: string };
}

let seq = 0;
const id = (kind: string) => `${kind}-${++seq}`;

const TYRE: Record<string, string> = { SOFT: "Softs", MEDIUM: "Mediums", HARD: "Hards", INTERMEDIATE: "Inters", WET: "Wets", UNKNOWN: "new tyres" };

const racing = (r: TowerRow) => !r.retired && !r.stopped && !r.inPit && !r.pitOut && r.position < 99;

/** "CAR 6 (MAR) …" → sentence case, as the race control feed shows it. */
function sentence(s: string): string {
  if (!s || s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/(^|[.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase())
    .replace(/\b(drs|vsc|sc|fia)\b/gi, (m) => m.toUpperCase())
    .replace(/\(([a-z]{3})\)/g, (_, c) => `(${c.toUpperCase()})`);
}

const STEWARDS = /PENALTY|INVESTIGAT|NOTED|NO FURTHER ACTION|DELETED|REPRIMAND|BLACK AND WHITE|DISQUALIF/i;

/** Racing numbers a race control message is about. */
function messageCars(m: RaceControlMessage): string[] {
  const nums = new Set<string>();
  if (m.RacingNumber) nums.add(String(m.RacingNumber));
  for (const hit of (m.Message ?? "").matchAll(/\bCARS? (\d+)/gi)) nums.add(hit[1]);
  return [...nums];
}

export function detectEvents(prev: TimingState, next: TimingState): RaceEvent[] {
  const out: RaceEvent[] = [];
  const before = towerRows(prev);
  const after = towerRows(next);
  const was = new Map(before.map((r) => [r.num, r]));
  const kind = sessionKind(next);

  // Flags: safety car, VSC, red flag, back to green, the chequered flag.
  const ta = trackStatus(prev).tone;
  const tb = trackStatus(next).tone;
  if (ta !== tb && ta !== "unknown") {
    const winner = after.find((r) => r.position === 1 && !r.retired);
    const flag: Partial<Record<typeof tb, [string, EventTone, string?]>> = {
      sc: ["Safety car deployed", "warn"],
      vsc: ["Virtual safety car", "warn"],
      red: ["Red flag", "danger", "The session is stopped."],
      chequered: ["Chequered flag", "info", kind === "race" && winner ? `${winner.code} wins.` : undefined],
    };
    const green = (ta === "sc" || ta === "vsc" || ta === "red") && tb === "green";
    const hit = green ? (["Track clear", "good", "Racing resumes."] as [string, EventTone, string]) : flag[tb];
    if (hit) out.push({ id: id("flag"), kind: "flag", nums: tb === "chequered" && winner ? [winner.num] : [], title: hit[0], detail: hit[2], tone: hit[1] });
  }

  for (const r of after) {
    const p = was.get(r.num);
    if (!p) continue;
    if ((r.retired && !p.retired) || (r.stopped && !p.stopped && !r.retired)) {
      out.push({ id: id("retire"), kind: "retire", nums: [r.num], title: `${r.code} ${r.retired ? "retires" : "has stopped"}`, detail: r.name, tone: "danger", colour: r.teamColour });
    }
    // A new stint after the first is a pit stop: say what went on.
    const sa = stints(prev, r.num);
    const sb = stints(next, r.num);
    if (kind === "race" && sa.length >= 1 && sb.length > sa.length) {
      const from = TYRE[normaliseCompound(sa[sa.length - 1]?.Compound)];
      const to = TYRE[normaliseCompound(sb[sb.length - 1]?.Compound)];
      out.push({
        id: id("pit"),
        kind: "pit",
        nums: [r.num],
        title: `${r.code} pits`,
        detail: `${from} → ${to}${r.position < 99 ? ` · P${r.position}` : ""}`,
        tone: "info",
        colour: r.teamColour,
      });
    }
  }

  // Overtakes: a car moves up past cars that were racing (not pitting) both before and after.
  if (kind === "race" && racingAllowed(prev) && racingAllowed(next)) {
    for (const r of after) {
      const p = was.get(r.num);
      if (!p || r.position >= p.position || !racing(r) || !racing(p)) continue;
      const passed = after.filter((o) => {
        const op = was.get(o.num);
        return o.num !== r.num && op && op.position < p.position && o.position > r.position && racing(o) && racing(op);
      });
      if (!passed.length) continue;
      passed.sort((x, y) => x.position - y.position);
      out.push({
        id: id("overtake"),
        kind: "overtake",
        nums: [r.num, ...passed.map((o) => o.num)],
        title: `${r.code} passes ${passed[0].code}${passed.length > 1 ? ` and ${passed.length - 1} more` : ""}`,
        detail: `Up to P${r.position}`,
        tone: "good",
        colour: r.teamColour,
      });
    }
  }

  // A new fastest lap (only once someone already held it, so the first laps stay quiet).
  const fa = before.find((r) => r.fastestLap);
  const fb = after.find((r) => r.fastestLap);
  if (fa && fb) {
    const ma = parseLapTime(fa.bestLap.value);
    const mb = parseLapTime(fb.bestLap.value);
    if (ma != null && mb != null && mb < ma) {
      out.push({
        id: id("fastest"),
        kind: "fastest",
        nums: [fb.num],
        title: kind === "race" ? `Fastest lap: ${fb.code}` : `${fb.code} goes fastest`,
        detail: fb.bestLap.value,
        tone: "purple",
        colour: fb.teamColour,
      });
    }
  }

  // Stewards: penalties, investigations, deleted laps.
  const ma = asList<RaceControlMessage>(prev.RaceControlMessages?.Messages).filter(Boolean);
  const mb = asList<RaceControlMessage>(next.RaceControlMessages?.Messages).filter(Boolean);
  for (const m of mb.slice(ma.length)) {
    if (!m.Message || !STEWARDS.test(m.Message)) continue;
    const nums = messageCars(m);
    const row = after.find((r) => r.num === nums[0]);
    out.push({
      id: id("penalty"),
      kind: "penalty",
      nums,
      title: /PENALTY/i.test(m.Message) && !/NO FURTHER/i.test(m.Message) ? `Penalty${row ? `: ${row.code}` : ""}` : `Stewards${row ? `: ${row.code}` : ""}`,
      detail: sentence(m.Message),
      tone: "warn",
      colour: row?.teamColour,
    });
  }

  // Team radio.
  const ra = asList<TeamRadioCapture>(prev.TeamRadio?.Captures).filter(Boolean);
  const rb = asList<TeamRadioCapture>(next.TeamRadio?.Captures).filter(Boolean);
  for (const c of rb.slice(ra.length)) {
    if (!c.Path || !c.RacingNumber) continue;
    const row = after.find((r) => r.num === c.RacingNumber);
    out.push({
      id: id("radio"),
      kind: "radio",
      nums: [c.RacingNumber],
      title: `${row?.code ?? `#${c.RacingNumber}`} team radio`,
      detail: c.Text,
      tone: "info",
      colour: row?.teamColour,
      radio: { path: c.Path, text: c.Text },
    });
  }
  return out;
}

/**
 * Should this alert show? "favs" means a favourite or the followed driver is involved;
 * track-wide events (flags) have nobody involved and show unless turned off.
 */
export function wanted(ev: RaceEvent, level: NotifyLevel, favourites: Set<string>, followed: string | null): boolean {
  if (level === "off") return false;
  if (level === "all" || ev.nums.length === 0) return true;
  return ev.nums.some((n) => favourites.has(n) || n === followed);
}
