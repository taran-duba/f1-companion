import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectEvents, wanted } from "@/lib/events";
import { DEFAULT_PREFS, isFavourite, parsePrefs } from "@/lib/prefs";
import { contrast } from "@/lib/theme/color";
import { checkTheme, derive, parseCustom, PRESETS, themeVars } from "@/lib/theme/themes";
import { qualiPart, sessionKind, towerRows } from "@/lib/timing";
import type { TimingState } from "@/lib/types";

function race(lines: Record<string, object>, extra: Partial<TimingState> = {}): TimingState {
  return {
    SessionInfo: { Type: "Race", Name: "Race" },
    SessionStatus: { Status: "Started" },
    TrackStatus: { Status: "1" },
    DriverList: Object.fromEntries(Object.keys(lines).map((n) => [n, { RacingNumber: n, Tla: `D${n}`, TeamName: `Team ${n}` }])),
    TimingData: { Lines: lines as never },
    ...extra,
  };
}

describe("themes", () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))("%s keeps text and buttons readable", (_, p) => {
    const c = derive(p.input);
    expect(contrast(c.text, c.surface)).toBeGreaterThanOrEqual(7);
    expect(contrast(c.muted, c.raised)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.faint, c.raised)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c["on-accent"], c.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.accent, c.surface)).toBeGreaterThanOrEqual(3);
  });

  it("uses deeper status colours on a light page", () => {
    const light = derive(PRESETS.find((p) => p.id === "paddock")!.input);
    const dark = derive(PRESETS.find((p) => p.id === "broadcast")!.input);
    expect(light["tyre-hard"]).not.toBe(dark["tyre-hard"]);
    expect(contrast(light["sector-purple"], light.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light["tyre-hard"], light.surface)).toBeGreaterThanOrEqual(3);
  });

  it("nudges an unreadable custom theme instead of failing", () => {
    const input = { bg: "#101010", surface: "#121212", text: "#2a2a2a", accent: "#131313", select: "#141414" };
    expect(checkTheme(input).some((c) => !c.ok)).toBe(true);
    const c = derive(input);
    expect(contrast(c.muted, c.raised)).toBeGreaterThan(contrast("#2a2a2a", c.raised));
    expect(Object.keys(themeVars(input))).toContain("--color-on-accent");
  });

  it("matches the CSS defaults (what shows before a saved theme loads) to Broadcast", () => {
    const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
    const vars = themeVars(PRESETS.find((p) => p.id === "broadcast")!.input);
    for (const [k, v] of Object.entries(vars)) {
      if (!k.startsWith("--color-")) continue;
      expect(css, k).toMatch(new RegExp(`${k}:\\s*${v};`, "i"));
    }
  });

  it("parses saved custom themes defensively", () => {
    const good = { id: "custom-a", name: " Mine ", input: { bg: "#000000", surface: "#111111", text: "#ffffff", accent: "#ff0000", select: "#ffffff" } };
    expect(parseCustom(good)?.name).toBe("Mine");
    expect(parseCustom({ ...good, id: "broadcast" })).toBeNull();
    expect(parseCustom({ ...good, input: { ...good.input, bg: "red; }" } })).toBeNull();
    expect(parseCustom(null)).toBeNull();
  });
});

describe("prefs", () => {
  it("falls back on junk and clamps the delay", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("{not json")).toEqual(DEFAULT_PREFS);
    const p = parsePrefs(JSON.stringify({ drivers: ["ver", 3, "ver"], delaySec: 9999, towerGap: "x", notify: { pit: "all", radio: "loud" } }));
    expect(p.drivers).toEqual(["VER"]);
    expect(p.delaySec).toBe(300);
    expect(p.towerGap).toBe("interval");
    expect(p.notify.pit).toBe("all");
    expect(p.notify.radio).toBe(DEFAULT_PREFS.notify.radio);
  });

  it("counts a driver as a favourite through their team", () => {
    expect(isFavourite({ drivers: [], teams: ["Team 1"] }, "D1", "Team 1")).toBe(true);
    expect(isFavourite({ drivers: ["D2"], teams: [] }, "d2")).toBe(true);
    expect(isFavourite({ drivers: [], teams: [] }, "D3", "Team 3")).toBe(false);
  });
});

