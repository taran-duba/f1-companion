"use client";

import { useSourceSwitch, InlineError } from "@/components/replay/sourceUi";
import { RecorderSection } from "@/components/settings/RecorderSection";
import type { ServerStatus } from "@/lib/types";
import { F1TvAccount } from "./F1TvAccount";

const BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-chip bg-accent px-4 text-body font-semibold text-bg transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

/** Live timing: switch to it, sign in to F1 TV for telemetry, optionally record. */
export function LiveTab({ status }: { status: ServerStatus | null }) {
  const { pending, error, run } = useSourceSwitch();
  const live = status?.source.kind === "live";

  return (
    <div className="grid gap-4">
      <section aria-labelledby="live-title" className="rounded-panel border border-line-strong bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h3 id="live-title" className="text-body font-semibold text-text">
            Live timing
          </h3>
          {live ? (
            <span className="inline-flex items-center gap-1.5 text-small font-semibold text-ok">
              <span aria-hidden="true" className="size-2 rounded-full bg-ok" />
              In use
            </span>
          ) : (
            <button type="button" className={BTN_PRIMARY} disabled={pending !== null} onClick={() => void run("live", { kind: "live" })}>
              {pending === "live" ? "Connecting…" : "Switch to live"}
            </button>
          )}
        </div>
        <p className="mt-1 max-w-[65ch] text-small text-muted">
          F1&apos;s real live feed. Timing, tyres and race control start as soon as a session is on track; if nothing is running
          the tower stays empty until it starts.
        </p>
        {error?.key === "live" && <InlineError>{error.message}</InlineError>}
      </section>

      <F1TvAccount status={status} />

      <details className="rounded-panel border border-line-strong bg-surface">
        <summary className="flex min-h-11 items-center px-4 text-body font-semibold text-text">Record live sessions</summary>
        <div className="border-t border-line px-4 py-3">
          <RecorderSection status={status} />
        </div>
      </details>
    </div>
  );
}
