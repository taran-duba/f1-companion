"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TowerRow } from "@/lib/timing";

/**
 * When the running order changes, rows slide from where they were to where they are (FLIP)
 * instead of teleporting. Skipped on a fresh snapshot (seek, source switch) and under
 * reduced motion.
 */
export function useRowGlide(table: React.RefObject<HTMLTableElement | null>, rows: TowerRow[], generation: number) {
  const tops = useRef(new Map<string, number>());
  const gen = useRef(generation);
  useLayoutEffect(() => {
    const body = table.current?.tBodies[0];
    if (!body) return;
    const fresh = gen.current !== generation;
    gen.current = generation;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    for (const tr of Array.from(body.rows)) {
      const id = tr.dataset.row;
      if (!id) continue;
      const top = tr.offsetTop;
      next.set(id, top);
      const was = tops.current.get(id);
      if (!fresh && !reduce && was != null && was !== top) {
        tr.animate([{ transform: `translateY(${was - top}px)` }, { transform: "translateY(0)" }], {
          duration: 420,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        });
      }
    }
    tops.current = next;
  }, [table, rows, generation]);
}

/**
 * Tracks position changes and keeps the arrow for a few seconds. A new snapshot
 * (`generation`: reconnect or replay seek) replaces the running order wholesale, so it
 * resets the baseline instead of reporting every car as having gained or lost places.
 */
export function usePositionMoves(rows: TowerRow[], generation: number): Record<string, number> {
  const last = useRef<Record<string, number>>({});
  const lastGen = useRef(generation);
  const [moves, setMoves] = useState<Record<string, { d: number; at: number }>>({});
  useEffect(() => {
    if (lastGen.current !== generation) {
      lastGen.current = generation;
      last.current = Object.fromEntries(rows.map((r) => [r.num, r.position]));
      setMoves({});
      return;
    }
    const now = Date.now();
    const next: Record<string, { d: number; at: number }> = {};
    let changed = false;
    for (const r of rows) {
      const before = last.current[r.num];
      // 99 = no position yet (towerRows' fallback): the first real one is not a move.
      if (before != null && before !== 99 && r.position !== 99 && before !== r.position && !r.retired) {
        next[r.num] = { d: before - r.position, at: now };
        changed = true;
      }
      last.current[r.num] = r.position;
    }
    if (changed) {
      setMoves((m) => ({ ...m, ...next }));
    }
  }, [rows, generation]);
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - 5000;
      setMoves((m) => {
        const kept = Object.fromEntries(Object.entries(m).filter(([, v]) => v.at > cutoff));
        return Object.keys(kept).length === Object.keys(m).length ? m : kept;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => Object.fromEntries(Object.entries(moves).map(([k, v]) => [k, v.d])), [moves]);
}
