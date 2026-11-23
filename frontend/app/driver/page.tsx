"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { StrategyChart } from "@/components/charts/StrategyChart";
import { DriverCard, DriverRow } from "@/components/driver/DriverCard";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState, Panel } from "@/components/Panel";
import { useStream } from "@/lib/store";
import { towerRows } from "@/lib/timing";

export default function DriversPage() {
  const { state } = useStream();
  const router = useRouter();
  const rows = useMemo(() => (state ? towerRows(state) : []), [state]);

  if (!state) return <LoadingState />;

  const codeOf = (num: string) => state.DriverList?.[num]?.Tla ?? num;
  const hrefFor = (num: string) => `/driver/${encodeURIComponent(codeOf(num))}`;
  const lap = state.LapCount?.CurrentLap;
  const total = state.LapCount?.TotalLaps;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
        <h1 className="text-headline font-bold">Drivers</h1>
        {lap ? (
          <p className="num text-small text-muted">
            Lap {lap}
            {total ? ` of ${total}` : ""}
          </p>
        ) : null}
      </div>

      {/* Strategy first: it's the one view of the whole field's tyres that no other page has. */}
      <Panel id="strategy" title="Tyre strategy">
        {/* relative + overflow-hidden contains the chart's screen-reader table, which is wider than a phone. */}
        <div className="relative overflow-hidden">
          {/* Rows are links to each driver's page; a plain click navigates client-side. */}
          <StrategyChart state={state} hrefFor={hrefFor} onSelect={(num) => router.push(hrefFor(num))} />
        </div>
      </Panel>

      <section aria-labelledby="race-order-title" className="flex flex-col gap-3">
        <h2 id="race-order-title" className="text-body font-semibold text-text">
          Race order
        </h2>
        {rows.length ? (
          <>
            {/* Phone: one compact row per driver. */}
            <ul className="divide-y divide-line rounded-panel border border-line-strong bg-surface min-[640px]:hidden [&>li:first-child>a]:rounded-t-panel [&>li:last-child>a]:rounded-b-panel">
              {rows.map((row) => (
                <li key={row.num} className="min-w-0">
                  <DriverRow row={row} />
                </li>
              ))}
            </ul>
            {/* Wider: summary cards with last lap and team. */}
            <ul className="hidden grid-cols-2 gap-3 min-[640px]:grid lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((row) => (
                <li key={row.num} className="min-w-0">
                  <DriverCard row={row} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState>
            No drivers yet. The timing feed hasn&apos;t listed any cars for this session. Pick a source on the Replay or
            Settings page, or wait for the session to start.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
