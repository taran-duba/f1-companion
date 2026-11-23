"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useStream } from "@/lib/store";
import { formatGap, towerRows, type TowerRow } from "@/lib/timing";
import type { TimingState } from "@/lib/types";
import { OpenSources } from "../sources/OpenSources";
import { Chip, Diamond, MarkedTime, TeamBar, TyreBadge } from "./Atoms";

interface Props {
  state: TimingState;
  selected: string | null;
  onSelect: (num: string) => void;
  /** Compact = fewer columns regardless of width (e.g. on the replay page). */
  compact?: boolean;
}

/**
 * Columns hide progressively (DESIGN_SYSTEM data-density rule 3), driven by
 * the tower's own width (container queries), not the viewport: the tower
 * shares the screen with other panels, so viewport breakpoints lie.
 * always: pos, driver, interval, last lap, tyre (fits 328px)
 * ≥ 440px: + gap · ≥ 560px: + best, pits · ≥ 790px: + sectors
 * Every column but Driver has a fixed width, sized for its widest value (battle outline,
 * a marked time, a two-digit tyre age): with auto widths, columns jumped sideways whenever
 * a gap or lap time changed length or a sector cleared. Driver takes the spare width, so its
 * chips (PIT, OUT, DNF) appear without moving anything. Times use 8px right padding at
 * every size; 12px (lg:pr-3) left the desktop tower no room to reserve those widths.
 */
const W = {
  interval: "w-[4.75rem] lg:w-[5.25rem]",
  gap: "w-[4.25rem] lg:w-[4.375rem]",
  last: "w-[5.75rem] lg:w-[6.125rem]",
  best: "w-[5.25rem] lg:w-[5.375rem]",
  sector: "w-[4.75rem]",
  tyre: "w-10 @min-[360px]:w-14 @min-[560px]:w-16",
  pits: "w-8",
};

const COL = {
  gap: "hidden @min-[440px]:table-cell",
  best: "hidden @min-[560px]:table-cell",
  sectors: "hidden @min-[835px]:table-cell",
  pits: "hidden @min-[560px]:table-cell",
  age: "hidden @min-[380px]:inline",
};

export function TimingTower({ state, selected, onSelect, compact = false }: Props) {
  const { generation } = useStream();
  const rows = useMemo(() => towerRows(state), [state]);
  const moves = usePositionMoves(rows, generation);
  const lap = state.LapCount?.CurrentLap;
  // Roving focus: one tab stop for the whole tower (the selected row), arrows move within it.
  const focusNum = rows.some((r) => r.num === selected) ? selected : rows[0]?.num;

  /** ↑/↓ (and j/k), Home/End move focus and selection together, starting from the focused row. */
  function onKeyDown(e: React.KeyboardEvent<HTMLTableElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const from = (e.target as HTMLElement).closest<HTMLElement>("[data-num]")?.dataset.num;
    if (!from) return;
    const i = rows.findIndex((r) => r.num === from);
    const to =
      e.key === "ArrowDown" || e.key === "j" ? i + 1
      : e.key === "ArrowUp" || e.key === "k" ? i - 1
      : e.key === "Home" ? 0
      : e.key === "End" ? rows.length - 1
      : null;
    if (to == null) return;
    e.preventDefault();
    const next = rows[Math.max(0, Math.min(rows.length - 1, to))];
    if (!next) return;
    onSelect(next.num);
    e.currentTarget.querySelector<HTMLElement>(`button[data-num="${next.num}"]`)?.focus();
  }

  if (!rows.length) {
    return (
      <div className="rounded-panel border border-line-strong bg-surface p-6 text-muted">
        Waiting for timing data. If this persists, check the source: <OpenSources className="!min-h-0">open the source panel</OpenSources>.
      </div>
    );
  }

  const c = (cls: string) => (compact ? "hidden" : cls);
  return (
    <div className="@container overflow-x-auto">
      <table className="w-full border-collapse text-[0.9375rem] @max-[340px]:text-[0.875rem] @min-[400px]:text-body lg:text-row" onKeyDown={onKeyDown}>
        <caption className="sr-only">
          Timing tower{lap ? `, lap ${lap}` : ""}. Select a driver to show their telemetry; up and down arrows move between
          drivers.
        </caption>
        <thead>
          <tr className="border-b border-line-strong text-left text-small font-semibold text-muted">
            <th scope="col" className="w-9 py-1 pr-1.5 text-right lg:w-10 lg:pr-2">
              Pos
            </th>
            <th scope="col" className="py-1 pl-1">
              Driver
            </th>
            <th scope="col" className={`py-1 pr-2 text-right ${W.interval}`}>
              Interval
            </th>
            <th scope="col" className={`py-1 pr-2 text-right ${W.gap} ${c(COL.gap)}`}>
              Gap
            </th>
            <th scope="col" className={`py-1 pr-2 text-right ${W.last}`}>
              Last lap
            </th>
            <th scope="col" className={`py-1 pr-2 text-right ${W.best} ${c(COL.best)}`}>
              Best
            </th>
            <th scope="col" className={`py-1 pr-2 text-right ${W.sector} ${c(COL.sectors)}`}>
              S1
            </th>
            <th scope="col" className={`py-1 pr-2 text-right ${W.sector} ${c(COL.sectors)}`}>
              S2
            </th>
            <th scope="col" className={`py-1 pr-2 text-right ${W.sector} ${c(COL.sectors)}`}>
              S3
            </th>
            <th scope="col" className={`py-1 pr-2 @min-[560px]:pl-2 ${compact ? "w-14 @min-[560px]:w-16" : W.tyre}`}>
              Tyre
            </th>
            <th scope="col" className={`py-1 pr-1 text-right ${W.pits} ${c(COL.pits)}`}>
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
              focusable={r.num === focusNum}
              move={moves[r.num] ?? 0}
              onSelect={onSelect}
              compact={compact}
            />
          ))}
        </tbody>
      </table>
      <Legend compact={compact} />
    </div>
  );
}

