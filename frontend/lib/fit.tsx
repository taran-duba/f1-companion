"use client";

import { createContext, useContext, useLayoutEffect, useState } from "react";

/** True inside workspace tiles while the page is in fit mode (one screen, no page scroll). */
export const FitContext = createContext(false);
export const useFit = () => useContext(FitContext);

/**
 * Height a widget may fill in a fit-mode tile: the element's own height minus everything
 * inside it marked `data-fit-reserve` (table header, legend). Null when not fitting, so the
 * widget keeps its natural size. Attach the returned ref to a root styled `h-full`.
 */
export function useFitHeight(): [(el: HTMLDivElement | null) => void, number | null] {
  const fit = useFit();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!fit || !el) {
      setAvail(null);
      return;
    }
    const measure = () => {
      let reserve = 0;
      el.querySelectorAll<HTMLElement>("[data-fit-reserve]").forEach((n) => {
        const s = getComputedStyle(n);
        reserve += n.offsetHeight + parseFloat(s.marginTop) + parseFloat(s.marginBottom);
      });
      const next = Math.max(0, Math.floor(el.clientHeight - reserve));
      setAvail((a) => (a === next ? a : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.querySelectorAll("[data-fit-reserve]").forEach((n) => ro.observe(n));
    return () => ro.disconnect();
  }, [fit, el]);
  return [setEl, avail];
}
