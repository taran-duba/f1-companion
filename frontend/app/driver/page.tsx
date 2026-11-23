"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { StrategyChart } from "@/components/charts/StrategyChart";
import { DriverCard } from "@/components/driver/DriverCard";
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
  const lap = state.LapCount?.CurrentLap;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
        <h1 className="text-headline font-bold">Drivers</h1>
        {rows.length > 0 && (
          <p className="text-small text-muted">
            In race order{lap ? <span className="num">, lap {lap}</span> : null}
          </p>
        )}
      </div>

      {rows.length ? (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((row) => (
            <li key={row.num} className="min-w-0">
              <DriverCard row={row} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>
          No drivers yet. The timing feed hasn&apos;t listed any cars for this session. Pick a source on the Replay or Settings
          page, or wait for the session to start.
        </EmptyState>
      )}

      <Panel id="strategy" title="Tyre strategy">
        {/* relative + overflow-hidden contains the chart's screen-reader table, which is wider than a phone. */}
        <div className="relative overflow-hidden">
          <StrategyChart state={state} onSelect={(num) => router.push(`/driver/${encodeURIComponent(codeOf(num))}`)} />
        </div>
      </Panel>
    </div>
  );
}