describe("tower extras", () => {
  it("counts places gained since the start and marks the fastest lap", () => {
    const s = race(
      {
        "1": { Position: "1", BestLapTime: { Value: "1:30.500" } },
        "2": { Position: "2", BestLapTime: { Value: "1:30.100" } },
        "3": { Position: "3", Retired: true },
      },
      { TimingAppData: { Lines: { "1": { GridPos: "4" }, "2": { GridPos: "1" }, "3": { GridPos: "2" } } } },
    );
    const rows = towerRows(s);
    expect(rows.map((r) => r.gained)).toEqual([3, -1, null]);
    expect(rows.map((r) => r.fastestLap)).toEqual([false, true, false]);
  });

  it("reads qualifying: part, cut line, knocked-out cars and gaps to the fastest", () => {
    const s: TimingState = {
      SessionInfo: { Type: "Qualifying", Name: "Qualifying" },
      TrackStatus: { Status: "1" },
      DriverList: { "1": { RacingNumber: "1" }, "2": { RacingNumber: "2" }, "3": { RacingNumber: "3" }, "4": { RacingNumber: "4" } },
      TimingData: {
        SessionPart: 2,
        NoEntries: [4, 3, 2],
        Lines: {
          "1": { Position: "1", BestLapTimes: [{ Value: "1:31.000" }, { Value: "1:30.000" }], TimeDiffToFastest: "", TimeDiffToPositionAhead: "" },
          "2": { Position: "2", BestLapTimes: [{ Value: "1:31.100" }, { Value: "1:30.200" }], TimeDiffToFastest: "+0.200", TimeDiffToPositionAhead: "+0.200" },
          "3": { Position: "3", BestLapTimes: [{ Value: "1:31.200" }, { Value: "1:30.900" }], TimeDiffToFastest: "+0.900", TimeDiffToPositionAhead: "+0.700" },
          "4": { Position: "4", KnockedOut: true, BestLapTimes: [{ Value: "1:29.000" }, { Value: "" }] },
        } as never,
      },
    };
    expect(sessionKind(s)).toBe("quali");
    expect(qualiPart(s)).toMatchObject({ part: 2, label: "Q2", cutoff: 2 });
    const rows = towerRows(s);
    expect(rows.map((r) => r.dropZone)).toEqual([false, false, true, false]);
    expect(rows.map((r) => r.knockedOut)).toEqual([false, false, false, true]);
    expect(rows[1].gap.seconds).toBe(0.2);
    expect(rows[2].interval.seconds).toBe(0.7);
    expect(rows[0].gap.leader).toBe(true);
    expect(rows[0].bestLap).toEqual({ value: "1:30.000", mark: "purple" });
    // A knocked-out car keeps its own time and never takes purple from the cars still running.
    expect(rows[3].bestLap.value).toBe("1:29.000");
    expect(rows[3].bestLap.mark).toBe("none");
    expect(rows.every((r) => r.gained == null && !r.battle)).toBe(true);
  });
});

describe("race events", () => {
  const base = {
    "1": { Position: "1", BestLapTime: { Value: "1:30.000" } },
    "2": { Position: "2", BestLapTime: { Value: "1:30.500" } },
    "3": { Position: "3" },
  };

  it("reports an overtake on track, not a pass through the pits", () => {
    const before = race(base);
    const after = race({ ...base, "2": { ...base["2"], Position: "3" }, "3": { Position: "2" } });
    const ev = detectEvents(before, after);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: "overtake", nums: ["3", "2"], title: "D3 passes D2" });

    const pitting = race({ ...base, "2": { ...base["2"], Position: "3", InPit: true }, "3": { Position: "2" } });
    expect(detectEvents(before, pitting).filter((e) => e.kind === "overtake")).toHaveLength(0);
  });

  it("reports no overtakes under the safety car, but reports the safety car", () => {
    const before = race(base);
    const after = race({ ...base, "2": { Position: "3" }, "3": { Position: "2" } }, { TrackStatus: { Status: "4" } });
    const ev = detectEvents(before, after);
    expect(ev.map((e) => e.kind)).toEqual(["flag"]);
    expect(ev[0].title).toBe("Safety car deployed");
    expect(detectEvents(after, race(base))[0].title).toBe("Track clear");
  });

  it("reports pit stops with the tyre change, a new fastest lap, retirements and radio", () => {
    const before = race(base, { TimingAppData: { Lines: { "2": { Stints: [{ Compound: "SOFT" }] } } } });
    const after = race(
      { ...base, "2": { Position: "2", BestLapTime: { Value: "1:29.800" } }, "3": { Position: "3", Retired: true } },
      {
        TimingAppData: { Lines: { "2": { Stints: [{ Compound: "SOFT" }, { Compound: "HARD" }] } } },
        TeamRadio: { Captures: [{ RacingNumber: "1", Path: "TeamRadio/D1_1.m4a", Text: "Box box" }] },
      },
    );
    const ev = detectEvents(before, after);
    const by = Object.fromEntries(ev.map((e) => [e.kind, e]));
    expect(by.pit).toMatchObject({ title: "D2 pits", detail: "Softs → Hards · P2" });
    expect(by.fastest).toMatchObject({ title: "Fastest lap: D2", detail: "1:29.800" });
    expect(by.retire).toMatchObject({ title: "D3 retires" });
    expect(by.radio).toMatchObject({ nums: ["1"], radio: { path: "TeamRadio/D1_1.m4a", text: "Box box" } });
  });

  it("filters alerts by level, favourites and the followed driver", () => {
    const ev = { id: "x", kind: "pit" as const, nums: ["7"], title: "", tone: "info" as const };
    expect(wanted(ev, "off", new Set(["7"]), null)).toBe(false);
    expect(wanted(ev, "all", new Set(), null)).toBe(true);
    expect(wanted(ev, "favs", new Set(), null)).toBe(false);
    expect(wanted(ev, "favs", new Set(["7"]), null)).toBe(true);
    expect(wanted(ev, "favs", new Set(), "7")).toBe(true);
    expect(wanted({ ...ev, nums: [] }, "favs", new Set(), null)).toBe(true);
  });
});
