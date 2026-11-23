"use client";

import { memo, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatMs } from "@/lib/timing";
import { formatDistance, sampleAt, type TracePoint } from "./model";

export interface TraceSeries {
  id: "last" | "best";
  label: string;
  lap: number;
  ms: number | null;
  points: TracePoint[];
}

/** Colour AND dash pattern distinguish the two laps (never colour alone). */
const STYLE: Record<TraceSeries["id"], { stroke: string; dash?: string; glyph?: string }> = {
  last: { stroke: "var(--color-text)" },
  best: { stroke: "var(--color-sector-green)", dash: "6 4", glyph: "▲" },
};

const VB_W = 1000;
const VB_H = 100;
const MAX_POINTS = 1200;

type Field = "speed" | "throttle" | "brake";

/**
 * Last lap vs best lap: speed against distance, with throttle and brake below
 * on the same x axis. Drag (or use arrow keys) to read values at a distance.
 */
export const TraceChart = memo(function TraceChart({ series, note }: { series: TraceSeries[]; note?: string }) {
  const [cursor, setCursor] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  // Scales, SVG paths and the text summary depend only on the series, not on
  // the cursor: build them once per fetched trace, not on every drag event.
  const { maxDist, speedMax, paths, summary } = useMemo(() => {
    const maxDist = Math.max(1, ...series.map((s) => s.points[s.points.length - 1]?.dist ?? 0));
    const tops = series.map((s) => s.points.reduce((m, p) => Math.max(m, p.speed), 0));
    const speedMax = Math.max(100, Math.ceil((Math.max(0, ...tops) + 10) / 50) * 50);
    const thinned = series.map((s) => thin(s.points));
    const max: Record<Field, number> = { speed: speedMax, throttle: 100, brake: 100 };
    const paths = {} as Record<Field, { id: TraceSeries["id"]; d: string }[]>;
    for (const field of ["speed", "throttle", "brake"] as const) {
      // Draw best first so the last lap (solid) sits on top.
      paths[field] = series
        .map((s, i) => ({ id: s.id, d: pathFor(thinned[i], field, max[field], maxDist) }))
        .sort((a, b) => (a.id === "best" ? -1 : 0) - (b.id === "best" ? -1 : 0));
    }
    const summary = series
      .map((s, i) => `${s.label}, lap ${s.lap}, ${formatMs(s.ms)}, top speed ${Math.round(tops[i])} km/h`)
      .join(". ");
    return { maxDist, speedMax, paths, summary };
  }, [series]);

  function fromPointer(e: PointerEvent<HTMLDivElement>) {
    const el = plotRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    setCursor(f < 0 || f > 1 ? null : f * maxDist);
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = maxDist * (e.shiftKey ? 0.1 : 0.02);
    const at = cursor ?? 0;
    let next: number | null | undefined;
    if (e.key === "ArrowRight") next = Math.min(maxDist, at + step);
    if (e.key === "ArrowLeft") next = Math.max(0, at - step);
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = maxDist;
    if (e.key === "Escape") next = null;
    if (next !== undefined) {
      e.preventDefault();
      setCursor(next);
    }
  }

  const ticks = distanceTicks(maxDist);

  return (
    <figure className="min-w-0">
      <Legend series={series} />
      {note && <p className="mt-1 text-small text-faint">{note}</p>}
      <Readout series={series} cursor={cursor} />
      <div
        role="group"
        tabIndex={0}
        aria-label="Speed, throttle and brake against distance. Use the left and right arrow keys to read values along the lap."
        onKeyDown={onKey}
        onBlur={() => setCursor(null)}
        className="mt-2 rounded-chip"
      >
        <div
          className="touch-pan-y select-none"
          onPointerMove={fromPointer}
          onPointerDown={fromPointer}
          onPointerLeave={(e) => e.pointerType === "mouse" && setCursor(null)}
        >
          <Row label="Speed" unit="km/h" max={speedMax} ticks={speedTicks(speedMax)} heightClass="h-36 md:h-44" paths={paths.speed} maxDist={maxDist} cursor={cursor} plotRef={plotRef} />
          <Row label="Throttle" unit="%" max={100} ticks={[100]} heightClass="h-12" paths={paths.throttle} maxDist={maxDist} cursor={cursor} />
          <Row label="Brake" unit="%" max={100} ticks={[100]} heightClass="h-10" paths={paths.brake} maxDist={maxDist} cursor={cursor} />
        </div>
        <div className="flex">
          <div className="w-12 shrink-0" />
          <div className="relative h-5 flex-1 text-micro font-normal text-faint" aria-hidden="true">
            {ticks.map((d, i) => (
              <span
                key={d}
                className="num absolute top-1 whitespace-nowrap"
                style={{
                  left: `${(d / maxDist) * 100}%`,
                  transform: i === 0 ? "none" : d >= maxDist * 0.97 ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                {formatDistance(d)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
});

function Row({
  label,
  unit,
  max,
  ticks,
  heightClass,
  paths,
  maxDist,
  cursor,
  plotRef,
}: {
  label: string;
  unit: string;
  max: number;
  ticks: number[];
  heightClass: string;
  paths: { id: TraceSeries["id"]; d: string }[];
  maxDist: number;
  cursor: number | null;
  plotRef?: React.Ref<HTMLDivElement>;
}) {
  const scaled = unit !== "%";
  return (
    <div className="border-t border-line pt-1 first:border-t-0 first:pt-0">
      {scaled && (
        <div className="pl-12 text-micro text-muted" aria-hidden="true">
          {label} <span className="font-normal text-faint">({unit})</span>
        </div>
      )}
      <div className="flex">
        <div className="relative w-12 shrink-0 pr-2 text-right" aria-hidden="true">
          {scaled ? (
            ticks.map((t) => (
              <span
                key={t}
                className="num absolute right-2 -translate-y-1/2 text-micro font-normal text-faint"
                style={{ top: `${100 - (t / max) * 100}%` }}
              >
                {t}
              </span>
            ))
          ) : (
            <span className="flex h-full items-center justify-end text-micro text-muted">{label}</span>
          )}
        </div>
        <div ref={plotRef} className={`relative flex-1 ${heightClass}`}>
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {ticks.map((t) => {
              const y = VB_H - (t / max) * VB_H;
              return <line key={t} x1={0} x2={VB_W} y1={y} y2={y} stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
            })}
            {paths.map((s) => (
              <path
                key={s.id}
                d={s.d}
                fill="none"
                stroke={STYLE[s.id].stroke}
                strokeDasharray={STYLE[s.id].dash}
                strokeWidth={1.5}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {cursor != null && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-muted" style={{ left: `${(cursor / maxDist) * 100}%` }} />
          )}
        </div>
      </div>
    </div>
  );
}

function Legend({ series }: { series: TraceSeries[] }) {
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-1 text-small">
      {series.map((s) => (
        <li key={s.id} className="flex items-center gap-2">
          <Swatch id={s.id} />
          <span className="text-muted">
            {STYLE[s.id].glyph && (
              <span aria-hidden="true" className="mr-1 text-micro text-sector-green">
                {STYLE[s.id].glyph}
              </span>
            )}
            {s.label}
          </span>
          <span className="num text-text">Lap {s.lap}</span>
          <span className="num font-semibold text-text">{formatMs(s.ms)}</span>
        </li>
      ))}
    </ul>
  );
}

function Swatch({ id }: { id: TraceSeries["id"] }) {
  return (
    <svg width="28" height="8" aria-hidden="true" className="shrink-0">
      <line x1="0" x2="28" y1="4" y2="4" stroke={STYLE[id].stroke} strokeWidth="2" strokeDasharray={STYLE[id].dash} />
    </svg>
  );
}

/** Values under the cursor; a hint when there is no cursor (fixed height, no jump). */
function Readout({ series, cursor }: { series: TraceSeries[]; cursor: number | null }) {
  if (cursor == null) {
    return <p className="mt-2 flex min-h-[3.25rem] items-center text-small text-faint">Drag across the traces to compare speed, throttle and brake at any point of the lap.</p>;
  }
  return (
    <table className="mt-2 min-h-[3.25rem] text-small">
      <caption className="sr-only">Values at {formatDistance(cursor)}</caption>
      <thead>
        <tr className="text-left text-micro text-muted">
          <th scope="col" className="num pr-4 font-semibold">
            At {formatDistance(cursor)}
          </th>
          <th scope="col" className="pr-4 text-right font-semibold">
            Speed
          </th>
          <th scope="col" className="pr-4 text-right font-semibold">
            Throttle
          </th>
          <th scope="col" className="text-right font-semibold">
            Brake
          </th>
        </tr>
      </thead>
      <tbody>
        {series.map((s) => {
          const p = sampleAt(s.points, cursor);
          return (
            <tr key={s.id}>
              <th scope="row" className="flex items-center gap-2 pr-4 text-left font-normal text-muted">
                <Swatch id={s.id} />
                <span className="num">Lap {s.lap}</span>
              </th>
              <td className="num pr-4 text-right font-semibold">{p ? Math.round(p.speed) : "—"}</td>
              <td className="num pr-4 text-right">{p ? `${Math.round(p.throttle)}%` : "—"}</td>
              <td className="num text-right">{p ? `${Math.round(p.brake)}%` : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function thin(points: TracePoint[]): TracePoint[] {
  if (points.length <= MAX_POINTS) return points;
  const step = points.length / MAX_POINTS;
  const out: TracePoint[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[Math.floor(i)]);
  out.push(points[points.length - 1]);
  return out;
}

function pathFor(points: TracePoint[], field: Field, max: number, maxDist: number): string {
  let d = "";
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const x = (p.dist / maxDist) * VB_W;
    const y = VB_H - (Math.min(max, Math.max(0, p[field])) / max) * VB_H;
    d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

function speedTicks(max: number): number[] {
  const out: number[] = [];
  for (let v = 100; v <= max; v += 100) out.push(v);
  return out;
}

function distanceTicks(maxDist: number): number[] {
  const step = maxDist <= 1500 ? 250 : maxDist <= 3000 ? 500 : maxDist <= 7000 ? 1000 : 2000;
  const out: number[] = [];
  for (let d = 0; d <= maxDist; d += step) out.push(d);
  return out;
}
