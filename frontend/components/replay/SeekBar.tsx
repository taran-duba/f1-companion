"use client";

import { useEffect, useId, useRef, useState } from "react";
import { labelEvery, type ReplayMarkers } from "./format";

const THUMB = 20; // px, matches the thumb size in SEEK_CSS
/** Range input drawn transparent over the SVG markers; only the thumb is visible. */
const SEEK_CSS = `
.replay-seek-range {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  background: transparent;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  touch-action: none;
}
.replay-seek-range:disabled {
  cursor: not-allowed;
}
.replay-seek-range::-webkit-slider-runnable-track {
  height: 100%;
  background: transparent;
  border: 0;
}
.replay-seek-range::-moz-range-track {
  height: 100%;
  background: transparent;
  border: 0;
}
.replay-seek-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  margin-top: 12px; /* (44 - 20) / 2 */
  border-radius: 999px;
  background: var(--color-text);
  border: 3px solid var(--color-bg);
  box-shadow: 0 0 0 1px var(--color-line-control);
}
.replay-seek-range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: var(--color-text);
  border: 3px solid var(--color-bg);
  box-shadow: 0 0 0 1px var(--color-line-control);
}
.replay-seek-range:focus {
  outline: none;
}
.replay-seek-range:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent);
}
.replay-seek-range:focus-visible::-moz-range-thumb {
  box-shadow: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent);
}
.replay-seek-range:disabled::-webkit-slider-thumb {
  background: var(--color-faint);
}
`;

/** Periods drawn on the bar (yellow flags are too frequent to be useful there). */
export const BAR_PERIODS = new Set(["sc", "vsc", "red"]);

interface Props {
  start: number;
  end: number;
  value: number;
  markers: ReplayMarkers;
  disabled?: boolean;
  valueText: string;
  /**
   * Non-null while the value is moving on its own (playback, no user input).
   * While the slider has focus, its value and valuetext are then held and only
   * refreshed when this key changes (e.g. each lap), so a screen reader isn't
   * told the new position several times a second. Null passes `value` through.
   */
  holdKey?: string | number | null;
  /** Every input event while dragging (preview only). */
  onScrub: (v: number) => void;
  /** Pointer released or keyboard step: the seek to send. */
  onCommit: (v: number) => void;
  /** Drag ended without a change event (released where it started). */
  onCancel: () => void;
  /**
   * Arrow / Page keys on the focused slider: relative seek in seconds. Handled
   * here (debounced by the caller) instead of the native 1 s step, which would
   * send one seek request per key repeat.
   */
  onKeySeek: (deltaSeconds: number) => void;
}

const KEY_STEP: Record<string, number> = { ArrowLeft: -10, ArrowDown: -10, ArrowRight: 10, ArrowUp: 10, PageDown: -60, PageUp: 60 };

/**
 * Full-width seek slider. A native range input sits on top of an SVG that
 * draws the rail, played portion, lap ticks and shaded safety car / VSC /
 * red flag periods. Commits on the native `change` event only.
 */
