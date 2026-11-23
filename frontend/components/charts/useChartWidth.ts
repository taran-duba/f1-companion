"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Measures the chart container so SVGs can use a pixel viewBox (text stays at its
 * design size instead of shrinking with the chart). `fallback` is used for the
 * first render and during prerender. `ref` is a callback ref, so it works even when
 * the measured element mounts after the first render.
 */
export function useChartWidth(fallback = 640) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(fallback);
  const ref = useCallback((node: HTMLElement | null) => setEl(node), []);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setWidth((prev) => (prev !== w ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { ref, width };
}
