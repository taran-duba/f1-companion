"use client";

import { useCallback, useState } from "react";

/** Callback ref + rendered size of an element (0×0 until measured). */
export function useBoxSize<T extends HTMLElement>(): [(el: T | null) => void, { width: number; height: number }] {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = useCallback((el: T | null) => {
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.width - r.width) < 0.5 && Math.abs(s.height - r.height) < 0.5 ? s : { width: r.width, height: r.height }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}
