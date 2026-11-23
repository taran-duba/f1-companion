import { describe, expect, it } from "vitest";
import { buildScene, DEFAULT_ART, hottest, mulberry32 } from "@/lib/art/slipstream";

const fingerprint = (s: ReturnType<typeof buildScene>) =>
  s.lines.length + ":" + s.lines.slice(0, 20).map((l) => l.pts[0].toFixed(3) + l.pts.length + l.tone).join(",");

describe("slipstream", () => {
  it("is deterministic: same seed, same scene", () => {
    const a = buildScene(DEFAULT_ART, 800, 500);
    const b = buildScene(DEFAULT_ART, 800, 500);
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(Array.from(a.lines[5].pts)).toEqual(Array.from(b.lines[5].pts));
  });

  it("different seeds give different scenes", () => {
    expect(fingerprint(buildScene({ ...DEFAULT_ART, seed: 1 }, 800, 500))).not.toBe(
      fingerprint(buildScene({ ...DEFAULT_ART, seed: 2 }, 800, 500)),
    );
  });

  it("density sets the line count (a few strays may be dropped)", () => {
    const s = buildScene({ ...DEFAULT_ART, density: 400 }, 800, 500);
    expect(s.lines.length).toBeGreaterThan(360);
    expect(s.lines.length).toBeLessThanOrEqual(400);
  });

  it("keeps every point finite and near the canvas", () => {
    const s = buildScene({ ...DEFAULT_ART, density: 300 }, 640, 400);
    for (const l of s.lines) {
      for (let i = 0; i < l.pts.length; i += 2) {
        expect(Number.isFinite(l.pts[i]) && Number.isFinite(l.pts[i + 1])).toBe(true);
        expect(l.pts[i]).toBeGreaterThan(-640 * 0.35);
        expect(l.pts[i]).toBeLessThan(640 * 1.35);
      }
      expect(l.weight).toBeGreaterThanOrEqual(0);
      expect(l.weight).toBeLessThanOrEqual(1);
    }
  });

  it("tighter circuits attract more lines", () => {
    const mean = (t: number) => {
      const s = buildScene({ ...DEFAULT_ART, tightness: t, density: 500 }, 800, 500);
      return s.lines.reduce((n, l) => n + l.weight, 0) / s.lines.length;
    };
    expect(mean(0.9)).toBeGreaterThan(mean(0.1));
  });

  it("picks distinct comet lines", () => {
    const s = buildScene(DEFAULT_ART, 800, 500);
    const h = hottest(s, 10);
    expect(new Set(h).size).toBe(10);
  });

  it("prng stays in [0,1)", () => {
    const r = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v >= 0 && v < 1).toBe(true);
    }
  });
});