const Row = memo(function Row({
  row: r,
  selected,
  focusable,
  move,
  onSelect,
  compact,
}: {
  row: TowerRow;
  selected: boolean;
  focusable: boolean;
  move: number;
  onSelect: (num: string) => void;
  compact: boolean;
}) {
  const c = (cls: string) => (compact ? "hidden" : cls);
  const out = r.retired || r.stopped;
  const chip = out ? (r.retired ? "DNF" : "STOP") : r.inPit ? "PIT" : r.pitOut ? "OUT" : null;
  return (
    <tr
      onClick={() => onSelect(r.num)}
      className={`h-11 cursor-pointer border-b border-line transition-colors duration-150 lg:h-8 ${
        // Hover is lighter than selection so pointing at a row never reads as selecting it.
        selected ? "bg-raised shadow-[inset_3px_0_0_var(--color-accent)]" : "hover:bg-raised/50"
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
          aria-keyshortcuts="ArrowUp ArrowDown J K Home End"
          data-num={r.num}
          tabIndex={focusable ? 0 : -1}
          // Name starts with the visible text (code + chip) so voice control can target it.
          aria-label={`${r.code}${chip ? ` ${chip}` : ""}, ${r.name}, ${r.team}, ${out ? (r.retired ? "retired" : "stopped") : `P${r.position}`}`}
          className="flex min-h-11 items-center gap-1.5 rounded-chip pr-0 text-left lg:gap-2 lg:pr-1 lg:min-h-8"
        >
          <TeamBar colour={r.teamColour} />
          <span className="font-semibold tracking-wide">{r.code}</span>
          {/* One status chip, most important first, so the driver column stays narrow. */}
          {chip && (
            <Chip tone={out ? "danger" : r.inPit ? "warn" : "muted"} title={chip === "OUT" ? "Out lap" : undefined}>
              {chip}
            </Chip>
          )}
        </button>
      </th>
      <td className="num pr-2 text-right">
        <Interval row={r} />
      </td>
      <td className={`num pr-2 text-right ${c(COL.gap)}`}>
        {out || (!r.gap.leader && formatGap(r.gap) === "—") ? (
          <span className="text-faint">—</span>
        ) : (
          <span className={r.gap.leader ? "text-muted" : ""}>{formatGap(r.gap, { leaderLabel: leaderLap(r) })}</span>
        )}
      </td>
      <td className="pr-2 text-right">
        {out ? (
          // A retired car's last lap is history: no sector colour, row colour (muted).
          <StaleTime value={r.lastLap.value} />
        ) : (
          <Flash value={r.lastLap.value}>
            {/* Yellow on ~19 of 20 last laps carries no signal: only purple/green are marked. */}
            <MarkedTime value={r.lastLap.value} mark={r.lastLap.mark === "yellow" ? "none" : r.lastLap.mark} />
          </Flash>
        )}
      </td>
      <td className={`pr-2 text-right ${c(COL.best)}`}>
        {out && r.bestLap.mark !== "purple" ? (
          <StaleTime value={r.bestLap.value} />
        ) : (
          <MarkedTime value={r.bestLap.value} mark={r.bestLap.mark} />
        )}
      </td>
      {r.sectors.map((s, i) => (
        <td key={i} className={`pr-2 text-right text-body ${c(COL.sectors)}`}>
          {out ? <StaleTime value={s.value} /> : <MarkedTime value={s.value} mark={s.mark} sector />}
        </td>
      ))}
      <td className="pr-2 @min-[560px]:pl-2">
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
  if (text === "—") return <span className="text-faint">—</span>;
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

/** A time for a car that is out: plain, inheriting the row's muted colour. */
function StaleTime({ value }: { value: string }) {
  return value ? <span className="num">{value}</span> : <span className="text-faint">—</span>;
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

/**
 * Tracks position changes and keeps the arrow for a few seconds. A new snapshot
 * (`generation`: reconnect or replay seek) replaces the running order wholesale, so it
 * resets the baseline instead of reporting every car as having gained or lost places.
 */
function usePositionMoves(rows: TowerRow[], generation: number): Record<string, number> {
  const last = useRef<Record<string, number>>({});
  const lastGen = useRef(generation);
  const [moves, setMoves] = useState<Record<string, { d: number; at: number }>>({});
  useEffect(() => {
    if (lastGen.current !== generation) {
      lastGen.current = generation;
      last.current = Object.fromEntries(rows.map((r) => [r.num, r.position]));
      setMoves({});
      return;
    }
    const now = Date.now();
    const next: Record<string, { d: number; at: number }> = {};
    let changed = false;
    for (const r of rows) {
      const before = last.current[r.num];
      // 99 = no position yet (towerRows' fallback): the first real one is not a move.
      if (before != null && before !== 99 && r.position !== 99 && before !== r.position && !r.retired) {
        next[r.num] = { d: before - r.position, at: now };
        changed = true;
      }
      last.current[r.num] = r.position;
    }
    if (changed) {
      setMoves((m) => ({ ...m, ...next }));
    }
  }, [rows, generation]);
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

function Legend({ compact }: { compact: boolean }) {
  return (
    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-small text-muted">
      <span>
        <span className="text-sector-purple">
          <Diamond /> purple
        </span>{" "}
        fastest overall
      </span>
      <span>
        <span className="text-sector-green">▲ green</span> personal best
      </span>
      {/* Yellow only appears in the sector columns (last laps stay plain), so the key follows them. */}
      <span className={compact ? "hidden" : "hidden @min-[790px]:inline"}>
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
