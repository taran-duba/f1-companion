import { describe, expect, it } from "vitest";
import {
  anchorWindow,
  appendSample,
  areaPath,
  fromWindow,
  gearLabel,
  linePath,
  mergeBackfill,
  parseUtc,
  summarise,
  toSample,
  trim,
  visible,
  type TelSample,
} from "@/lib/telemetry";

const s = (t: number, speed = 200, extra: Partial<TelSample> = {}): TelSample => ({
  t,
  speed,
  throttle: 100,
  brake: 0,
  gear: 7,
  rpm: 11000,
  drs: 0,
  ...extra,
});

describe("parseUtc", () => {
  it("handles 7-digit fractions and missing zone", () => {
    expect(parseUtc("2024-05-26T13:04:05.1234567Z")).toBe(Date.UTC(2024, 4, 26, 13, 4, 5, 123));
    expect(parseUtc("2024-05-26T13:04:05")).toBe(Date.UTC(2024, 4, 26, 13, 4, 5));
    expect(parseUtc(null)).toBeNull();
    expect(parseUtc("nope")).toBeNull();
  });
});

describe("buffer", () => {
  it("dedupes identical timestamps and ignores small reorders", () => {
    let b: TelSample[] = [];
    b = appendSample(b, s(1000));
    const same = appendSample(b, s(1000, 300));
    expect(same).toBe(b);
    b = appendSample(b, s(2000));
    expect(appendSample(b, s(1500))).toBe(b);
    expect(b.map((x) => x.t)).toEqual([1000, 2000]);
  });

  it("restarts on a big jump back (seek)", () => {
    const b = appendSample([s(10_000), s(20_000)], s(5_000));
    expect(b.map((x) => x.t)).toEqual([5_000]);
  });

  it("keeps at most the window", () => {
    const b = trim([s(0), s(30_000), s(61_000)], 60_000);
    expect(b.map((x) => x.t)).toEqual([30_000, 61_000]);
  });

  it("anchors a backfill window and merges it with live samples", () => {
    const hist = fromWindow({ t: [-2, -1, 0], speed: [1, 2, 3], throttle: [0, 0, 0], brake: [0, 0, 0], gear: [1, 1, 1], rpm: [0, 0, 0], drs: [0, 0, 0] }, 10_000);
    expect(hist.map((x) => x.t)).toEqual([8_000, 9_000, 10_000]);
    // History replaces the buffer over its span; live samples after it are kept.
    const merged = mergeBackfill(hist, [s(9_500, 9), s(10_000, 9), s(11_000, 9)]);
    expect(merged.map((x) => [x.t, x.speed])).toEqual([[8_000, 1], [9_000, 2], [10_000, 3], [11_000, 9]]);
    // Older buffer samples before a partial resync window are kept.
    expect(mergeBackfill(hist, [s(5_000, 7), s(9_000, 9)]).map((x) => x.t)).toEqual([5_000, 8_000, 9_000, 10_000]);
    expect(mergeBackfill([], [s(1)])).toHaveLength(1);
  });

  it("aligns a fetched window on the newest live sample by value", () => {
    const win = { t: [-1, -0.75, -0.5, -0.25, 0], speed: [100, 110, 120, 130, 140], throttle: [50, 60, 70, 80, 90], brake: [0, 0, 0, 0, 0], gear: [3, 3, 4, 4, 4], rpm: [9000, 9100, 9200, 9300, 9400], drs: [0, 0, 0, 0, 0] };
    // The page's newest sample (t = 50 000) is the server's row at -0.5 s: server is 0.5 s ahead.
    const live = [s(50_000, 120, { throttle: 70, gear: 4, rpm: 9200 })];
    expect(anchorWindow(win, live, 50_000)).toBe(50_500);
    // No match: fall back.
    expect(anchorWindow(win, [s(50_000, 999)], 42)).toBe(42);
    expect(anchorWindow(win, [], 42)).toBe(42);
    expect(anchorWindow(null, live, null)).toBeNull();
  });

  it("clamps sample values", () => {
    expect(toSample({ speed: 300, throttle: 104, brake: -1, gear: 8, rpm: 1, drs: 12 }, 5)).toMatchObject({ throttle: 100, brake: 0 });
    expect(toSample(undefined, 5)).toBeNull();
  });
});

describe("chart paths", () => {
  it("maps time to x and value to y, breaking gaps over 10 s", () => {
    const samples = [s(0, 0), s(1_000, 350), s(20_000, 175)];
    const d = linePath(samples, "speed", 20_000, 100, 100, 350);
    expect(d).toBe("M0.0 100.0L5.0 0.0M100.0 50.0");
  });

  it("closes areas to the baseline", () => {
    const d = areaPath([s(0, 0, { brake: 100 }), s(1_000, 0, { brake: 100 })], "brake", 1_000, 10, 10, 100);
    expect(d).toBe("M0.0 10L0.0 0.0L10.0 0.0L10.0 10Z");
  });

  it("keeps one sample before the visible window", () => {
    expect(visible([s(0), s(5_000), s(20_000), s(40_000)], 30_000).map((x) => x.t)).toEqual([5_000, 20_000, 40_000]);
  });
});

describe("summary", () => {
  it("describes speed range, throttle and braking", () => {
    const text = summarise([s(0, 100, { brake: 100, throttle: 0 }), s(1_000, 300), s(2_000, 250)], 30_000, "NOR");
    expect(text).toContain("between 100 and 300 km/h, now 250 km/h");
    expect(text).toContain("Full throttle 67%");
    expect(text).toContain("Braked 1 time.");
    expect(summarise([], 30_000, "NOR")).toMatch(/No telemetry/);
  });

  it("labels neutral", () => {
    expect(gearLabel(0)).toBe("N");
    expect(gearLabel(5)).toBe("5");
  });
});
