"use client";

import { useMemo } from "react";
import { asList } from "@/lib/merge";
import { extent, lapTicks, linePath, neutralWindows, niceDomain, niceTicks, pitStops, scaleLinear } from "@/lib/charts";
import { lapHistory, towerRows, type TowerRow } from "@/lib/timing";
import type { RaceControlMessage, TimingState } from "@/lib/types";
import { EmptyState } from "../Panel";
import { ChartFigure, ChartSvg, HALO, LapAxis, NeutralBand, PitMarker, YGrid, type Plot } from "./ChartParts";
import { BattleList } from "./BattleList";
import { useChartWidth } from "./useChartWidth";

const BATTLE_WINDOW = 1.0;

/** "Gap to car ahead" for the selected driver, plus every current battle in the field. */
export function GapChart({ state, selected }: { state: TimingState; selected: string | null }) {
  const rows = useMemo(() => towerRows(state), [state]);
  const idx = rows.findIndex((r) => r.num === selected);
  const row = idx >= 0 ? rows[idx] : undefined;
  const ahead = idx > 0 ? rows[idx - 1] : undefined;

  return (
    <div className="flex flex-col gap-4">
      {!selected || !row ? (
        <EmptyState>Select a driver in the timing tower to chart their gap to the car ahead.</EmptyState>
      ) : (
        <IntervalChart state={state} row={row} ahead={ahead} />
      )}
      <BattleList rows={rows} />
    </div>
  );
}

