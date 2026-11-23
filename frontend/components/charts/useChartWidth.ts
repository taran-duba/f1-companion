"use client";

import { useCallback, useLayoutEffect, useState } from "react";

/**
 * Measures the chart container so SVGs can use a pixel viewBox (text stays at its
 * design size instead of shrinking with the chart). `fallback` is used during
 * prerender and until the container mounts. `ref` is a callback ref, so it works even
 * when the measured element mounts after the first render.
 *
 * The first measurement is taken in a layout effect, before the browser paints: the
 * chart never shows a frame at the fallback width, which used to change the chart's
 * height after load (phones: the strategy chart's rows grow from 28px to 46px) and
 * push everything below it down.
 */
export function useChartWidth(fallback = 640) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(fallback);
  const ref = useCallback((node: HTMLElement | null) => setEl(node), []);
  useLayoutEffect(() => {
    if (!el) return;
    const apply = (w: number) => {
      const px = Math.floor(w);
      if (px > 0) setWidth((prev) => (prev !== px ? px : prev));
    };
    apply(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => apply(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { ref, width };
}
