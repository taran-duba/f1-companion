import { describe, expect, it } from "vitest";
import { asList, merge } from "@/lib/merge";

describe("merge (mirrors backend/f1live/merge.py)", () => {
  it("merges nested objects and keeps untouched keys", () => {
    const s = { Lines: { "1": { Position: "1" }, "44": { Position: "2" } } };
    merge(s, { Lines: { "44": { GapToLeader: "+1.2" } } });
    expect(s).toEqual({ Lines: { "1": { Position: "1" }, "44": { Position: "2", GapToLeader: "+1.2" } } });
  });

  it("patches and appends arrays from index-keyed objects", () => {
    const s = { Sectors: [{ Value: "30.1" }, { Value: "" }], Messages: [{ m: "a" }] };
    merge(s, { Sectors: { "1": { Value: "29.9" } }, Messages: { "1": { m: "b" }, "2": { m: "c" } } });
    expect(s.Sectors).toEqual([{ Value: "30.1" }, { Value: "29.9" }]);
    expect(s.Messages.map((m) => m.m)).toEqual(["a", "b", "c"]);
  });

  it("pads out-of-order indices", () => {
    const s = { Stints: [] as unknown[] };
    merge(s, { Stints: { "2": { Compound: "HARD" } } });
    expect(s.Stints).toEqual([null, null, { Compound: "HARD" }]);
  });

  it("never turns digit-keyed objects (racing numbers) into arrays", () => {
    const s: Record<string, unknown> = {};
    merge(s, { DriverList: { "1": { Tla: "AAA" }, "44": { Tla: "BBB" } } });
    merge(s, { DriverList: { "44": { Line: 1 } } });
    expect(s.DriverList).toEqual({ "1": { Tla: "AAA" }, "44": { Tla: "BBB", Line: 1 } });
  });

  it("handles _deleted and ignores _kf", () => {
    const s = { Lines: { "1": {}, "2": {} }, L: [1, 2, 3] };
    merge(s, { Lines: { _deleted: ["2"] }, L: { _deleted: [0] }, _kf: true });
    expect(s).toEqual({ Lines: { "1": {} }, L: [2, 3] });
  });

  it("replaces scalars and full arrays and does not alias the update", () => {
    const update = { a: [{ v: 1 }] };
    const s = merge({ a: [{ v: 0 }, { v: 9 }], b: 1 }, update) as { a: { v: number }[] };
    expect(s.a).toEqual([{ v: 1 }]);
    s.a[0].v = 5;
    expect(update.a[0].v).toBe(1);
  });

  it("is idempotent for repeated index patches (resync safety)", () => {
    const s = { Messages: [{ m: "a" }] };
    const p = { Messages: { "1": { m: "b" } } };
    merge(s, p);
    merge(s, p);
    expect(s.Messages).toEqual([{ m: "a" }, { m: "b" }]);
  });

  it("asList normalises arrays and index-keyed objects", () => {
    expect(asList({ "1": "b", "0": "a", "10": "c" })).toEqual(["a", "b", "c"]);
    expect(asList(undefined)).toEqual([]);
  });
});
