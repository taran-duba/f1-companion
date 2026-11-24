"use client";

import { useEffect, useRef, useState } from "react";
import { api, type TelemetryWindow } from "@/lib/api";
import { anchorWindow, appendSample, BUFFER_MS, fromWindow, mergeBackfill, parseUtc, toSample, type TelSample } from "@/lib/telemetry";
import { useStream } from "@/lib/store";
import type { TimingState } from "@/lib/types";

export interface TelemetryBuffer {
  samples: TelSample[];
  /** The first backfill request finished (successfully or not). */
  backfilled: boolean;
  error: string | null;
}

/** Wall-clock interval between history resyncs while new data is arriving. */
const RESYNC_MS = 2_000;
/** Extra seconds fetched on a resync so it overlaps what we already hold. */
const RESYNC_OVERLAP_S = 5;

/**
 * Rolling 60 s buffer for one car. Backfills from /api/telemetry on mount, then
 * appends each new CarData sample (deduped by CarData.Utc). The stream only
 * carries the newest sample per push (about 1 s of feed time apart at 5x), so
 * while new data keeps arriving the recent history is refetched every couple
 * of seconds to fill in the full-rate samples. Nothing is fetched while the
 * feed is paused. Mount it with a key of driver + stream generation so a new
 * selection or snapshot starts clean.
 */
export function useTelemetryBuffer(state: TimingState, num: string): TelemetryBuffer {
  const utc = state.CarData?.Utc ?? null;
  const car = state.CarData?.Cars?.[num];

  const [samples, setSamples] = useState<TelSample[]>(() => {
    const s = toSample(car, parseUtc(utc));
    return s ? [s] : [];
  });
  const [seenUtc, setSeenUtc] = useState<string | null>(utc);
  const [backfilled, setBackfilled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Append the newest sample when CarData.Utc moves (adjust-state-on-prop-change pattern).
  if (utc !== seenUtc) {
    setSeenUtc(utc);
    const s = toSample(car, parseUtc(utc));
    if (s) setSamples((b) => appendSample(b, s, BUFFER_MS));
  }

  const utcRef = useRef(utc);
  const { delayMs } = useStream();
  const delayRef = useRef(delayMs);
  useEffect(() => {
    utcRef.current = utc;
    delayRef.current = delayMs;
  }, [utc, delayMs]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let first = true;
    let syncedUtc: string | null = null;

    const sync = () => {
      const at = utcRef.current;
      if (inFlight || (!first && at === syncedUtc)) return;
      const since = parseUtc(syncedUtc);
      const now = parseUtc(at);
      // With a TV delay the server is `delay` ahead of this page: fetch that much more and
      // keep nothing newer than what the page shows.
      const delayS = Math.ceil(delayRef.current / 1000);
      const secs =
        (first || since == null || now == null
          ? BUFFER_MS / 1000
          : Math.min(BUFFER_MS / 1000, Math.ceil((now - since) / 1000) + RESYNC_OVERLAP_S)) + delayS;
      const initial = first;
      first = false;
      inFlight = true;
      api
        .get<TelemetryWindow>(`/api/telemetry/${encodeURIComponent(num)}?window=${secs}`)
        .then((win) => {
          if (cancelled) return;
          syncedUtc = at;
          const newest = parseUtc(utcRef.current);
          const fallback = newest == null ? null : newest + delayS * 1000;
          setSamples((buf) => {
            const anchor = anchorWindow(win, buf, fallback, 10 + delayS);
            if (anchor == null) return buf;
            let history = fromWindow(win, anchor);
            const shown = buf[buf.length - 1]?.t ?? newest;
            if (delayS > 0 && shown != null) history = history.filter((s) => s.t <= shown);
            return mergeBackfill(history, buf, BUFFER_MS);
          });
          setError(null);
          if (initial) setBackfilled(true);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          // Retry only once new data shows the backend is alive again.
          syncedUtc = at;
          if (initial) {
            setError(e instanceof Error ? e.message : "request failed");
            setBackfilled(true);
          }
        })
        .finally(() => {
          inFlight = false;
        });
    };

    sync();
    const id = setInterval(sync, RESYNC_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [num]);

  return { samples, backfilled, error };
}
