import { describe, expect, it } from "vitest";
import { carDescription, carLabel, carMarkers, fitView, mapSummary, mapView, outlinePath, placeLabels, toView } from "@/lib/trackmap";
import type { TimingState } from "@/lib/types";

function state(partial: Partial<TimingState> = {}): TimingState {
  return {
    DriverList: {
      "1": { RacingNumber: "1", Tla: "AAA", TeamColour: "FF0000" },
      "2": { RacingNumber: "2", Tla: "BBB", TeamColour: "00FF00" },
      "3": { RacingNumber: "3", Tla: "CCC" },
    },
    TimingData: {
      Lines: {
        "1": { Position: "2" },
        "2": { Position: "1", InPit: true },
        "3": { Position: "3", Retired: true },
      },
    },
    Position: {
      Timestamp: null,
      Entries: {
        "1": { X: 0, Y: 1000, Z: 1, Status: "OnTrack" },
        "2": { X: 1000, Y: 0, Z: 1, Status: "OnTrack" },
        "3": { X: 0, Y: 0, Z: 0, Status: "OffTrack" }, // garage sample: dropped
      },
    },
    Derived: {
      TrackMap: { points: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], bounds: [0, 0, 1000, 1000], closed: true },
    },
    ...partial,
  };
}

describe("fitView", () => {
  it("pads around the bounds", () => {
    const v = fitView([0, 0, 1000, 500], 0.1);
    expect(v.minX).toBe(-100);
    expect(v.width).toBe(1200);
    expect(v.height).toBe(700);
    expect(v.aspect).toBeCloseTo(1200 / 700);
  });

  it("widens degenerate bounds", () => {
    const v = fitView([5, 5, 5, 5]);
    expect(v.width).toBeGreaterThan(0);
    expect(v.height).toBeGreaterThan(0);
    const thin = fitView([0, 0, 1000, 0]);
    expect(thin.aspect).toBeLessThan(5);
  });
});

describe("toView / outlinePath", () => {
  it("flips Y so feed-up is screen-up", () => {
    const v = fitView([0, 0, 100, 100], 0);
    expect(toView(v, 0, 100)).toEqual([0, 0]);
    expect(toView(v, 0, 0)).toEqual([0, 100]);
  });

  it("closes the path only when the outline is closed", () => {
    const v = fitView([0, 0, 100, 100], 0);
    const pts: [number, number][] = [[0, 0], [100, 0], [100, 100]];
    expect(outlinePath(v, pts, true)).toBe("M0 100L100 100L100 0Z");
    expect(outlinePath(v, pts, false).endsWith("Z")).toBe(false);
    expect(outlinePath(v, [], true)).toBe("");
  });
});

describe("carMarkers", () => {
  it("orders by position, marks the leader, drops garage samples, flags pit/retired", () => {
    const s = state();
    const view = mapView(s)!;
    const cars = carMarkers(s, view);
    expect(cars.map((c) => c.code)).toEqual(["BBB", "AAA"]);
    expect(cars[0].leader).toBe(true);
    expect(cars[0].state).toBe("pit");
    expect(cars[1].state).toBe("running");
    expect(cars[0].colour).toBe("#00FF00");
    // AAA at (0, 1000) is top-left inside the padding.
    expect(cars[1].left).toBeLessThan(10);
    expect(cars[1].top).toBeLessThan(10);
    expect(carDescription(cars[0])).toBe("BBB, P1, in pit");
  });

  it("extends the view with car positions while the outline is still open", () => {
    const s = state({
      Derived: { TrackMap: { points: [[0, 0], [10, 10]], bounds: [0, 0, 10, 10], closed: false } },
    });
    const v = mapView(s)!;
    expect(v.width).toBeGreaterThan(1000);
  });

  it("returns no view without outline or cars", () => {
    expect(mapView({})).toBeNull();
  });
});

describe("mapSummary", () => {
  it("summarises counts, leader and selection", () => {
    const s = state();
    const cars = carMarkers(s, mapView(s)!);
    expect(mapSummary(cars, "1", true)).toBe("Circuit map with 2 cars: 1 running, 1 in the pits. BBB leads. Selected: AAA in P2.");
  });
});

describe("placeLabels", () => {
  const car = (num: string, left: number, top: number, priority: number, label = "AAA") => ({ num, left, top, label, priority, radius: 7 });

  it("puts labels on the right by default and flips at the right edge", () => {
    const sides = placeLabels([car("1", 50, 50, 2), car("2", 99, 20, 3)], 400, 300);
    expect(sides.get("1")).toBe("right");
    expect(sides.get("2")).toBe("left");
  });

  it("drops a crowded low-priority label but always keeps the selected one", () => {
    // Six cars on one spot: four sides at most, and the others' labels would collide.
    const pack = ["1", "2", "3", "4", "5", "6"].map((n, i) => car(n, 50, 50, i === 0 ? 0 : 2 + i));
    const sides = placeLabels(pack, 400, 300);
    expect(sides.get("1")).toBe("right");
    expect(sides.size).toBeLessThan(6);
  });

  it("skips cars without label text", () => {
    expect(placeLabels([car("1", 50, 50, 2, "")], 400, 300).size).toBe(0);
  });
});

describe("carLabel", () => {
  it("adds the leader mark and a pit/out word for hollow dots", () => {
    const s = state();
    const [leader, second] = carMarkers(s, mapView(s)!);
    expect(carLabel(leader, false, false)).toBe("P1");
    expect(carLabel(leader, false, true)).toBe("P1 BBB pit");
    expect(carLabel(second, false, false)).toBe("");
    expect(carLabel(second, true, false)).toBe("AAA");
    expect(carLabel({ ...second, state: "retired" }, false, true)).toBe("AAA out");
  });
});
