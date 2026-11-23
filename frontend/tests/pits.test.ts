import { describe, expect, it } from "vitest";
import { stopsFor } from "@/lib/pits";
import type { LapRecord } from "@/lib/types";

const lap = (n: number, ms: number | null, over: Partial<LapRecord> = {}): LapRecord => ({
  lap: n, ms, time: null, s1: null, s2: null, s3: null, pos: 1, gap: null, lapsDown: 0, interval: null,
  compound: "SOFT", tyreAge: n, pitIn: false, pitOut: false, personalBest: false, overallBest: false, ...over,
});

describe("stopsFor", () => {
  it("returns nothing for a no-stop race", () => {
    expect(stopsFor([lap(1, 90000), lap(2, 90100)])).toEqual([]);
  });

  it("pairs in-lap and out-lap and estimates time lost against median pace", () => {
    const laps = [
      lap(1, 90000), lap(2, 90000), lap(3, 90000),
      lap(4, 97000, { pitIn: true }), lap(5, 105000, { pitOut: true }),
      lap(6, 90000), lap(7, 90000),
    ];
    const stops = stopsFor(laps);
    expect(stops).toHaveLength(1);
    expect(stops[0].lap).toBe(4);
    expect(stops[0].lossS).toBeCloseTo(22, 5); // (97 + 105) - 2 × 90
  });

  it("keeps a stop with no timed out-lap but gives no loss", () => {
    const stops = stopsFor([lap(1, 90000), lap(2, 91000, { pitIn: true }), lap(3, null, { pitOut: true })]);
    expect(stops).toEqual([{ lap: 2, lossS: null }]);
  });

  it("counts an out-lap seen alone (joined mid-session) as a stop", () => {
    expect(stopsFor([lap(5, 99000, { pitOut: true }), lap(6, 90000)])).toEqual([{ lap: 5, lossS: null }]);
  });

  it("drops implausible losses (stops under a safety car)", () => {
    const laps = [lap(1, 90000), lap(2, 140000, { pitIn: true }), lap(3, 150000, { pitOut: true }), lap(4, 90000)];
    expect(stopsFor(laps)).toEqual([{ lap: 2, lossS: null }]);
  });

  it("never reports negative loss", () => {
    const laps = [lap(1, 90000), lap(2, 80000, { pitIn: true }), lap(3, 80000, { pitOut: true }), lap(4, 90000)];
    expect(stopsFor(laps)[0].lossS).toBe(0);
  });
});
