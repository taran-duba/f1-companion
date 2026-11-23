"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * Keeps a rolling chart gliding instead of stepping. The chart is drawn anchored to its
 * newest sample, so each new sample shifts every older point left in one jump. This group
 * starts that frame offset back to the right by the same amount and eases it to zero over
 * roughly the time since the previous sample (clamped), so the line scrolls continuously.
 * Everything is in SVG user units, so it works at any rendered size.
 */
export function SlideG({ newest, windowMs, width, children }: { newest: number | null; windowMs: number; width: number; children: ReactNode }) {
  const g = useRef<SVGGElement>(null);
  const prev = useRef<{ t: number; wall: number } | null>(null);

  useLayoutEffect(() => {
    if (newest == null) return;
    const wall = performance.now();
    const before = prev.current;
    prev.current = { t: newest, wall };
    const el = g.current;
    if (!el || !before || newest <= before.t) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const shift = ((newest - before.t) / windowMs) * width;
    if (shift <= 0 || shift > width / 4) return; // big jumps (seek, new snapshot) are not scrolls
    const duration = Math.max(120, Math.min(450, wall - before.wall));
    el.animate([{ transform: `translateX(${shift}px)` }, { transform: "translateX(0)" }], { duration, easing: "linear" });
  }, [newest, windowMs, width]);

  return <g ref={g}>{children}</g>;
}
