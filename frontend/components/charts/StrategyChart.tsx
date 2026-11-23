"use client";

import { useMemo, type KeyboardEvent } from "react";
import { COMPOUND_STYLE, lapTicks, scaleLinear, stintSpans, type StintSpan } from "@/lib/charts";
import { stints, towerRows, type TowerRow } from "@/lib/timing";
import type { TimingState } from "@/lib/types";
import { EmptyState } from "../Panel";
import { ChartFigure, ChartSvg, LapAxis, type Plot } from "./ChartParts";
import { StrategyTable } from "./StrategyTable";
import { useChartWidth } from "./useChartWidth";

export interface StrategyRow {
  row: TowerRow;
  spans: StintSpan[];
}

interface Props {
  state: TimingState;
  onSelect?: (num: string) => void;
  selected?: string | null;
}

/** Tyre strategy for the whole field in running order: one bar per stint across the race laps. */
export function StrategyChart({ state, onSelect, selected }: Props) {
  const { ref, width } = useChartWidth();
  const data: StrategyRow[] = useMemo(
    () =>
      towerRows(state).map((row) => ({
        row,
        spans: stintSpans(stints(state, row.num), row.laps),
      })),
    [state],
  );
  const withStints = data.filter((d) => d.spans.length > 0);

  if (!withStints.length) {
    return <EmptyState>No tyre data yet. Stints appear once the session starts and cars leave the pit lane.</EmptyState>;
  }

  const currentLap = state.LapCount?.CurrentLap ?? 0;
  const maxEnd = Math.max(0, ...data.flatMap((d) => d.spans.map((s) => s.end)));
  // The axis counts completed laps (stint bars end at x(laps done)), so the "now" line
  // sits where the leader's completed laps end, labelled with the lap in progress.
  const leaderDone = Math.max(0, ...data.map((d) => d.row.laps));
  const totalLaps = Math.max(state.LapCount?.TotalLaps ?? 0, maxEnd, currentLap, 1);

  const narrow = width < 640;
  // Phone rows are tap targets: the highlight rect (rowH − 2) must stay ≥ 44px.
  const rowH = onSelect && narrow ? 46 : 28;
  const barH = 18;
  const labelW = 64;
  const plot: Plot = {
    left: labelW,
    top: 22,
    right: width - 4,
    bottom: 22 + data.length * rowH,
  };
  const height = plot.bottom + 38;
  const x = scaleLinear([0, totalLaps], [plot.left, plot.right]);
  const ticks = lapTicks(totalLaps, totalLaps > 30 ? 10 : 5);
  const present = new Set(data.flatMap((d) => d.spans.map((s) => s.compound)));

  const summary =
    `Tyre strategy for ${data.length} drivers in race order` +
    (currentLap > 0 ? `, lap ${currentLap} of ${totalLaps}. ` : `, ${totalLaps} laps. `) +
    `The table below lists every stint.`;

  return (
    <div className="flex flex-col gap-2">
      <ChartFigure summary={summary} innerRef={ref}>
        <ChartSvg width={width} height={height} label={onSelect ? "Tyre strategy: choose a driver" : undefined}>
          <g aria-hidden="true">
            <LapAxis x={x} ticks={ticks} plot={plot} labelGap={16} />
            {currentLap > 0 && leaderDone > 0 && leaderDone < totalLaps && (
              <g>
                <line
                  x1={x(leaderDone)}
                  x2={x(leaderDone)}
                  y1={plot.top - 4}
                  y2={plot.bottom}
                  className="stroke-muted"
                  strokeWidth={1}
                />
                <text
                  x={x(leaderDone)}
                  y={plot.top - 8}
                  textAnchor={x(leaderDone) > plot.right - 40 ? "end" : "middle"}
                  className="num fill-muted text-micro font-semibold"
                >
                  Lap {currentLap}
                </text>
              </g>
            )}
          </g>
          {data.map((d, i) => (
            <StrategyBarRow
              key={d.row.num}
              d={d}
              y={plot.top + i * rowH}
              rowH={rowH}
              barH={barH}
              plot={plot}
              x={x}
              selected={selected === undefined ? undefined : selected === d.row.num}
              onSelect={onSelect}
            />
          ))}
        </ChartSvg>
      </ChartFigure>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-small text-muted" aria-hidden="true">
        {(Object.keys(COMPOUND_STYLE) as (keyof typeof COMPOUND_STYLE)[])
          .filter((c) => present.has(c))
          .map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex h-4 w-5 items-center justify-center rounded-[3px] text-[11px] font-bold"
                style={{
                  border: `1.5px solid ${COMPOUND_STYLE[c].colour}`,
                  color: COMPOUND_STYLE[c].colour,
                }}
              >
                {COMPOUND_STYLE[c].letter}
              </span>
              {COMPOUND_STYLE[c].name}
            </span>
          ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-4 w-0.5 bg-line-control" />
          Pit stop
        </span>
      </p>
      <StrategyTable data={data} totalLaps={totalLaps} />
    </div>
  );
}

function StrategyBarRow({
  d,
  y,
  rowH,
  barH,
  plot,
  x,
  selected,
  onSelect,
}: {
  d: StrategyRow;
  y: number;
  rowH: number;
  barH: number;
  plot: Plot;
  x: (v: number) => number;
  /** Undefined when the chart has no selection state (rows then act as plain buttons). */
  selected?: boolean;
  onSelect?: (num: string) => void;
}) {
  const { row, spans } = d;
  const dim = row.retired ? 0.5 : 1;
  const by = y + (rowH - barH) / 2;
  const cy = y + rowH / 2;
  const interactive = !!onSelect;
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(row.num);
    }
  };
  return (
    <g
      className={`group outline-none ${interactive ? "cursor-pointer" : ""}`}
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": `${row.code}${row.position < 99 ? `, position ${row.position}` : ""}${row.retired ? ", out" : ""}`,
            ...(selected === undefined ? {} : { "aria-pressed": selected }),
            onClick: () => onSelect?.(row.num),
            onKeyDown: onKey,
          }
        : {})}
    >
      <rect
        x={0}
        y={y + 1}
        width={plot.right}
        height={rowH - 2}
        rx={3}
        strokeWidth={2}
        className={`${selected ? "fill-raised" : interactive ? "fill-transparent group-hover:fill-raised" : "fill-transparent"} stroke-transparent group-focus-visible:stroke-accent`}
      />
      {selected && <rect x={0} y={y + 1} width={2} height={rowH - 2} className="fill-accent" />}
      {/* Retired cars are dimmed; the "Out" word below stays full strength. */}
      <g opacity={dim}>
        <text x={20} y={cy} dy="0.35em" textAnchor="end" className="num fill-faint text-micro">
          {row.position < 99 ? row.position : ""}
        </text>
        <rect x={25} y={cy - 8} width={4} height={16} rx={1} fill={row.teamColour} />
        <text x={33} y={cy} dy="0.35em" className="fill-text text-small font-semibold">
          {row.code}
        </text>
        {spans.map((s) => {
          const style = COMPOUND_STYLE[s.compound];
          if (s.laps <= 0) {
            if (!s.current) return null;
            // Fresh set, no laps on it yet: a chip at the stint start shows the compound.
            const cx0 = x(s.start - 1) + 3;
            return (
              <g key={s.index}>
                <rect
                  x={cx0}
                  y={by + 0.75}
                  width={16}
                  height={barH - 1.5}
                  rx={2}
                  fill="none"
                  stroke={style.colour}
                  strokeWidth={1.5}
                />
                <text x={cx0 + 8} y={cy} dy="0.35em" textAnchor="middle" className="text-micro font-bold" fill={style.colour}>
                  {style.letter}
                </text>
              </g>
            );
          }
          const x0 = x(s.start - 1) + (s.index > 0 ? 1.5 : 0);
          const x1 = x(s.end) - (s.current ? 0 : 1.5);
          const w = Math.max(1, x1 - x0);
          const label = w >= 46 ? `${style.letter} ${s.laps}` : w >= 13 ? style.letter : "";
          return (
            <g key={s.index}>
              <rect x={x0} y={by} width={w} height={barH} rx={2} fill={style.colour} fillOpacity={0.22} />
              <path
                d={
                  s.current && !row.retired
                    ? `M${x1},${by + 0.75}H${x0 + 0.75}V${by + barH - 0.75}H${x1}`
                    : `M${x0 + 0.75},${by + 0.75}H${x0 + w - 0.75}V${by + barH - 0.75}H${x0 + 0.75}Z`
                }
                fill="none"
                stroke={style.colour}
                strokeWidth={1.5}
              />
              {label && (
                <text
                  x={x0 + w / 2}
                  y={cy}
                  dy="0.35em"
                  textAnchor="middle"
                  className="num text-micro font-bold"
                  fill={style.colour}
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
        {spans
          .slice(1)
          .map((s) =>
            s.laps > 0 || s.current ? (
              <line
                key={`pit-${s.index}`}
                x1={x(s.start - 1)}
                x2={x(s.start - 1)}
                y1={by - 3}
                y2={by + barH + 3}
                className="stroke-line-control"
                strokeWidth={2}
              />
            ) : null,
          )}
      </g>
      {(row.retired || row.stopped) && spans.length > 0 && (
        <text
          x={Math.min(x(Math.max(0, ...spans.map((s) => s.end))) + 6, plot.right - 24)}
          y={cy}
          dy="0.35em"
          className="fill-danger text-micro font-bold"
        >
          Out
        </text>
      )}
    </g>
  );
}
