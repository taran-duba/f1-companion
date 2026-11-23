"use client";

import { StatusGlyph, TONE_CLASS, useConnectionView } from "@/components/ConnectionPill";
import { useTimingStream } from "@/lib/store";
import { useUi } from "@/lib/ui";

/**
 * The one control for "where is this data from, and is it working?". Opens the source
 * panel. The state word is a live region; the reconnect countdown stays out of it.
 */
export function SourceChip() {
  const { tone, label, detail, pulsing, replay, connection } = useConnectionView();
  const { sourcesOpen, openSources, closeSources } = useUi();
  const stream = useTimingStream();
  return (
    <div className="flex items-center gap-1">
      {connection === "reconnecting" && (
        <button
          type="button"
          onClick={() => stream?.reconnectNow()}
          className="min-h-11 rounded-chip px-2 text-small font-semibold text-accent underline underline-offset-4 hover:bg-raised"
        >
          Retry now
        </button>
      )}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={sourcesOpen}
        onClick={() => (sourcesOpen ? closeSources() : openSources())}
        className={`group flex min-h-11 items-center gap-2 rounded-chip border px-3 text-small font-semibold transition-colors duration-150 hover:bg-raised ${
          sourcesOpen ? "bg-raised" : ""
        } ${TONE_CLASS[tone]}`}
      >
        <StatusGlyph tone={tone} pulsing={pulsing} replay={replay} />
        <span>
          <span className="sr-only">Source: </span>
          <span role="status" aria-live="polite">
            {label}
          </span>
          {detail && <span className="ml-1 font-normal text-muted num">{detail}</span>}
        </span>
        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className="text-muted transition-transform duration-150 group-aria-expanded:rotate-180">
          <path d="M1.5 3.5L5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="sr-only">Change source</span>
      </button>
    </div>
  );
}
