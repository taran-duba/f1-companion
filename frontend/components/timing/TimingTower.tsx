"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { formatGap, towerRows, type TowerRow } from "@/lib/timing";
import type { TimingState } from "@/lib/types";
import { Chip, MarkedTime, TeamBar, TyreBadge } from "./Atoms";

interface Props {
  state: TimingState;
  selected: string | null;
  onSelect: (num: string) => void;
  /** Compact = fewer columns regardless of width (e.g. on the replay page). */
  compact?: boolean;
}

/**
 * Columns hide progressively (DESIGN_SYSTEM data-density rule 3):
 * always: pos, driver, interval, last lap, tyre
 * ≥ sm(390): + pits hidden, gap hidden
 * ≥ md(768): + gap, best, pits
 * ≥ xl(1280): + sectors
 */
const COL = {
  gap: "hidden md:table-cell",
  best: "hidden md:table-cell",
  sectors: "hidden xl:table-cell",
  pits: "hidden md:table-cell",
  age: "hidden sm:inline",
};

export function TimingTower({ state, selected, onSelect, compact = false }: Props) {
  const rows = useMemo(() => towerRows(state), [state]);
  const moves = usePositionMoves(rows);
  const lap = state.LapCount?.CurrentLap;

  if (!rows.length) {
    return (
      <div className="rounded-panel border border-line-strong bg-surface p-6 text-muted">
        Waiting for timing data. If this persists, check the source on the Settings page.
      </div>
    );
  }

  const c = (cls: string) => (compact ? "hidden" : cls);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body lg:text-row">
        <caption className="sr-only">
          Timing tower{lap ? `, lap ${lap}` : ""}. Select a driver to show their telemetry.
        </caption>
        <thead>
          <tr className="border-b border-line-strong text-left text-small font-semibold text-muted">
            <th scope="col" className="w-9 py-1 pr-1.5 text-right lg:w-10 lg:pr-2">
              Pos
            </th>
            <th scope="col" className="py-1 pl-1">
              Driver
            </th>
            <th scope="col" className="py-1 pr-2 lg:pr-3 text-right">
              Interval
            </th>
            <th scope="col" className={`py-1 pr-2 lg:pr-3 text-right ${c(COL.gap)}`}>
              Gap
            </th>
            <th scope="col" className="py-1 pr-2 lg:pr-3 text-right">
              Last lap
            </th>
            <th scope="col" className={`py-1 pr-2 lg:pr-3 text-right ${c(COL.best)}`}>
              Best
            </th>
            <th scope="col" className={`py-1 pr-2 text-right ${c(COL.sectors)}`}>
              S1
            </th>
            <th scope="col" className={`py-1 pr-2 text-right ${c(COL.sectors)}`}>
              S2
            </th>
            <th scope="col" className={`py-1 pr-2 lg:pr-3 text-right ${c(COL.sectors)}`}>
              S3
            </th>
            <th scope="col" className="py-1 pr-2">
              Tyre
            </th>
            <th scope="col" className={`py-1 pr-1 text-right ${c(COL.pits)}`}>
              <abbr title="Pit stops" className="no-underline">
                Pits
              </abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row
              key={r.num}
              row={r}
              selected={r.num === selected}
              move={moves[r.num] ?? 0}
              onSelect={onSelect}
              compact={compact}
            />
          ))}
        </tbody>
      </table>
      <Legend />
    </div>
  );
}

const Row = memo(function Row({
  row: r,
  selected,
  move,
  onSelect,
  compact,
}: {
  row: TowerRow;
  selected: boolean;
  move: number;
  onSelect: (num: string) => void;
  compact: boolean;
}) {
  const c = (cls: string) => (compact ? "hidden" : cls);
  const out = r.retired || r.stopped;
  return (
    <tr
      onClick={() => onSelect(r.num)}
      className={`h-11 cursor-pointer border-b border-line transition-colors duration-150 hover:bg-raised lg:h-[35px] ${
        selected ? "bg-raised shadow-[inset_3px_0_0_var(--color-accent)]" : ""
      } ${out ? "text-muted" : ""}`}
    >
      <td className="num w-9 pr-1.5 text-right align-middle lg:w-10 lg:pr-2 text-title leading-none font-bold">
        <span className="inline-flex items-baseline justify-end gap-0.5">
          <PositionMove move={move} />
          {out ? <span className="text-small text-muted">—</span> : r.position}
        </span>
      </td>
      <th scope="row" className="pl-1 text-left font-normal">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(r.num);
          }}
          aria-pressed={selected}
          aria-label={`${r.code}, ${r.name}, ${r.team}, ${out ? (r.retired ? "retired" : "stopped") : `P${r.position}`}`}
          className="flex min-h-11 items-center gap-1.5 rounded-chip pr-0 text-left lg:gap-2 lg:pr-1 lg:min-h-[35px]"
        >
          <TeamBar colour={r.teamColour} />
          <span className="font-semibold tracking-wide">{r.code}</span>
          {r.inPit && <Chip tone="warn">PIT</Chip>}
          {r.pitOut && !r.inPit && <Chip tone="muted">OUT LAP</Chip>}
          {out && <Chip tone="danger">{r.retired ? "DNF" : "STOP"}</Chip>}
        </button>
      </th>
      <td className="num pr-2 lg:pr-3 text-right">
        <Interval row={r} />
      </td>
      <td className={`num pr-2 lg:pr-3 text-right ${c(COL.gap)}`}>
        {out ? (
          <span className="text-faint">—</span>
        ) : (
          <span className={r.gap.leader ? "text-muted" : ""}>{formatGap(r.gap, { leaderLabel: leaderLap(r) })}</span>
        )}
      </td>
      <td className="pr-2 lg:pr-3 text-right">
        <Flash value={r.lastLap.value}>
          {/* Yellow on ~19 of 20 last laps carries no signal: only purple/green are marked. */}
          <MarkedTime value={r.lastLap.value} mark={r.lastLap.mark === "yellow" ? "none" : r.lastLap.mark} />
        </Flash>
      </td>
      <td className={`pr-2 lg:pr-3 text-right ${c(COL.best)}`}>
        <MarkedTime value={r.bestLap.value} mark={r.bestLap.mark} />
      </td>
      {r.sectors.map((s, i) => (
        <td key={i} className={`${i === 2 ? "pr-2 lg:pr-3" : "pr-2"} text-right text-body ${c(COL.sectors)}`}>
          <MarkedTime value={s.value} mark={s.mark} sector />
        </td>
      ))}
      <td className="pr-2">
        <span className="flex items-center gap-1.5">
          <TyreBadge compound={r.compound} />
          <span className={`num text-small text-muted ${compact ? "" : COL.age}`}>
            {r.tyreAge ?? "—"}
            <span className="sr-only"> laps old</span>
          </span>
        </span>
      </td>
      <td className={`num pr-1 text-right text-muted ${c(COL.pits)}`}>{r.pits}</td>
    </tr>
  );
});

