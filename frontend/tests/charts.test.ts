import { describe, expect, it } from "vitest";
import {
  compoundRuns,
  extent,
  formatLapTick,
  lapTicks,
  lapTimeDomain,
  linePath,
  median,
  neutralWindows,
  pitStops,
  niceDomain,
  niceStep,
  niceTicks,
  scaleLinear,
  stintSpans,
} from "@/lib/charts";
import type { LapRecord } from "@/lib/types";

function lap(n: number, ms: number | null, extra: Partial<LapRecord> = {}): LapRecord {
  return {
    lap: n,
    ms,
    time: null,
    s1: null,
    s2: null,
    s3: null,
    pos: null,
    gap: null,
    lapsDown: 0,
    interval: null,
    compound: "MEDIUM",
    tyreAge: null,
    pitIn: false,
    pitOut: false,
    personalBest: false,
    overallBest: false,
    ...extra,
  };
}

describe("scaleLinear", () => {
  it("maps domain to range, including inverted ranges", () => {
    const y = scaleLinear([0, 10], [100, 0]);
    expect(y(0)).toBe(100);
    expect(y(10)).toBe(0);
    expect(y(2.5)).toBe(75);
    expect(y.domain).toEqual([0, 10]);
  });
  it("maps a zero-width domain to the middle of the range", () => {
    expect(scaleLinear([5, 5], [0, 100])(5)).toBe(50);
  });
});

describe("ticks", () => {
  it("picks 1/2/5 steps", () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(1, 4)).toBe(0.2);
    expect(niceStep(2.6, 4)).toBe(0.5);
    expect(niceStep(3000, 4)).toBe(1000);
    expect(niceStep(0)).toBe(1);
  });
  it("covers the range with round values", () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(0.3, 2.9, 4)).toEqual([0.5, 1, 1.5, 2, 2.5]);
    expect(niceTicks(4, 4)).toEqual([4]);
    expect(niceTicks(NaN, 1)).toEqual([]);
  });
  it("expands a domain outward to nice bounds", () => {
    expect(niceDomain(0, 2.3, 4)).toEqual([0, 2.5]);
    expect(niceDomain(3, 3)).toEqual([2, 4]);
  });
  it("lap ticks start at lap 1 then every step", () => {
    expect(lapTicks(50)).toEqual([1, 10, 20, 30, 40, 50]);
    expect(lapTicks(57)).toEqual([1, 10, 20, 30, 40, 50]);
    expect(lapTicks(12, 5)).toEqual([1, 5, 10]);
    expect(lapTicks(0)).toEqual([]);
  });
});

