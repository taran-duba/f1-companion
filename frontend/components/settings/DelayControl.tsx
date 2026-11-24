"use client";

import { useId } from "react";
import { MAX_DELAY_SEC, usePrefs } from "@/lib/prefs";
import { useStream } from "@/lib/store";

const STEP =
  "num inline-flex min-h-11 min-w-12 items-center justify-center rounded-chip border border-line-control px-2 text-small font-semibold text-text transition-colors duration-150 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Hold live timing back so it matches a delayed broadcast: the tower, flags, race control,
 * radio and alerts all wait, so nothing spoils what is about to happen on TV.
 */
export function DelayControl({ compact = false }: { compact?: boolean }) {
  const { prefs, set } = usePrefs();
  const { status, pendingUntil } = useStream();
  const id = useId();
  const d = prefs.delaySec;
  const to = (v: number) => set({ delaySec: Math.round(Math.min(MAX_DELAY_SEC, Math.max(0, v))) });
  const live = status?.source.kind === "live";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={STEP} onClick={() => to(d - 5)} disabled={d <= 0} aria-label="5 seconds less">
          −5
        </button>
        <button type="button" className={STEP} onClick={() => to(d - 1)} disabled={d <= 0} aria-label="1 second less">
          −1
        </button>
        <label htmlFor={id} className="sr-only">
          TV delay in seconds
        </label>
        <span className="flex items-baseline gap-1">
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_DELAY_SEC}
            value={d}
            onChange={(e) => to(Number(e.target.value))}
            className="num h-11 w-20 rounded-chip border border-line-control bg-bg px-2 text-center text-title font-bold text-text"
          />
          <span className="text-small text-muted">s</span>
        </span>
        <button type="button" className={STEP} onClick={() => to(d + 1)} disabled={d >= MAX_DELAY_SEC} aria-label="1 second more">
          +1
        </button>
        <button type="button" className={STEP} onClick={() => to(d + 5)} disabled={d >= MAX_DELAY_SEC} aria-label="5 seconds more">
          +5
        </button>
        {d > 0 && (
          <button type="button" className={`${STEP} px-3`} onClick={() => to(0)}>
            No delay
          </button>
        )}
      </div>
      <p className="max-w-[60ch] text-small text-muted" role="status">
        {!live
          ? d > 0
            ? `Set to ${d} s. It applies when the source is live timing; replays are already in your hands.`
            : "Applies to live timing. Replays are already in your hands."
          : pendingUntil
            ? "Holding the feed back to match your TV…"
            : d > 0
              ? `Live timing is ${d} s behind real time.`
              : "Live timing is real time, usually ahead of a TV broadcast."}
      </p>
      {!compact && (
        <p className="max-w-[60ch] text-small text-faint">
          How to match it: watch the leader cross the line on TV, then nudge until the lap counter here ticks over at the same moment. Streaming
          services are often 30 to 60 s behind; satellite and cable less.
        </p>
      )}
    </div>
  );
}
