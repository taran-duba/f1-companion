"use client";

import {
  COMPOUND_STYLE,
  compoundRuns,
  formatLapTick,
  isPitLap,
  lapTicks,
  lapTimeDomain,
  linePath,
  niceStep,
  niceTicks,
  pitStops,
  scaleLinear,
  type Scale,
} from "@/lib/charts";
import { formatMs } from "@/lib/timing";
import type { LapRecord } from "@/lib/types";
import { EmptyState } from "../Panel";
import { ChartFigure, ChartSvg, HALO, LapAxis, LegendItem, PitMarker, YGrid, type Plot } from "./ChartParts";
import { useChartWidth } from "./useChartWidth";

interface Props {
  laps: LapRecord[];
  compareLaps?: LapRecord[];
  height?: number;
  /** Series colours (team colours); defaults keep the two series apart without them. */
  colour?: string;
  compareColour?: string;
  label?: string;
  compareLabel?: string;
}

const STRIP_H = 16;

/** Lap time per lap: pit laps marked and kept out of the scale, compound strip under the axis, PB marked ▲. */
export function LapTimeChart({
  laps,
  compareLaps,
  height = 240,
  colour = "var(--color-text)",
  compareColour = "var(--color-muted)",
  label = "This driver",
  compareLabel = "Comparison",
}: Props) {
  const { ref, width } = useChartWidth();
  const timed = laps.filter((l) => l.ms != null && l.ms > 0);
  const domain = lapTimeDomain([...laps, ...(compareLaps ?? [])]);

  if (timed.length < 2 || !domain) {
    return (
      <EmptyState>Lap times appear after two completed laps. Check back once the car has crossed the line twice.</EmptyState>
    );
  }

  const maxLap = Math.max(...laps.map((l) => l.lap), ...(compareLaps ?? []).map((l) => l.lap), 2);
  const minLap = Math.min(...laps.map((l) => l.lap), ...(compareLaps ?? []).map((l) => l.lap));
  const plot: Plot = {
    left: 52,
    top: 24,
    right: width - 8,
    bottom: height - 34 - STRIP_H - 6,
  };
  const x = scaleLinear([minLap, Math.max(maxLap, minLap + 1)], [plot.left + 6, plot.right - 6]);
  const y = scaleLinear(domain, [plot.bottom, plot.top]);
  const step = niceStep(domain[1] - domain[0], 4);
  const yTicks = niceTicks(domain[0], domain[1], 4);
  const span = maxLap - minLap;
  const xTicks = lapTicks(maxLap, span > 40 ? 10 : span > 15 ? 5 : 2).filter((t) => t >= minLap);
  const runs = compoundRuns(laps);
  const stripY = plot.bottom + 6;
  const axisPlot: Plot = { ...plot, bottom: plot.bottom };

  const clean = laps.filter((l) => !isPitLap(l) && l.ms != null && l.ms > 0);
  const best = clean.reduce<LapRecord | null>((b, l) => (b == null || (l.ms as number) < (b.ms as number) ? l : b), null);
  const pits = laps.filter(isPitLap);
  const stops = pitStops(laps);
  const offScale = clean.filter((l) => (l.ms as number) > domain[1]);
  const two = !!compareLaps?.length;

  const summary =
    `Lap times for ${label} over ${timed.length} laps, laps ${minLap} to ${maxLap}.` +
    (best ? ` Best lap ${formatMs(best.ms)} on lap ${best.lap}.` : "") +
    (pits.length ? ` In and out laps, left out of the scale: ${pits.map((l) => l.lap).join(", ")}.` : "") +
    (offScale.length ? ` Off the top of the scale: laps ${offScale.map((l) => l.lap).join(", ")}.` : "") +
    ` Tyres: ${runs.map((r) => `${COMPOUND_STYLE[r.compound].name} laps ${r.start} to ${r.end}`).join("; ")}.` +
    (two ? ` Compared with ${compareLabel}, drawn dashed with square markers.` : "");

  return (
    <div className="flex flex-col gap-2">
      <ChartFigure summary={summary} innerRef={ref}>
        <ChartSvg width={width} height={height}>
          <YGrid y={y} ticks={yTicks} plot={plot} format={(v) => formatLapTick(v, step)} title="Lap time (m:ss)" />
          <LapAxis x={x} ticks={xTicks} plot={axisPlot} labelGap={STRIP_H + 20} />
          {runs.map((r, i) => {
            const st = COMPOUND_STYLE[r.compound];
            const x0 = Math.max(plot.left, x(r.start - 0.5)) + (i > 0 ? 1 : 0);
            const w = Math.max(2, Math.min(plot.right, x(r.end + 0.5)) - x0 - 1);
            return (
              <g key={i}>
                <rect
                  x={x0}
                  y={stripY}
                  width={w}
                  height={STRIP_H}
                  rx={2}
                  fill={st.colour}
                  fillOpacity={0.22}
                  stroke={st.colour}
                  strokeWidth={1}
                />
                {w >= 12 && (
                  <text
                    x={x0 + w / 2}
                    y={stripY + STRIP_H / 2}
                    dy="0.35em"
                    textAnchor="middle"
                    className="text-[11px] font-bold"
                    fill={st.colour}
                  >
                    {st.letter}
                  </text>
                )}
              </g>
            );
          })}
          {two && <Series laps={compareLaps!} x={x} y={y} plot={plot} colour={compareColour} dash="6 4" marker="square" />}
          <Series laps={laps} x={x} y={y} plot={plot} colour={colour} marker="circle" />
          {/* One marker per stop, sitting on the compound strip where the tyres change. */}
          {stops.map((p) => (
            <PitMarker key={p.lap} x={x(p.at)} y={stripY + STRIP_H / 2} />
          ))}
          {best && <BestMarker x={x(best.lap)} y={y(best.ms as number)} text={formatMs(best.ms)} right={plot.right} />}
        </ChartSvg>
      </ChartFigure>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-muted">
        {two && <LegendItem colour={colour} marker="circle" label={label} />}
        {two && <LegendItem colour={compareColour} dash="6 4" marker="square" label={compareLabel} />}
        <span>
          <span aria-hidden="true" className="mr-1 text-sector-green">
            ▲
          </span>
          Personal best
        </span>
        <span>
          <span
            aria-hidden="true"
            className="mr-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-warn text-[10px] font-bold leading-none text-warn"
          >
            P
          </span>
          Pit stop (in and out laps not plotted)
        </span>
        {offScale.length > 0 && (
          <span>
            <span aria-hidden="true" className="mr-1">
              ↑
            </span>
            Off scale
          </span>
        )}
      </p>
    </div>
  );
}

