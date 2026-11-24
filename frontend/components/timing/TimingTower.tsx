"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useFitHeight } from "@/lib/fit";
import { isFavourite, usePrefs } from "@/lib/prefs";
import { useStream } from "@/lib/store";
import { formatGap, knockedOutIn, qualiPart, sessionKind, towerRows, type QualiPart, type SessionKind, type TowerRow } from "@/lib/timing";
import type { TimingState } from "@/lib/types";
import { OpenSources } from "../sources/OpenSources";
import { Chip, Diamond, MarkedTime, TeamBar, TyreBadge } from "./Atoms";
import { usePositionMoves, useRowGlide } from "./towerHooks";

interface Props {
  state: TimingState;
  selected: string | null;
  onSelect: (num: string) => void;
  /** Compact = fewer columns regardless of width (e.g. on the replay page). */
  compact?: boolean;
}

type GapMode = "interval" | "leader";

/**
 * Columns hide progressively (DESIGN_SYSTEM data-density rule 3), driven by
 * the tower's own width (container queries), not the viewport: the tower
 * shares the screen with other panels, so viewport breakpoints lie.
 * always: pos, driver, main gap (interval or leader, your pick), main time, tyre (fits 328px)
 * ≥ 400px: + places gained since the start (races) · ≥ 520px: + the other gap
 * ≥ 600px: + the other time, pits · ≥ 720px: + team name · ≥ 835px: + sectors
 * Every column but Driver has a fixed width, sized for its widest value (battle outline,
 * a marked time, a two-digit tyre age): with auto widths, columns jumped sideways whenever
 * a gap or lap time changed length or a sector cleared. Driver takes the spare width, so its
 * chips (PIT, OUT, DNF, FL) appear without moving anything.
 */
const W = {
  interval: "w-[4.75rem] lg:w-[5.25rem]",
  gap: "w-[4.75rem] lg:w-[5.25rem]",
  gained: "w-9",
  time: "w-[5.75rem] lg:w-[6.125rem]",
  time2: "w-[5.25rem] lg:w-[5.375rem]",
  sector: "w-[4.75rem]",
  tyre: "w-10 @min-[360px]:w-14 @min-[560px]:w-16",
  pits: "w-8",
};

const COL = {
  gained: "hidden @min-[400px]:table-cell",
  second: "hidden @min-[520px]:table-cell",
  time2: "hidden @min-[600px]:table-cell",
  pits: "hidden @min-[600px]:table-cell",
  sectors: "hidden @min-[835px]:table-cell",
  team: "hidden @min-[720px]:inline",
  age: "hidden @min-[380px]:inline",
};

const GAP_LABEL: Record<SessionKind, Record<GapMode, { short: string; long: string }>> = {
  race: { interval: { short: "Interval", long: "gap to the car ahead" }, leader: { short: "Leader", long: "gap to the leader" } },
  quali: { interval: { short: "Interval", long: "gap to the car ahead" }, leader: { short: "Gap", long: "gap to the fastest lap" } },
  practice: { interval: { short: "Interval", long: "gap to the car ahead" }, leader: { short: "Gap", long: "gap to the fastest lap" } },
};

