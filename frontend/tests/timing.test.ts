import { describe, expect, it } from "vitest";
import { racingAllowed, towerRows, trackStatus } from "@/lib/timing";
import type { TimingState } from "@/lib/types";

function race(track: string, lines: Record<string, object>, session = "Started"): TimingState {
  return {
    SessionStatus: { Status: session },
    TrackStatus: { Status: track },
    DriverList: Object.fromEntries(Object.keys(lines).map((n) => [n, { RacingNumber: n, Tla: `D${n}` }])),
    TimingData: { Lines: lines as never },
  };
}

const close = {
  "1": { Position: "1", GapToLeader: "LAP 10", IntervalToPositionAhead: { Value: "LAP 10" } },
  "2": { Position: "2", GapToLeader: "+0.500", IntervalToPositionAhead: { Value: "+0.500" } },
  "3": { Position: "3", GapToLeader: "+0.900", IntervalToPositionAhead: { Value: "+0.400" }, PitOut: true },
};

describe("battles", () => {
  it("flags cars within a second under green", () => {
    const rows = towerRows(race("1", close));
    expect(rows.map((r) => r.battle)).toEqual([false, true, false]); // #3 is on an out lap
  });

  it.each([["4"], ["5"], ["6"], ["7"]])("are suppressed under track status %s", (code) => {
    expect(towerRows(race(code, close)).some((r) => r.battle)).toBe(false);
  });

  it("are suppressed after the chequered flag", () => {
    const s = race("1", close, "Finished");
    expect(trackStatus(s).tone).toBe("chequered");
    expect(racingAllowed(s)).toBe(false);
    expect(towerRows(s).some((r) => r.battle)).toBe(false);
  });

  it("treats a zero interval to the car ahead as missing data", () => {
    const rows = towerRows(race("1", { ...close, "2": { Position: "2", IntervalToPositionAhead: { Value: "+0.000" } } }));
    expect(rows[1].interval.seconds).toBeNull();
    expect(rows[1].battle).toBe(false);
  });
});