describe("extent / median", () => {
  it("ignores null and non-finite values", () => {
    expect(extent([3, null, 1, undefined, NaN, 7])).toEqual([1, 7]);
    expect(extent([null])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("linePath", () => {
  it("breaks the line at null points", () => {
    expect(linePath([[0, 0], [10, 5], null, [20, 1], [30, 2]])).toBe("M0,0L10,5M20,1L30,2");
    expect(linePath([null, null])).toBe("");
  });
  it("rounds to one decimal", () => {
    expect(linePath([[1.234, 5.678]])).toBe("M1.2,5.7");
  });
});

describe("lap times", () => {
  it("leaves pit laps out of the domain and caps outliers", () => {
    const laps = [lap(1, 90000), lap(2, 81000), lap(3, 82000, { pitIn: true }), lap(4, 105000, { pitOut: true }), lap(5, 81500)];
    const [lo, hi] = lapTimeDomain(laps)!;
    expect(lo).toBeLessThan(81000);
    expect(hi).toBeGreaterThan(90000);
    expect(hi).toBeLessThan(105000);
    // A stopped / red-flag lap far beyond the cap doesn't stretch the scale.
    const [, capped] = lapTimeDomain([lap(1, 80000), lap(2, 81000), lap(3, 400000)])!;
    expect(capped).toBeLessThan(80000 * 1.6 + 5000);
    // Safety-car laps (~1.5x racing pace) go off scale instead of squashing the racing laps.
    const sc = [85000, 85200, 84900, 85500, 85100, 85300, 123000, 130000, 129000, 86000].map((ms, i) => lap(i + 1, ms));
    const [, scTop] = lapTimeDomain(sc)!;
    expect(scTop).toBeLessThan(110000);
    expect(scTop).toBeGreaterThan(86000);
    expect(lapTimeDomain([lap(1, null)])).toBeNull();
  });
  it("formats lap-time ticks by step size", () => {
    expect(formatLapTick(81000, 1000)).toBe("1:21");
    expect(formatLapTick(81500, 500)).toBe("1:21.5");
    expect(formatLapTick(65250, 250)).toBe("1:05.25");
    expect(formatLapTick(32000, 1000)).toBe("32");
  });
  it("groups consecutive laps by compound, splitting at pit-out laps", () => {
    const laps = [
      lap(1, 1, { compound: "SOFT" }),
      lap(2, 1, { compound: "SOFT" }),
      lap(3, 1, { compound: "HARD", pitOut: true }),
      lap(4, 1, { compound: "HARD" }),
      lap(5, 1, { compound: "HARD", pitOut: true }),
    ];
    expect(compoundRuns(laps)).toEqual([
      { compound: "SOFT", start: 1, end: 2 },
      { compound: "HARD", start: 3, end: 4 },
      { compound: "HARD", start: 5, end: 5 },
    ]);
  });
});

describe("pit stops", () => {
  it("keeps the in-lap with the new set and its out-lap in one run", () => {
    // The feed writes the in-lap record after the tyre change: new compound, age 0.
    const laps = [
      lap(17, 1, { compound: "SOFT", tyreAge: 16 }),
      lap(18, 1, { compound: "HARD", tyreAge: 0, pitIn: true }),
      lap(19, 1, { compound: "HARD", tyreAge: 0, pitOut: true }),
      lap(20, 1, { compound: "HARD", tyreAge: 1 }),
    ];
    expect(compoundRuns(laps)).toEqual([
      { compound: "SOFT", start: 17, end: 17 },
      { compound: "HARD", start: 18, end: 20 },
    ]);
  });
  it("splits a same-compound stop whichever lap carries the new set", () => {
    const oldInLap = [
      lap(1, 1, { tyreAge: 20 }),
      lap(2, 1, { tyreAge: 21, pitIn: true }),
      lap(3, 1, { tyreAge: 0, pitOut: true }),
    ];
    expect(compoundRuns(oldInLap).map((r) => [r.start, r.end])).toEqual([
      [1, 2],
      [3, 3],
    ]);
    const newInLap = [lap(1, 1, { tyreAge: 20 }), lap(2, 1, { tyreAge: 0, pitIn: true }), lap(3, 1, { tyreAge: 0, pitOut: true })];
    expect(compoundRuns(newInLap).map((r) => [r.start, r.end])).toEqual([
      [1, 1],
      [2, 3],
    ]);
  });
  it("pairs in-laps with out-laps into one stop", () => {
    const laps = [
      lap(1, 1),
      lap(2, 1, { pitIn: true }),
      lap(3, 1, { pitOut: true }),
      lap(4, 1),
      lap(5, 1, { pitIn: true }),
      lap(6, 1),
      lap(7, 1, { pitOut: true }),
    ];
    expect(pitStops(laps)).toEqual([
      { lap: 2, at: 2.5 },
      { lap: 5, at: 5 },
      { lap: 7, at: 6.5 },
    ]);
    expect(pitStops([])).toEqual([]);
  });
});

describe("stintSpans", () => {
  it("lays stints end to end using TotalLaps - StartLaps", () => {
    const spans = stintSpans(
      [
        { Compound: "MEDIUM", TotalLaps: 18, StartLaps: 0, New: "true" },
        { Compound: "HARD", TotalLaps: 15, StartLaps: 3, New: "false" },
        { Compound: "SOFT", TotalLaps: 2, StartLaps: 0 },
      ],
      33,
    );
    expect(spans.map((s) => [s.compound, s.start, s.end, s.laps, s.current, s.isNew])).toEqual([
      ["MEDIUM", 1, 18, 18, false, true],
      ["HARD", 19, 30, 12, false, false],
      ["SOFT", 31, 33, 3, true, true],
    ]);
  });
  it("handles a freshly fitted set and unknown compounds", () => {
    const spans = stintSpans(
      [
        { Compound: "MEDIUM", TotalLaps: 21 },
        { Compound: "weird", TotalLaps: 0 },
      ],
      21,
    );
    expect(spans[1]).toMatchObject({
      compound: "UNKNOWN",
      start: 22,
      end: 21,
      laps: 0,
      current: true,
    });
    expect(stintSpans([], 10)).toEqual([]);
  });
});

describe("neutralWindows", () => {
  it("pairs deployed with in-this-lap / ending messages", () => {
    const msgs = [
      { Lap: 3, Category: "Flag", Message: "YELLOW" },
      {
        Lap: 22,
        Category: "SafetyCar",
        Status: "DEPLOYED",
        Mode: "SAFETY CAR",
        Message: "SAFETY CAR DEPLOYED",
      },
      {
        Lap: 25,
        Category: "SafetyCar",
        Status: "IN THIS LAP",
        Mode: "SAFETY CAR",
        Message: "SAFETY CAR IN THIS LAP",
      },
      {
        Lap: 40,
        Category: "SafetyCar",
        Status: "DEPLOYED",
        Mode: "VIRTUAL SAFETY CAR",
        Message: "VIRTUAL SAFETY CAR DEPLOYED",
      },
    ];
    expect(neutralWindows(msgs, 42)).toEqual([
      { kind: "SC", start: 22, end: 25 },
      { kind: "VSC", start: 40, end: 42 },
    ]);
    expect(neutralWindows([], 10)).toEqual([]);
  });
});
