"use client";

import { useEffect, useState } from "react";
import { api, type TracesResponse } from "@/lib/api";
import { useStream } from "@/lib/store";
import type { TimingState } from "@/lib/types";

export type TracesResult =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: TracesResponse; error: null }
  | { status: "error"; data: TracesResponse | null; error: string };

/**
 * Fetch /api/traces/{num}. Re-fetches when the driver completes a lap
 * (`laps` changes) or the backend switches source (`generation`).
 */
export function useTraces(num: string, laps: number): TracesResult {
  const { generation } = useStream();
  const [result, setResult] = useState<{ key: string; value: TracesResult } | null>(null);
  const key = `${num}:${laps}:${generation}`;

  useEffect(() => {
    let cancelled = false;
    api
      .get<TracesResponse>(`/api/traces/${encodeURIComponent(num)}`)
      .then((data) => {
        if (!cancelled) setResult({ key, value: { status: "ready", data, error: null } });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Couldn't load traces.";
        setResult((prev) => ({ key, value: { status: "error", data: prev?.value.data ?? null, error: message } }));
      });
    return () => {
      cancelled = true;
    };
  }, [num, key]);

  // While a newer lap loads, keep showing the previous result (no flash to empty).
  // A different driver never shows the previous driver's traces.
  if (!result || !result.key.startsWith(`${num}:`)) return { status: "loading", data: null, error: null };
  return result.value;
}

/** Live mode without an F1 TV token carries no car telemetry (docs/DECISIONS.md D1). */
export function useTelemetryMissing(state: TimingState | null): boolean {
  const { status } = useStream();
  return status?.source.kind === "live" && state?.Feed?.telemetry === false;
}
