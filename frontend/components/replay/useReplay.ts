"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useStream } from "@/lib/store";
import type { ServerStatus, SourceStatus } from "@/lib/types";

export type ReplayAction = "play" | "pause" | "toggle" | "seek" | "speed";

function message(err: unknown): string {
  if (err instanceof ApiError || err instanceof Error) return err.message;
  return "Request failed";
}

/**
 * The active source status plus replay controls.
 *
 * A POST response is authoritative until the next status event arrives over
 * SSE, so the UI reflects play/pause/seek immediately instead of a second later.
 */
export function useReplay() {
  const { status } = useStream();
  const sse = status?.source ?? null;
  const [override, setOverride] = useState<{ source: SourceStatus; after: SourceStatus | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const source = override && override.after === sse ? override.source : sse;

  const send = useCallback(
    async (action: ReplayAction, value?: number): Promise<boolean> => {
      try {
        const res = await api.post<ServerStatus>("/api/replay", value === undefined ? { action } : { action, value });
        setOverride({ source: res.source, after: sse });
        setError(null);
        return true;
      } catch (err) {
        setError(message(err));
        return false;
      }
    },
    [sse],
  );

  return { source, server: status, send, error };
}

/**
 * Replay position interpolated between status updates (~1/s) so the clock
 * moves smoothly: position + elapsed wall time × speed while playing.
 * Bump `epoch` on every user seek so a small backwards seek isn't mistaken
 * for network jitter.
 */
export function usePlaybackClock(source: SourceStatus | null, epoch = 0): number {
  const position = typeof source?.position === "number" ? source.position : 0;
  const end = typeof source?.end === "number" ? source.end : position;
  const speed = typeof source?.speed === "number" ? source.speed : 1;
  const playing = source?.state === "playing";
  const [tick, setTick] = useState<{ base: number; value: number; epoch: number } | null>(null);
  const last = useRef<{ value: number; epoch: number } | null>(null);
  const jitter = Math.max(1, speed * 0.6);

  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    const startWall = performance.now();
    const id = window.setInterval(() => {
      let v = Math.min(end, position + ((performance.now() - startWall) / 1000) * speed);
      // A fresh status can land slightly behind what we already showed;
      // hold rather than tick backwards.
      const prev = last.current;
      if (prev && prev.epoch === epoch && v < prev.value && prev.value - v < jitter) v = prev.value;
      last.current = { value: v, epoch };
      setTick({ base: position, value: v, epoch });
    }, 250);
    return () => window.clearInterval(id);
  }, [playing, position, speed, end, epoch, jitter]);

  if (!playing || !tick || tick.epoch !== epoch) return position;
  if (tick.base === position) return tick.value;
  // New status arrived; until the next tick keep the (slightly ahead) value.
  return tick.value > position && tick.value - position < jitter ? tick.value : position;
}
