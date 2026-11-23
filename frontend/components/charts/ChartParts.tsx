/** Shared SVG building blocks: axes, gridlines, markers, the figure wrapper. */

import type { ReactNode, Ref } from "react";
import type { Scale } from "@/lib/charts";

/** Text halo in the panel colour so labels stay legible over lines and gridlines. */
export const HALO = {
  stroke: "var(--color-surface)",
  strokeWidth: 3,
  strokeLinejoin: "round" as const,
  paintOrder: "stroke",
};

export interface Plot {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Wraps a chart: the SVG is decorative to assistive tech; the caption carries the meaning. */
export function ChartFigure({
  summary,
  children,
  innerRef,
  className = "",
}: {
  summary: ReactNode;
  children: ReactNode;
  innerRef?: Ref<HTMLDivElement>;
  className?: string;
}) {
  return (
    <figure className={`m-0 min-w-0 ${className}`}>
      <div ref={innerRef} className="w-full min-w-0">
        {children}
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

/**
 * Chart canvas. Decorative (aria-hidden) by default; pass `label` when the chart holds
 * focusable controls, so they aren't hidden from assistive tech (mark the decorative
 * parts aria-hidden yourself).
 */
export function ChartSvg({
  width,
  height,
  children,
  label,
}: {
  width: number;
  height: number;
  children: ReactNode;
  label?: string;
}) {
  return (
    <svg
      {...(label ? { role: "group", "aria-label": label } : { "aria-hidden": true })}
      focusable="false"
      viewBox={`0 0 ${width} ${height}`}
      className="block h-auto w-full overflow-visible font-sans"
    >
      {children}
    </svg>
  );
}

/** Horizontal gridlines with value labels on the left; optional axis title above. */
export function YGrid({
  y,
  ticks,
  plot,
  format,
  title,
}: {
  y: Scale;
  ticks: number[];
  plot: Plot;
  format: (v: number) => string;
  title?: string;
}) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={plot.left} x2={plot.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
          <text x={plot.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-faint text-micro">
            {format(t)}
          </text>
        </g>
      ))}
      {title && (
        <text x={plot.left - 6} y={plot.top - 10} textAnchor="start" className="fill-muted text-micro font-semibold">
          {title}
        </text>
      )}
    </g>
  );
}

/** Lap axis along the bottom: vertical gridlines, tick labels and a "Lap" title. */
export function LapAxis({
  x,
  ticks,
  plot,
  title = "Lap",
  labelGap = 16,
}: {
  x: Scale;
  ticks: number[];
  plot: Plot;
  title?: string;
  /** Distance from the plot bottom to the tick-label baseline. */
  labelGap?: number;
}) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={x(t)}
            x2={x(t)}
            y1={plot.top}
            y2={plot.bottom}
            className="stroke-line"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <text
            x={x(t)}
            y={plot.bottom + labelGap}
            textAnchor={x(t) > plot.right - 10 ? "end" : "middle"}
            className="num fill-faint text-micro"
          >
            {t}
          </text>
        </g>
      ))}
      <line x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} className="stroke-line-strong" strokeWidth={1} />
      <text x={plot.right} y={plot.bottom + labelGap + 14} textAnchor="end" className="fill-muted text-micro font-semibold">
        {title}
      </text>
    </g>
  );
}

/** "P" pit-stop marker: outlined chip with the letter, so it reads without colour. */
export function PitMarker({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-7} y={-7} width={14} height={14} rx={3} className="fill-surface stroke-warn" strokeWidth={1.5} />
      <text y={0} dy="0.35em" textAnchor="middle" className="fill-warn text-[10px] font-bold">
        P
      </text>
    </g>
  );
}

/** Shaded lap window (safety car / VSC) with its label along the top. */
export function NeutralBand({ x0, x1, plot, label }: { x0: number; x1: number; plot: Plot; label: string }) {
  const a = Math.max(plot.left, Math.min(x0, x1));
  const b = Math.min(plot.right, Math.max(x0, x1));
  if (b - a < 1) return null;
  x0 = a;
  const w = Math.max(4, b - a);
  return (
    <g>
      <rect x={x0} y={plot.top} width={w} height={plot.bottom - plot.top} className="fill-raised" />
      <rect x={x0} y={plot.top} width={w} height={2} className="fill-flag-yellow" />
      <text x={x0 + w / 2} y={plot.top + 14} textAnchor="middle" className="fill-flag-yellow text-[10px] font-bold">
        {label}
      </text>
    </g>
  );
}

/** Small legend swatch: a line sample with the series' dash pattern and marker. */
export function LegendItem({
  colour,
  dash,
  marker,
  label,
}: {
  colour: string;
  dash?: string;
  marker: "circle" | "square";
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-small text-muted">
      <svg aria-hidden="true" width="28" height="12" viewBox="0 0 28 12">
        <line x1="1" x2="27" y1="6" y2="6" stroke={colour} strokeWidth="2" strokeDasharray={dash} />
        {marker === "circle" ? (
          <circle cx="14" cy="6" r="3" fill={colour} />
        ) : (
          <rect x="11" y="3" width="6" height="6" fill={colour} />
        )}
      </svg>
      {label}
    </span>
  );
}
