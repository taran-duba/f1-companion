/** Pit stop view models for the whole field. No React here. */

import { isPitLap, median } from "./charts";
import { lapHistory, towerRows, type TowerRow } from "./timing";
import type { LapRecord, TimingState } from "./types";

const MAX_PLAUSIBLE_LOSS_S = 45;

export interface Stop {
  /** In-lap number (the out-lap when the feed never marked an in-lap). */
  lap: number;
  /**
   * Seconds lost against the driver's own normal pace: in-lap plus out-lap minus two
   * typical laps. An estimate (the feed has no pit-lane clock). Null when either lap has no
   * time, or when the result is implausibly large (safety car, red flag).
   */
  lossS: number | null;
}

export interface PitRow {
  row: TowerRow;
  stops: Stop[];
}

/** One entry per stop, pairing each in-lap with the out-lap that follows it. */
export function stopsFor(laps: LapRecord[]): Stop[] {
  const clean = laps.filter((l) => !isPitLap(l) && l.ms != null && l.ms > 0).map((l) => l.ms as number);
  const pace = median(clean);
  const out: Stop[] = [];
  const loss = (inLap?: LapRecord, outLap?: LapRecord) => {
    if (pace == null || !inLap?.ms || !outLap?.ms) return null;
    const s = Math.max(0, (inLap.ms + outLap.ms - 2 * pace) / 1000);
    // A real stop costs 15–35 s. Past the cap the laps were slowed by a safety car, a red flag
    // or a problem, so the number would mislead: show nothing.
    return s > MAX_PLAUSIBLE_LOSS_S ? null : s;
  };
  for (let i = 0; i < laps.length; i++) {
    const l = laps[i];
    if (l.pitIn) {
      const next = laps[i + 1];
      const paired = !!next && next.pitOut && next.lap === l.lap + 1;
      out.push({ lap: l.lap, lossS: paired ? loss(l, next) : null });
      if (paired) i++;
    } else if (l.pitOut) {
      out.push({ lap: l.lap, lossS: null });
    }
  }
  return out;
}

/** Every car in running order with its stops. */
export function pitRows(state: TimingState): PitRow[] {
  return towerRows(state).map((row) => ({ row, stops: stopsFor(lapHistory(state, row.num)) }));
}

/** Cars in the pit lane right now, in running order. */
export function inLane(rows: PitRow[]): TowerRow[] {
  return rows.filter((r) => r.row.inPit && !r.row.retired).map((r) => r.row);
}
