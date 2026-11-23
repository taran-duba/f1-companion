"use client";

import { useMemo } from "react";
import { Chip, TeamBar, TyreBadge } from "@/components/timing/Atoms";
import { EmptyState } from "@/components/Panel";
import { inLane, pitRows } from "@/lib/pits";
import type { TimingState } from "@/lib/types";

/**
 * Pit stops for the whole field: who is in the lane now, then one row per car with its stop
 * count, the laps it stopped on and an estimate of time lost on the latest stop.
 */
export function PitStops({ state, selected, onSelect }: { state: TimingState; selected: string | null; onSelect: (num: string) => void }) {
  const rows = useMemo(() => pitRows(state), [state]);
  const lane = inLane(rows);
  const total = rows.reduce((n, r) => n + r.stops.length, 0);

  if (!rows.length) return <EmptyState>No cars yet. Pit stops appear once the session starts.</EmptyState>;

  return (
    <div className="@container flex flex-col gap-3">
      <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 text-small" aria-live="polite">
        <span className="font-semibold text-muted">In the lane</span>
        {lane.length ? (
          lane.map((r) => (
            <span key={r.num} className="inline-flex items-center gap-1.5 rounded-chip border border-accent px-2 py-0.5 font-semibold text-text">
              <TeamBar colour={r.teamColour} className="h-4" />
              {r.code}
            </span>
          ))
        ) : (
          <span className="text-faint">Nobody right now</span>
        )}
        <span className="num ml-auto text-faint">{total} {total === 1 ? "stop" : "stops"} so far</span>
      </div>

      <table className="w-full border-collapse text-body">
        <caption className="sr-only">Pit stops by driver in running order. Select a row to follow that driver.</caption>
        <thead>
          <tr className="border-b border-line-strong text-left text-small font-semibold text-muted">
            <th scope="col" className="w-9 py-1 pr-1.5 text-right">Pos</th>
            <th scope="col" className="py-1 pl-1">Driver</th>
            <th scope="col" className="w-12 py-1 text-right">Stops</th>
            <th scope="col" className="hidden py-1 pl-4 @min-[420px]:table-cell">Stopped on lap</th>
            <th scope="col" className="w-20 py-1 text-right @min-[300px]:w-24">Tyre</th>
            <th scope="col" className="hidden w-24 py-1 text-right @min-[560px]:table-cell">
              <abbr title="Estimated from the in-lap and out-lap against the driver's usual pace. Not a pit-lane clock, and inflated under a safety car." className="no-underline">
                Time lost
              </abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, stops }) => {
            const last = stops.at(-1);
            const on = row.num === selected;
            return (
              <tr key={row.num} className={`border-b border-line ${row.inPit ? "bg-accent/10" : on ? "bg-raised" : ""}`}>
                <td className="num py-1 pr-1.5 text-right text-muted">{row.position}</td>
                <td className="py-0 pl-1">
                  <button
                    type="button"
                    onClick={() => onSelect(row.num)}
                    aria-pressed={on}
                    className="flex min-h-9 w-full items-center gap-2 rounded-chip text-left font-semibold hover:text-accent"
                  >
                    <TeamBar colour={row.teamColour} className="h-5" />
                    {row.code}
                    {row.inPit && <Chip tone="accent">PIT</Chip>}
                    {row.retired && <Chip tone="danger">DNF</Chip>}
                  </button>
                </td>
                <td className={`num py-1 text-right font-semibold ${stops.length ? "text-text" : "text-faint"}`}>{stops.length || "—"}</td>
                <td className="num hidden py-1 pl-4 text-muted @min-[420px]:table-cell">
                  {stops.length ? stops.map((s) => `L${s.lap}`).join(", ") : <span className="text-faint">—</span>}
                </td>
                <td className="py-1 text-right">
                  <span className="inline-flex items-center justify-end gap-1.5">
                    <TyreBadge compound={row.compound} size={22} />
                    <span className="num w-8 text-left text-small text-muted">{row.tyreAge != null ? `${row.tyreAge}L` : ""}</span>
                  </span>
                </td>
                <td className="num hidden py-1 text-right text-muted @min-[560px]:table-cell">
                  {last?.lossS != null ? `≈ ${last.lossS.toFixed(1)} s` : <span className="text-faint">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
