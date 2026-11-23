import { describe, expect, it } from "vitest";
import {
  activeLayout,
  addLayout,
  addTile,
  defaultWorkspace,
  moveTile,
  parseWorkspace,
  removeOrResetLayout,
  removeTile,
  renameLayout,
  resizeTile,
  resolveDriver,
  setActive,
  STORAGE_KEY,
  step,
  updateTile,
  W_STEPS,
} from "@/lib/workspace";
import type { TowerRow } from "@/lib/timing";

const rows = (nums: string[]) => nums.map((num, i) => ({ num, position: i + 1 }) as TowerRow);

describe("workspace operations", () => {
  it("ships the built-in layouts and starts on Race", () => {
    const ws = defaultWorkspace();
    expect(ws.layouts.map((l) => l.name)).toEqual(["Race", "Duel", "Pit wall", "Analysis"]);
    expect(activeLayout(ws).id).toBe("race");
  });

  it("steps through sizes and stops at the ends", () => {
    expect(step(W_STEPS, 4, 1)).toBe(5);
    expect(step(W_STEPS, 12, 1)).toBe(12);
    expect(step(W_STEPS, 3, -1)).toBe(3);
    expect(step(W_STEPS, 10, -1)).toBe(8); // off-grid values snap first
  });

  it("resizes, moves, adds and removes tiles in the active layout only", () => {
    let ws = defaultWorkspace();
    const first = activeLayout(ws).tiles[0];
    ws = resizeTile(ws, first.id, "w", -1);
    expect(activeLayout(ws).tiles[0].w).toBe(4);
    ws = moveTile(ws, first.id, 2);
    expect(activeLayout(ws).tiles[2].id).toBe(first.id);
    ws = addTile(ws, "pits");
    expect(activeLayout(ws).tiles.at(-1)?.type).toBe("pits");
    ws = removeTile(ws, first.id);
    expect(activeLayout(ws).tiles.find((t) => t.id === first.id)).toBeUndefined();
    expect(ws.layouts.find((l) => l.id === "duel")!.tiles.length).toBe(3);
  });

  it("copies the active layout when adding one, and deletes custom layouts", () => {
    let ws = setActive(defaultWorkspace(), "pit");
    ws = addLayout(ws);
    const custom = activeLayout(ws);
    expect(custom.preset).toBeUndefined();
    expect(custom.tiles.map((t) => t.type)).toEqual(["tower", "pits", "strategy"]);
    expect(custom.tiles[0].id).not.toBe(ws.layouts.find((l) => l.id === "pit")!.tiles[0].id);
    ws = renameLayout(ws, custom.id, "  Quali  ");
    expect(activeLayout(ws).name).toBe("Quali");
    ws = removeOrResetLayout(ws, custom.id);
    expect(ws.layouts.some((l) => l.id === custom.id)).toBe(false);
    expect(ws.layouts.some((l) => l.id === ws.active)).toBe(true);
  });

  it("restores a built-in layout instead of deleting it", () => {
    let ws = defaultWorkspace();
    ws = removeTile(ws, activeLayout(ws).tiles[0].id);
    ws = removeOrResetLayout(ws, "race");
    expect(ws.layouts.some((l) => l.id === "race")).toBe(true);
    expect(activeLayout(ws).tiles.length).toBe(3);
  });

  it("ignores an empty rename", () => {
    const ws = defaultWorkspace();
    expect(renameLayout(ws, "race", "   ")).toBe(ws);
  });
});

describe("resolveDriver", () => {
  const r = rows(["1", "44", "16"]);
  it("follows the selection", () => expect(resolveDriver("follow", r, "44")).toBe("44"));
  it("finds the car ahead and behind, and null at the ends", () => {
    expect(resolveDriver("ahead", r, "44")).toBe("1");
    expect(resolveDriver("behind", r, "44")).toBe("16");
    expect(resolveDriver("ahead", r, "1")).toBeNull();
    expect(resolveDriver("behind", r, "16")).toBeNull();
  });
  it("resolves the leader and pinned cars", () => {
    expect(resolveDriver("leader", r, null)).toBe("1");
    expect(resolveDriver("#16", r, "1")).toBe("16");
  });
});

describe("parseWorkspace", () => {
  it("falls back on junk", () => {
    expect(parseWorkspace(null).active).toBe("race");
    expect(parseWorkspace("{nope").layouts).toHaveLength(4);
    expect(parseWorkspace(JSON.stringify({ layouts: "x" })).layouts).toHaveLength(4);
  });

  it("drops unknown widgets, snaps sizes and restores the active layout", () => {
    const raw = JSON.stringify({
      active: "gone",
      layouts: [
        {
          id: "a",
          name: "Mine",
          tiles: [
            { id: "x", type: "tower", w: 99, h: 1, driver: "follow" },
            { id: "y", type: "hologram", w: 4, h: 4 },
            { id: "z", type: "telemetry", w: 6, h: 6, driver: "#44" },
          ],
        },
      ],
    });
    const ws = parseWorkspace(raw);
    const mine = ws.layouts.find((l) => l.id === "a")!;
    expect(mine.tiles.map((t) => t.type)).toEqual(["tower", "telemetry"]);
    expect(mine.tiles[0].w).toBe(12);
    expect(mine.tiles[0].h).toBe(4);
    expect(mine.tiles[1].driver).toBe("#44");
    expect(ws.active).toBe("a");
    // built-ins are topped up so an old save never loses them
    expect(ws.layouts.map((l) => l.id)).toContain("pit");
  });

  it("round-trips", () => {
    const ws = updateTile(defaultWorkspace(), "none", { w: 3 });
    expect(parseWorkspace(JSON.stringify(ws)).layouts.map((l) => l.id)).toEqual(ws.layouts.map((l) => l.id));
    expect(STORAGE_KEY).toMatch(/workspace/);
  });
});