function IntervalChart({ state, row, ahead }: { state: TimingState; row: TowerRow; ahead?: TowerRow }) {
  const { ref, width } = useChartWidth();
  const laps = lapHistory(state, row.num);
  // The leader has no car ahead: its interval is meaningless (0 or null).
  const points = laps.map((l) => ({
    lap: l.lap,
    v: l.pos === 1 || l.interval == null || l.lapsDown > 0 ? null : l.interval,
  }));
  const stops = pitStops(laps);
  const ledLaps = laps.filter((l) => l.pos === 1).length;
  const plotted = points.filter((p) => p.v != null);
  const messages = asList<RaceControlMessage>(state.RaceControlMessages?.Messages).filter(Boolean);
  const currentLap = state.LapCount?.CurrentLap ?? null;

  const now = row.interval;
  const headline =
    row.position === 1 || row.gap.leader ? (
      <span>
        <span className="font-semibold">{row.code}</span> is leading. No car ahead.
      </span>
    ) : row.inPit ? (
      <span>
        <span className="font-semibold">{row.code}</span>
        <span className="text-muted"> is in the pit lane. The interval updates when the car rejoins.</span>
      </span>
    ) : now.lapsDown ? (
      <span>
        <span className="font-semibold">{row.code}</span> is lapped by the car ahead.
      </span>
    ) : now.seconds != null ? (
      <span>
        <span className="font-semibold">{row.code}</span>{" "}
        <span className="num text-title font-semibold">{now.seconds.toFixed(3)}</span>
        <span className="text-muted"> s behind </span>
        <span className="font-semibold">{ahead?.code ?? "car ahead"}</span>
      </span>
    ) : (
      <span>
        <span className="font-semibold">{row.code}</span>
        <span className="text-muted">: no interval yet.</span>
      </span>
    );

  if (plotted.length < 2) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-body">{headline}</p>
        <EmptyState>
          {row.position === 1 && plotted.length === 0
            ? `${row.code} has led every lap so far, so there is no gap to chart. Select another driver to see theirs.`
            : `The chart starts once ${row.code} has completed two laps behind another car.`}
        </EmptyState>
      </div>
    );
  }

  const narrow = width < 480;
  const height = narrow ? 196 : 216;
  // Below the axis: a lane for pit-stop markers, then the lap labels.
  const plot: Plot = {
    left: 40,
    top: 22,
    right: width - 8,
    bottom: height - 54,
  };
  const lapExt = extent(points.map((p) => p.lap)) ?? [1, 2];
  const x = scaleLinear([lapExt[0], Math.max(lapExt[1], lapExt[0] + 1)], [plot.left + 4, plot.right - 4]);
  const vMax = Math.max(1.5, ...plotted.map((p) => p.v as number));
  const yDom = niceDomain(0, vMax, 4);
  const y = scaleLinear(yDom, [plot.bottom, plot.top]);
  const yTicks = niceTicks(yDom[0], yDom[1], 4);
  const span = lapExt[1] - lapExt[0];
  const xTicks = lapTicks(lapExt[1], span > 40 ? 10 : span > 15 ? 5 : 2).filter((t) => t >= lapExt[0]);
  const windows = neutralWindows(messages, currentLap).filter((w) => w.end >= lapExt[0] && w.start <= lapExt[1]);
  const path = linePath(points.map((p) => (p.v == null ? null : [x(p.lap), y(p.v)])));
  const last = plotted[plotted.length - 1];
  const inWindow = plotted.filter((p) => (p.v as number) < BATTLE_WINDOW).length;
  const stepFmt = (v: number) => (yDom[1] <= 3 ? v.toFixed(1) : String(Math.round(v * 10) / 10));

  const summary =
    `Gap to the car ahead for ${row.code} over ${plotted.length} laps, from lap ${plotted[0].lap} to lap ${last.lap}. ` +
    `Latest ${(last.v as number).toFixed(3)} seconds. Within one second on ${inWindow} of those laps.` +
    (ledLaps ? ` Led ${ledLaps} lap${ledLaps === 1 ? "" : "s"}, with no car ahead to measure.` : "") +
    (stops.length ? ` Pit stops on lap ${stops.map((p) => p.lap).join(", ")}.` : "") +
    (windows.length
      ? ` ${windows.map((w) => `${w.kind === "SC" ? "Safety car" : "Virtual safety car"} laps ${w.start} to ${w.end}`).join("; ")}.`
      : "");

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body" aria-live="off">
        {headline}
      </p>
      <ChartFigure summary={summary} innerRef={ref}>
        <ChartSvg width={width} height={height}>
          {windows.map((w, i) => (
            <NeutralBand
              key={i}
              x0={x(Math.max(w.start, lapExt[0]) - 0.5)}
              x1={x(Math.min(w.end, lapExt[1]) + 0.5)}
              plot={plot}
              label={w.kind}
            />
          ))}
          <YGrid y={y} ticks={yTicks} plot={plot} format={stepFmt} title="Interval (s)" />
          <LapAxis x={x} ticks={xTicks} plot={plot} labelGap={36} />
          {/* 1 s battle / DRS window */}
          <line
            x1={plot.left}
            x2={plot.right}
            y1={y(BATTLE_WINDOW)}
            y2={y(BATTLE_WINDOW)}
            className="stroke-warn"
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />
          <path d={path} fill="none" stroke={row.teamColour} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {plotted.length <= 40 &&
            plotted.map((p) => <circle key={p.lap} cx={x(p.lap)} cy={y(p.v as number)} r={2.5} fill={row.teamColour} />)}
          <circle
            cx={x(last.lap)}
            cy={y(last.v as number)}
            r={4.5}
            className="fill-text"
            stroke={row.teamColour}
            strokeWidth={2}
          />
          <text x={plot.right} y={y(BATTLE_WINDOW) - 5} textAnchor="end" className="fill-warn text-micro font-semibold" {...HALO}>
            1 s battle window
          </text>
          {stops.map((p) => (
            <PitMarker key={p.lap} x={x(p.at)} y={plot.bottom + 12} />
          ))}
        </ChartSvg>
      </ChartFigure>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-small text-muted">
        <span>
          <span aria-hidden="true" className="mr-1 inline-block w-5 border-t-2 border-dashed border-warn align-middle" />
          Within 1 s: DRS range
        </span>
        <span>
          <span
            aria-hidden="true"
            className="mr-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-warn text-[10px] font-bold leading-none text-warn"
          >
            P
          </span>
          Pit stop
        </span>
        {windows.length > 0 && (
          <span>
            <span aria-hidden="true" className="mr-1 inline-block h-3 w-4 border-t-2 border-flag-yellow bg-raised align-middle" />
            {windows.some((w) => w.kind === "VSC")
              ? windows.some((w) => w.kind === "SC")
                ? "Safety car (SC) or virtual (VSC)"
                : "Virtual safety car"
              : "Safety car"}
          </span>
        )}
        {ledLaps > 0 && (
          <span>
            No line while leading ({ledLaps} lap{ledLaps === 1 ? "" : "s"})
          </span>
        )}
      </p>
    </div>
  );
}