export function TimingTower({ state, selected, onSelect, compact = false }: Props) {
  const { generation } = useStream();
  const { prefs, set } = usePrefs();
  const [fitRef, avail] = useFitHeight();
  const rows = useMemo(() => towerRows(state), [state]);
  const kind = sessionKind(state);
  const quali = qualiPart(state);
  const moves = usePositionMoves(rows, generation);
  const table = useRef<HTMLTableElement>(null);
  useRowGlide(table, rows, generation);
  const lap = state.LapCount?.CurrentLap;
  // Roving focus: one tab stop for the whole tower (the selected row), arrows move within it.
  const focusNum = rows.some((r) => r.num === selected) ? selected : rows[0]?.num;
  const main: GapMode = prefs.towerGap;
  const other: GapMode = main === "interval" ? "leader" : "interval";
  const race = kind === "race";

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
  const head = GAP_LABEL[kind];
  // In fit mode the rows share the tile's height (20 cars on one screen), never scrolling.
  const rowH = avail != null && rows.length ? Math.max(16, Math.min(36, Math.floor((avail - 2) / rows.length))) : null;
  return (
    <div ref={fitRef} className={`@container ${avail != null ? "h-full overflow-hidden" : "overflow-x-auto"}`}>
      {quali && <QualiBar q={quali} cars={rows.filter((r) => !r.knockedOut).length} />}
      <table ref={table} className="w-full border-collapse text-[0.9375rem] @max-[340px]:text-[0.875rem] @min-[400px]:text-body lg:text-row" onKeyDown={onKeyDown}>
        <caption className="sr-only">
          Timing tower{lap ? `, lap ${lap}` : ""}{quali ? `, ${quali.label}` : ""}. Select a driver to show their telemetry; up and down arrows
          move between drivers.
        </caption>
        <thead data-fit-reserve>
          <tr className="border-b border-line-strong text-left text-small font-semibold text-muted">
            <th scope="col" className="w-9 py-1 pr-1.5 text-right lg:w-10 lg:pr-2">
              Pos
            </th>
            <th scope="col" className="py-1 pl-1">
              Driver
            </th>
            <th scope="col" className={`py-0.5 pr-1 text-right ${W.interval}`}>
              <button
                type="button"
                onClick={() => set({ towerGap: other })}
                title={`Showing the ${head[main].long}. Switch to the ${head[other].long}.`}
                aria-label={`${head[main].short}: showing the ${head[main].long}. Switch to the ${head[other].long}`}
                className="-my-1 inline-flex min-h-7 items-center gap-1 rounded-chip px-1 text-muted underline decoration-line-control decoration-dotted underline-offset-4 transition-colors duration-150 hover:bg-raised hover:text-text"
              >
                {head[main].short}
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
                  <path d="M1 3h7M6 1l2 2-2 2M9 7H2M4 5L2 7l2 2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </th>
            {race && (
              <th scope="col" className={`py-1 pr-1 text-right ${W.gained} ${c(COL.gained)}`}>
                <abbr title="Places gained or lost since the start" className="no-underline">
                  ±
                </abbr>
              </th>
            )}
            <th scope="col" className={`py-1 pr-2 text-right ${W.gap} ${c(COL.second)}`}>
              {head[other].short}
            </th>
            <th scope="col" className={`py-1 pr-2 text-right ${W.time}`}>
              {race ? "Last lap" : "Best"}
            </th>
            <th scope="col" className={`py-1 pr-2 text-right ${W.time2} ${c(COL.time2)}`}>
              {race ? "Best" : "Last"}
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
            {race && (
              <th scope="col" className={`py-1 pr-1 text-right ${W.pits} ${c(COL.pits)}`}>
                <abbr title="Pit stops" className="no-underline">
                  Pits
                </abbr>
              </th>
            )}
          </tr>
        </thead>
        <tbody className={rowH != null ? "[&_*]:!leading-none" : ""}>
          {rows.map((r) => (
            <Row
              key={r.num}
              row={r}
              kind={kind}
              quali={quali}
              main={main}
              fav={isFavourite(prefs, r.code, r.team)}
              selected={r.num === selected}
              focusable={r.num === focusNum}
              move={moves[r.num] ?? 0}
              onSelect={onSelect}
              compact={compact}
              rowH={rowH}
            />
          ))}
        </tbody>
      </table>
      <Legend compact={compact} fit={avail != null} kind={kind} quali={quali} />
    </div>
  );
}

