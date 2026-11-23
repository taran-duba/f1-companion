import { describe, expect, it } from "vitest";
import {
  clampPos,
  formatBytes,
  formatClock,
  isReplayStatus,
  labelEvery,
  lapAt,
  readMarkers,
  spokenClock,
} from "@/components/replay/format";

describe("replay format helpers", () => {
  it("formats h:mm:ss", () => {
    expect(formatClock(0)).toBe("0:00:00");
    expect(formatClock(59.9)).toBe("0:00:59");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(-5)).toBe("0:00:00");
    expect(formatClock(Number.NaN)).toBe("0:00:00");
  });

  it("speaks durations", () => {
    expect(spokenClock(3725)).toBe("1 hour 2 minutes 5 seconds");
    expect(spokenClock(1)).toBe("1 second");
  });

  it("finds the lap at a time", () => {
    const laps = [
      { t: 0, lap: 1 },
      { t: 90, lap: 2 },
      { t: 180, lap: 3 },
    ];
    expect(lapAt(laps, 0)).toBe(1);
    expect(lapAt(laps, 89.9)).toBe(1);
    expect(lapAt(laps, 90)).toBe(2);
    expect(lapAt(laps, 1000)).toBe(3);
    expect(lapAt([{ t: 10, lap: 1 }], 5)).toBeNull();
  });

  it("thins lap labels on narrow bars", () => {
    expect(labelEvery(5, 1000)).toBe(1);
    expect(labelEvery(57, 1000)).toBe(5);
    expect(labelEvery(57, 340)).toBe(10);
  });

  it("reads markers defensively", () => {
    expect(readMarkers(undefined)).toEqual({ laps: [], periods: [] });
    const src = {
      kind: "demo",
      state: "playing",
      markers: { laps: [{ t: 0, lap: 1 }, { t: "x", lap: 2 }], periods: [{ start: 5, end: 2, status: "sc", label: "" }] },
    };
    expect(readMarkers(src)).toEqual({ laps: [{ t: 0, lap: 1 }], periods: [] });
  });

  it("recognises replayable sources", () => {
    expect(isReplayStatus({ kind: "demo", state: "playing", position: 1, end: 2 })).toBe(true);
    expect(isReplayStatus({ kind: "fastf1", state: "connecting" })).toBe(false);
    expect(isReplayStatus({ kind: "live", state: "connected", position: 1, end: 2 })).toBe(false);
  });

  it("formats sizes and clamps", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(clampPos(-1, 0, 10)).toBe(0);
    expect(clampPos(11, 0, 10)).toBe(10);
  });
});