function Interval({ row: r }: { row: TowerRow }) {
  if (r.retired || r.stopped) return <span className="text-faint">—</span>;
  if (r.position === 1 || r.interval.leader) return <span className="text-muted">Leader</span>;
  const text = formatGap(r.interval);
  if (r.battle) {
    return (
      <span
        title="Within one second of the car ahead"
        className="inline-flex items-center gap-0.5 rounded-chip px-0.5 font-semibold text-warn lg:gap-1 lg:px-1 outline outline-1 outline-warn/70"
      >
        <span aria-hidden="true" className="text-[0.75rem]">
          ⇢
        </span>
        {text}
        <span className="sr-only">(battle)</span>
      </span>
    );
  }
  return <span>{text}</span>;
}

function PositionMove({ move }: { move: number }) {
  if (!move) return <span aria-hidden="true" className="inline-block w-3" />;
  return move > 0 ? (
    <span className="w-3 text-[0.75rem] leading-none text-ok" title={`Gained ${move}`}>
      <span aria-hidden="true">▲</span>
      <span className="sr-only">gained {move}</span>
    </span>
  ) : (
    <span className="w-3 text-[0.75rem] leading-none text-danger" title={`Lost ${-move}`}>
      <span aria-hidden="true">▼</span>
      <span className="sr-only">lost {-move}</span>
    </span>
  );
}

/** Brief background fade when the value changes (disabled by reduced motion in CSS). */
function Flash({ value, children }: { value: string; children: React.ReactNode }) {
  const [key, setKey] = useState(0);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value && prev.current !== "" && value !== "") {
       
      setKey((k) => k + 1);
    }
    prev.current = value;
  }, [value]);
  return (
    <span key={key} className={`inline-block rounded-chip px-0.5 lg:px-1 ${key ? "animate-flash" : ""}`}>
      {children}
    </span>
  );
}

/** Tracks position changes and keeps the arrow for a few seconds. */
function usePositionMoves(rows: TowerRow[]): Record<string, number> {
  const last = useRef<Record<string, number>>({});
  const [moves, setMoves] = useState<Record<string, { d: number; at: number }>>({});
  useEffect(() => {
    const now = Date.now();
    const next: Record<string, { d: number; at: number }> = {};
    let changed = false;
    for (const r of rows) {
      const before = last.current[r.num];
      if (before != null && before !== r.position && !r.retired) {
        next[r.num] = { d: before - r.position, at: now };
        changed = true;
      }
      last.current[r.num] = r.position;
    }
    if (changed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from previous render's positions
      setMoves((m) => ({ ...m, ...next }));
    }
  }, [rows]);
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - 5000;
      setMoves((m) => {
        const kept = Object.fromEntries(Object.entries(m).filter(([, v]) => v.at > cutoff));
        return Object.keys(kept).length === Object.keys(m).length ? m : kept;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => Object.fromEntries(Object.entries(moves).map(([k, v]) => [k, v.d])), [moves]);
}

function Legend() {
  return (
    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-small text-muted">
      <span>
        <span className="text-sector-purple">◆ purple</span> fastest overall
      </span>
      <span>
        <span className="text-sector-green">▲ green</span> personal best
      </span>
      <span>
        <span className="text-sector-yellow">yellow</span> slower sector
      </span>
      <span>
        <span className="text-warn">⇢</span> within 1 s of car ahead
      </span>
      <Link href="/driver" className="-my-3 ml-auto inline-flex min-h-11 items-center underline underline-offset-4 hover:text-text lg:my-0 lg:min-h-0">
        All drivers
      </Link>
    </p>
  );
}

function leaderLap(r: TowerRow): string {
  const m = r.gap.raw.match(/(\d+)/);
  return m ? `Lap ${m[1]}` : "Leader";
}
