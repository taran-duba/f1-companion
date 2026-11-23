"use client";

import { drsLabel, formatGap, towerRows } from "@/lib/timing";
import type { TimingState } from "@/lib/types";
import { TeamBar, TyreBadge } from "./timing/Atoms";

/**
 * Phone-only bar pinned to the bottom (thumb zone) showing the selected
 * driver at a glance, so tapping a tower row gives visible feedback even
 * when the telemetry tab is far below.
 */
export function SelectedDriverBar({ state, selected, onOpen }: { state: TimingState; selected: string | null; onOpen: () => void }) {
  const row = selected ? towerRows(state).find((r) => r.num === selected) : undefined;
  if (!row) return null;
  const car = state.CarData?.Cars?.[row.num];
  const drs = car ? drsLabel(car.drs) : null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line-strong bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={onOpen}
        className="mx-auto flex min-h-14 w-full max-w-[1600px] items-center gap-3 px-4 text-left"
        aria-label={`${row.code} selected, P${row.position}. Show telemetry`}
      >
        <span className="num w-8 text-right text-title font-bold">{row.retired ? "—" : row.position}</span>
        <TeamBar colour={row.teamColour} />
        <span className="font-semibold">{row.code}</span>
        <TyreBadge compound={row.compound} size={22} />
        <span className="num text-small text-muted">{formatGap(row.interval, { leaderLabel: "Leader" })}</span>
        {car ? (
          <span className="num ml-auto flex items-baseline gap-3">
            <span className="text-title font-bold">
              {car.speed}
              <span className="ml-0.5 text-micro font-semibold text-muted">km/h</span>
            </span>
            <span className="text-title font-bold">
              {car.gear === 0 ? "N" : car.gear}
              <span className="sr-only"> gear</span>
            </span>
            {drs?.state === "open" && <span className="rounded-chip bg-ok px-1.5 text-micro font-bold text-bg">DRS</span>}
          </span>
        ) : (
          <span className="ml-auto text-small text-accent underline underline-offset-4">Telemetry</span>
        )}
      </button>
    </div>
  );
}