export function SeekBar({
  start,
  end,
  value: liveValue,
  markers,
  disabled,
  valueText: liveText,
  holdKey = null,
  onScrub,
  onCommit,
  onCancel,
  onKeySeek,
}: Props) {
  const id = `seek${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const commit = useRef(onCommit);
  const committed = useRef(false);
  const [width, setWidth] = useState(600);
  const [focused, setFocused] = useState(false);
  const [held, setHeld] = useState<{ key: string | number; value: number; text: string } | null>(null);

  // Hold the position while focused and moving on its own (derived state, set during render).
  const holding = focused && holdKey !== null;
  if (holding && held?.key !== holdKey) setHeld({ key: holdKey, value: liveValue, text: liveText });
  if (!holding && held !== null) setHeld(null);
  const value = holding && held ? held.value : liveValue;
  const valueText = holding && held ? held.text : liveText;

  useEffect(() => {
    commit.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const onChange = () => {
      committed.current = true;
      commit.current(Number(el.value));
    };
    el.addEventListener("change", onChange);
    return () => el.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // `change` may fire just after pointerup; give it a moment before cancelling.
  const endDrag = () => {
    window.setTimeout(() => {
      if (!committed.current) onCancel();
    }, 50);
  };

  const total = Math.max(1, end - start);
  const pct = (t: number) => `${(Math.min(Math.max((t - start) / total, 0), 1) * 100).toFixed(3)}%`;
  const laps = markers.laps.filter((l) => l.t >= start && l.t <= end);
  const step = labelEvery(laps.length, width);
  const periods = markers.periods.filter((p) => BAR_PERIODS.has(p.status));

  return (
    <div className="w-full">
      <style href="replay-seek" precedence="default">
        {SEEK_CSS}
      </style>
      <div className="relative h-11 w-full">
        <div ref={box} className="pointer-events-none absolute inset-y-0" style={{ left: THUMB / 2, right: THUMB / 2 }}>
          <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <defs>
              <pattern id={`${id}-sc`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="8" height="8" fill="var(--color-flag-yellow)" fillOpacity="0.18" />
                <rect width="4" height="8" fill="var(--color-flag-yellow)" fillOpacity="0.7" />
              </pattern>
              <pattern id={`${id}-vsc`} width="6" height="6" patternUnits="userSpaceOnUse">
                <rect width="6" height="6" fill="var(--color-flag-yellow)" fillOpacity="0.14" />
                <circle cx="3" cy="3" r="1.3" fill="var(--color-flag-yellow)" fillOpacity="0.85" />
              </pattern>
            </defs>
            {periods.map((p, i) => (
              <rect
                key={`${p.start}-${i}`}
                x={pct(p.start)}
                y="8"
                width={`${(Math.max(p.end - p.start, total * 0.002) / total) * 100}%`}
                height="28"
                fill={p.status === "red" ? "var(--color-flag-red)" : `url(#${id}-${p.status})`}
                fillOpacity={p.status === "red" ? 0.55 : 1}
              />
            ))}
            <rect x="0" y="19" width="100%" height="6" rx="3" fill="var(--color-line-strong)" />
            <rect x="0" y="19" width={pct(value)} height="6" rx="3" fill="var(--color-muted)" />
            {laps.map((l) => (
              <line
                key={`${l.lap}-${l.t}`}
                x1={pct(l.t)}
                x2={pct(l.t)}
                y1={l.lap % step === 0 ? 12 : 16}
                y2={l.lap % step === 0 ? 32 : 28}
                stroke={l.lap % step === 0 ? "var(--color-faint)" : "var(--color-line-control)"}
                strokeWidth="1"
              />
            ))}
          </svg>
        </div>
        <label htmlFor={`${id}-range`} className="sr-only">
          Replay position
        </label>
        <input
          ref={input}
          id={`${id}-range`}
          type="range"
          className="replay-seek-range"
          min={Math.floor(start)}
          max={Math.ceil(end)}
          step={1}
          value={Math.round(value)}
          disabled={disabled}
          aria-valuetext={valueText}
          onChange={(e) => onScrub(Number(e.target.value))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            const delta = KEY_STEP[e.key];
            if (delta === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            onKeySeek(delta);
          }}
          onPointerDown={() => {
            committed.current = false;
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      </div>
      {laps.length > 0 && (
        <div className="relative h-4" style={{ marginLeft: THUMB / 2, marginRight: THUMB / 2 }} aria-hidden="true">
          {laps
            .filter((l) => l.lap % step === 0 || (step > 1 && l.lap === 1))
            .map((l) => (
              <span
                key={`${l.lap}-${l.t}`}
                className="num absolute top-0 -translate-x-1/2 text-micro text-faint"
                style={{ left: pct(l.t) }}
              >
                {l.lap}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
