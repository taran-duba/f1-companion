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

describe("stale pit gaps", () => {
  const lines = {
    "1": { Position: "1", GapToLeader: "LAP 30", IntervalToPositionAhead: { Value: "LAP 30" } },
    "2": { Position: "2", GapToLeader: "+27.513", IntervalToPositionAhead: { Value: "+27.513" } },
    "3": { Position: "3", GapToLeader: "+17.860", IntervalToPositionAhead: { Value: "+2.100" }, InPit: true },
  };

  it("drops a pitting car's gap when it is smaller than the car ahead's", () => {
    const rows = towerRows(race("1", lines));
    expect(rows[2].gap.seconds).toBeNull();
    expect(rows[2].interval.seconds).toBeNull();
  });

  it("keeps a pitting car's gap when it is consistent", () => {
    const rows = towerRows(race("1", { ...lines, "3": { ...lines["3"], GapToLeader: "+30.000" } }));
    expect(rows[2].gap.seconds).toBe(30);
  });

  it("keeps a smaller gap for a car on track", () => {
    const rows = towerRows(race("1", { ...lines, "3": { ...lines["3"], InPit: false } }));
    expect(rows[2].gap.seconds).toBe(17.86);
  });
});

describe("stale pit gaps behind another pitting car", () => {
  it("compares with the largest gap ahead, not only the car directly ahead", () => {
    const rows = towerRows(race("1", {
      "1": { Position: "1", GapToLeader: "LAP 30", IntervalToPositionAhead: { Value: "LAP 30" } },
      "2": { Position: "2", GapToLeader: "+29.000", IntervalToPositionAhead: { Value: "+29.000" } },
      "3": { Position: "3", InPit: true },
      "4": { Position: "4", GapToLeader: "+19.842", IntervalToPositionAhead: { Value: "+1.981" }, InPit: true },
    }));
    expect(rows[3].gap.seconds).toBeNull();
    expect(rows[3].interval.seconds).toBeNull();
  });
});