function Series({
  laps,
  x,
  y,
  plot,
  colour,
  dash,
  marker,
}: {
  laps: LapRecord[];
  x: Scale;
  y: Scale;
  plot: Plot;
  colour: string;
  dash?: string;
  marker: "circle" | "square";
}) {
  const [, hi] = y.domain;
  const pts = laps.map((l) =>
    isPitLap(l) || l.ms == null || l.ms <= 0 || l.ms > hi ? null : ([x(l.lap), y(l.ms)] as [number, number]),
  );
  const showMarkers = laps.length <= 60;
  return (
    <g>
      <path d={linePath(pts)} fill="none" stroke={colour} strokeWidth={2} strokeDasharray={dash} strokeLinejoin="round" />
      {showMarkers &&
        pts.map((p, i) =>
          !p ? null : marker === "circle" ? (
            <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill={colour} />
          ) : (
            <rect key={i} x={p[0] - 2.5} y={p[1] - 2.5} width={5} height={5} fill={colour} />
          ),
        )}
      {laps
        .filter((l) => !isPitLap(l) && l.ms != null && l.ms > hi)
        .map((l) => (
          <text
            key={`off-${l.lap}`}
            x={x(l.lap)}
            y={plot.top + 4}
            textAnchor="middle"
            className="text-micro font-bold"
            fill={colour}
          >
            ↑
          </text>
        ))}
    </g>
  );
}

function BestMarker({ x, y, text, right }: { x: number; y: number; text: string; right: number }) {
  const anchorEnd = x > right - 70;
  return (
    <g>
      <text x={x} y={y} dy="0.38em" textAnchor="middle" className="fill-sector-green text-[13px]">
        ▲
      </text>
      <text
        x={anchorEnd ? x - 9 : x + 9}
        y={y - 8}
        textAnchor={anchorEnd ? "end" : "start"}
        className="num fill-sector-green text-micro font-semibold"
        {...HALO}
      >
        {text}
      </text>
    </g>
  );
}
