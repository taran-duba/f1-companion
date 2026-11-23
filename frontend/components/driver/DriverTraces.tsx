"use client";

import { useMemo } from "react";
import { EmptyState } from "@/components/Panel";
import { lapHistory } from "@/lib/timing";
import type { TimingState } from "@/lib/types";
import { bestsOf, tracePoints } from "./model";
import { TraceChart, type TraceSeries } from "./TraceChart";
import { useTelemetryMissing, useTraces } from "./useTraces";

const MIN_POINTS = 20;
const MIN_COVERAGE = 0.85;

export const NO_TOKEN_MESSAGE = "Car telemetry needs an F1 TV token in live mode. Timing still works.";

/** Last lap vs best lap telemetry traces for one driver. */
export function DriverTraces({ state, num }: { state: TimingState; num: string }) {
  const laps = state.TimingData?.Lines?.[num]?.NumberOfLaps ?? 0;
  const missing = useTelemetryMissing(state);
  const result = useTraces(num, laps);
  const bestMs = bestsOf(lapHistory(state, num)).ms;

  const { series, note } = useMemo(() => {
    const data = result.data;
    const out: TraceSeries[] = [];
    if (!data) return { series: out, note: undefined };
    const same = data.last && data.best && data.last.lap === data.best.lap;
    for (const id of ["last", "best"] as const) {
      const t = data[id];
      if (!t || (id === "best" && same)) continue;
      const points = tracePoints(data.columns ?? [], t.points);
      if (points.length < 2) continue;
      // The backend keeps the fastest lap it has telemetry for, which may not be
      // the driver's best lap (e.g. after seeking into a replay).
      const label = id === "last" ? "Last lap" : t.ms != null && t.ms === bestMs ? "Best lap" : "Fastest traced lap";
      out.push({ id, label, lap: t.lap, ms: t.ms, points });
    }
    // A lap recorded from mid-lap (source switch or replay seek) covers only part
    // of the track: overlaying it would look like a missing line, so leave it out.
    const span = (s: TraceSeries) => s.points[s.points.length - 1].dist - s.points[0].dist;
    const longest = Math.max(0, ...out.map(span));
    const complete = out.filter((s) => s.points.length >= MIN_POINTS && span(s) >= longest * MIN_COVERAGE);
    const partial = out.filter((s) => !complete.includes(s));
    let note: string | undefined;
    if (partial.length && complete.length) {
      note = `Lap ${partial.map((s) => s.lap).join(", ")} has telemetry for only part of the lap (recording started mid-lap), so it isn't compared. A comparison appears after the next full lap.`;
    } else if (same) {
      note = "The last lap is also the fastest lap with telemetry so far. A comparison appears after the next lap.";
    }
    return { series: complete.length ? complete : out, note };
  }, [result.data, bestMs]);

  if (missing) return <EmptyState>{NO_TOKEN_MESSAGE}</EmptyState>;
  if (result.status === "loading") {
    return <div className="h-60 rounded-chip bg-raised" aria-busy="true" aria-label="Loading traces" />;
  }
  if (result.status === "error" && !series.length) {
    return <EmptyState>Couldn&apos;t load traces: {/[.!?]$/.test(result.error) ? result.error : `${result.error}.`} They reload when the driver completes the next lap.</EmptyState>;
  }
  if (!series.length) {
    return (
      <EmptyState>
        Traces appear after the driver completes a lap. This panel updates on its own at the end of each lap.
      </EmptyState>
    );
  }
  return <TraceChart series={series} note={note} />;
}