const Row = memo(function Row({
  row: r,
  kind,
  quali,
  main,
  fav,
  selected,
  focusable,
  move,
  onSelect,
  compact,
  rowH,
}: {
  row: TowerRow;
  kind: SessionKind;
  quali: QualiPart | null;
  main: GapMode;
  fav: boolean;
  selected: boolean;
  focusable: boolean;
  move: number;
  onSelect: (num: string) => void;
  compact: boolean;
  rowH: number | null;
}) {
  const dense = rowH != null && rowH < 28;
  const c = (cls: string) => (compact ? "hidden" : cls);
  const race = kind === "race";
  const out = r.retired || r.stopped;
  const dim = out || r.knockedOut;
  // A knocked-out car sitting in the garage is "out in Q1", not news about the pit lane.
  const chip = out ? (r.retired ? "DNF" : "STOP") : r.knockedOut ? null : r.inPit ? "PIT" : r.pitOut ? "OUT" : null;
  const qOut = quali && r.knockedOut ? `${quali.label.replace(/\d$/, "")}${knockedOutIn(r.position, quali)}` : null;
  const cut = quali?.cutoff != null && r.position === quali.cutoff;
  // Selection marker on the left, the qualifying cut line along the bottom.
  const shadows = [selected && "inset 3px 0 0 var(--color-select)", cut && "inset 0 -2px 0 var(--color-danger)"].filter(Boolean).join(", ");
  const style: CSSProperties = {
    ...(rowH != null ? { height: rowH } : {}),
    ...(shadows ? { boxShadow: shadows } : {}),
    // A favourite carries its team colour into the row, fading out behind the name.
    ...(fav && !dim ? { backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${r.teamColour} 24%, transparent), transparent 42%)` } : {}),
  };
  const time = race ? r.lastLap : r.bestLap;
  const time2 = race ? r.bestLap : r.lastLap;
  return (
    <tr
      data-row={r.num}
      style={style}
      onClick={() => onSelect(r.num)}
      className={`h-11 cursor-pointer border-b border-line transition-colors duration-150 lg:h-8 ${
        // Hover is lighter than selection so pointing at a row never reads as selecting it.
        selected ? "bg-raised" : "hover:bg-raised/50"
      } ${dim ? "text-muted" : ""}`}
    >
      <td className={`num w-9 pr-1.5 text-right align-middle lg:w-10 lg:pr-2 leading-none font-bold ${dense ? "text-body" : "text-title"} ${r.dropZone ? "text-danger" : ""}`}>
        <span className="inline-flex items-baseline justify-end gap-0.5">
          <PositionMove move={move} />
          {out ? <span className="text-small text-muted">—</span> : r.position}
          {r.dropZone && <span className="sr-only"> (in the drop zone)</span>}
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
          title={r.team ? `${r.name} · ${r.team}` : r.name}
          // Name starts with the visible text (code + chip) so voice control can target it.
          aria-label={`${r.code}${chip ? ` ${chip}` : ""}${qOut ? `, out in ${qOut}` : ""}, ${r.name}, ${r.team}${fav ? ", favourite" : ""}${r.fastestLap && race ? ", fastest lap" : ""}, ${out ? (r.retired ? "retired" : "stopped") : `P${r.position}`}`}
          className={`flex min-w-0 items-center gap-1.5 rounded-chip pr-0 text-left lg:gap-2 lg:pr-1 ${rowH != null ? "h-full min-h-0" : "min-h-11 lg:min-h-8"}`}
        >
          <TeamBar colour={r.teamColour} className={dense ? "!h-4" : undefined} />
          <span className="font-semibold tracking-wide">{r.code}</span>
          {fav && (
            <span aria-hidden="true" className="-ml-0.5 text-[0.75rem] leading-none text-text">
              ★
            </span>
          )}
          {/* One status chip, most important first, so the driver column stays narrow. */}
          {chip ? (
            <Chip tone={out ? "danger" : r.inPit ? "warn" : "muted"} title={chip === "OUT" ? "Out lap" : undefined}>
              {chip}
            </Chip>
          ) : qOut ? (
            <Chip tone="muted" title={`Knocked out in ${qOut}`}>
              {qOut}
            </Chip>
          ) : r.fastestLap && race ? (
            <span title="Fastest lap" className="inline-flex items-center gap-0.5 rounded-chip border border-sector-purple px-1 text-micro font-bold leading-4 text-sector-purple">
              <span aria-hidden="true" className="text-[0.625rem]">
                <Diamond />
              </span>
              FL
            </span>
          ) : null}
          {r.team && <span className={`min-w-0 truncate text-small text-faint ${compact ? "hidden" : COL.team}`}>{r.team}</span>}
        </button>
      </th>
      <td className="num pr-2 text-right">
        <GapCell row={r} mode={main} kind={kind} />
      </td>
      {race && (
        <td className={`num pr-1 text-right text-small ${c(COL.gained)}`}>
          <Gained row={r} />
        </td>
      )}
      <td className={`num pr-2 text-right ${c(COL.second)}`}>
        <GapCell row={r} mode={main === "interval" ? "leader" : "interval"} kind={kind} quiet />
      </td>
      <td className="pr-2 text-right">
        {dim ? (
          // A retired or knocked-out car's time is history: no colour, row colour (muted).
          <StaleTime value={time.value} />
        ) : (
          <Flash value={time.value}>
            {/* Yellow on ~19 of 20 last laps carries no signal: only purple/green are marked. */}
            <MarkedTime value={time.value} mark={time.mark === "yellow" ? "none" : time.mark} />
          </Flash>
        )}
      </td>
      <td className={`pr-2 text-right ${c(COL.time2)}`}>
        {dim && time2.mark !== "purple" ? (
          <StaleTime value={time2.value} />
        ) : (
          <MarkedTime value={time2.value} mark={time2.mark === "yellow" ? "none" : time2.mark} />
        )}
      </td>
      {r.sectors.map((s, i) => (
        <td key={i} className={`pr-2 text-right text-body ${c(COL.sectors)}`}>
          {dim ? <StaleTime value={s.value} /> : <MarkedTime value={s.value} mark={s.mark} sector />}
        </td>
      ))}
      <td className="pr-2 @min-[560px]:pl-2">
        <span className="flex items-center gap-1.5">
          <TyreBadge compound={r.compound} size={dense ? 16 : 24} />
          <span className={`num text-small text-muted ${compact ? "" : COL.age}`}>
            {r.tyreAge ?? "—"}
            <span className="sr-only"> laps old</span>
          </span>
        </span>
      </td>
      {race && <td className={`num pr-1 text-right text-muted ${c(COL.pits)}`}>{r.pits}</td>}
    </tr>
  );
});

/** Interval to the car ahead, or gap to the leader (the fastest lap away from a race). */
function GapCell({ row: r, mode, kind, quiet = false }: { row: TowerRow; mode: GapMode; kind: SessionKind; quiet?: boolean }) {
  const race = kind === "race";
  if (r.retired || r.stopped) return <span className="text-faint">—</span>;
  const g = mode === "interval" ? r.interval : r.gap;
  if (r.position === 1 || g.leader) {
    return <span className="text-muted">{race ? (mode === "leader" ? leaderLap(r) : "Leader") : "Fastest"}</span>;
  }
  const text = formatGap(g);
  if (text === "—") return <span className="text-faint">—</span>;
  if (mode === "interval" && r.battle && !quiet) {
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
  return <span className={quiet ? "text-muted" : undefined}>{text}</span>;
}

/** Places gained (green ▲) or lost (red ▼) since the start. */
function Gained({ row: r }: { row: TowerRow }) {
  if (r.gained == null || r.retired || r.stopped) return <span className="text-faint">—</span>;
  if (r.gained === 0) {
    return (
      <span className="text-faint" title={`Started P${r.grid}`}>
        =<span className="sr-only"> same as the start</span>
      </span>
    );
  }
  const up = r.gained > 0;
  return (
    <span className={`font-semibold ${up ? "text-ok" : "text-danger"}`} title={`Started P${r.grid}`}>
      <span aria-hidden="true" className="text-[0.625rem]">
        {up ? "▲" : "▼"}
      </span>
      {Math.abs(r.gained)}
      <span className="sr-only"> {up ? "gained" : "lost"} since the start</span>
    </span>
  );
}

function QualiBar({ q, cars }: { q: QualiPart; cars: number }) {
  const through = q.cutoff;
  return (
    <p data-fit-reserve className="flex flex-wrap items-baseline gap-x-3 px-1 pb-1 text-small">
      <span className="rounded-chip bg-raised px-2 font-bold text-text">{q.label}</span>
      <span className="text-muted">
        {cars} cars{through != null ? ` · top ${through} go through` : " · fight for pole"}
      </span>
    </p>
  );
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

function Legend({ compact, fit, kind, quali }: { compact: boolean; fit: boolean; kind: SessionKind; quali: QualiPart | null }) {
  return (
    <p data-fit-reserve className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-small text-muted ${fit ? "!mt-1 !flex-nowrap overflow-hidden whitespace-nowrap !text-micro" : ""}`}>
      <span>
        <span className="text-sector-purple">
          <Diamond /> purple
        </span>{" "}
        fastest
      </span>
      <span>
        <span className="text-sector-green">▲ green</span> personal best
      </span>
      {/* Yellow only appears in the sector columns (last laps stay plain), so the key follows them. */}
      <span className={compact ? "hidden" : "hidden @min-[790px]:inline"}>
        <span className="text-sector-yellow">yellow</span> slower sector
      </span>
      {quali?.cutoff != null && (
        <span>
          <span className="text-danger">▬</span> drop zone
        </span>
      )}
      {kind === "race" && (
        <span className={fit ? "hidden" : undefined}>
          <span className="text-warn">⇢</span> within 1 s of car ahead
        </span>
      )}
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
