"use client";

import type { ReactNode } from "react";
import { isAbnormal } from "@/components/FlagBand";
import { TeamBar } from "@/components/timing/Atoms";
import { sessionTitle, towerRows, trackStatus, weather } from "@/lib/timing";
import type { TimingState } from "@/lib/types";

// Green is the normal state: outline only, so the filled pills stand out.
const TONE_PILL: Record<string, string> = {
  green: "border border-flag-green text-flag-green",
  yellow: "bg-flag-yellow text-bg",
  sc: "bg-flag-yellow text-bg",
  vsc: "bg-flag-yellow text-bg",
  red: "bg-flag-red text-bg",
  chequered: "bg-text text-bg",
  unknown: "border border-line-control text-muted",
};

// Tint plus a left edge stripe while the track is not green.
const TONE_FRAME: Record<string, string> = {
  yellow: "bg-flag-yellow/10 shadow-[inset_6px_0_0_var(--color-flag-yellow)]",
  sc: "bg-flag-yellow/10 shadow-[inset_6px_0_0_var(--color-flag-yellow)]",
  vsc: "bg-flag-yellow/10 shadow-[inset_6px_0_0_var(--color-flag-yellow)]",
  red: "bg-flag-red/10 shadow-[inset_6px_0_0_var(--color-flag-red)]",
  chequered: "bg-raised shadow-[inset_6px_0_0_var(--color-text)]",
};

const SESSION_STATUS: Record<string, string> = {
  Inactive: "Not started",
  Started: "Running",
  Aborted: "Suspended",
  Finished: "Finished",
  Finalised: "Final",
  Ends: "Finished",
};

/**
 * One row of session context: what's on, lap, track status, weather. `actions` sits at the
 * right (the workspace puts its driver picker and Edit button there).
 */
export function SessionStrip({ state, actions }: { state: TimingState; actions?: ReactNode }) {
  const { meeting, session } = sessionTitle(state);
  const ts = trackStatus(state);
  const w = weather(state);
  const lap = state.LapCount;
  const status = state.SessionStatus?.Status;
  const remaining = state.ExtrapolatedClock?.Remaining;
  const loud = isAbnormal(ts.tone);
  const podium = ts.tone === "chequered" ? towerRows(state).filter((r) => !r.retired).slice(0, 3) : [];

  return (
    <section
      aria-label="Session"
      className={`-mx-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line px-3 py-1.5 lg:-mx-4 lg:px-4 ${loud ? (TONE_FRAME[ts.tone] ?? "") : ""}`}
    >
      <div className="min-w-0 max-w-full">
        <h1 className="truncate text-body font-bold leading-tight">{meeting}</h1>
        <p className="truncate text-small leading-tight text-muted">
          {session || "Session"}
          {status && <span className="ml-2 text-text">{SESSION_STATUS[status] ?? status}</span>}
        </p>
      </div>

      <dl className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Cell label="Lap">
          {lap?.CurrentLap != null ? (
            <span className="num text-title font-bold leading-none">
              {lap.CurrentLap}
              {lap.TotalLaps != null && <span className="text-small font-semibold text-muted"> / {lap.TotalLaps}</span>}
            </span>
          ) : remaining ? (
            <span className="num text-title font-bold leading-none">{remaining}</span>
          ) : (
            <span className="text-faint">—</span>
          )}
        </Cell>
        <Cell label="Track">
          <span className={`inline-flex min-h-7 items-center rounded-full px-3 text-small font-bold ${TONE_PILL[ts.tone]}`}>{ts.label}</span>
        </Cell>
        {w.known && (
          <Cell label="Weather">
            <span className="num flex items-baseline gap-3 text-small">
              <span>
                Air <strong className="font-semibold">{w.air != null ? `${w.air.toFixed(0)}°` : "—"}</strong>
              </span>
              <span>
                Track <strong className="font-semibold">{w.track != null ? `${w.track.toFixed(0)}°` : "—"}</strong>
              </span>
              <span className={w.rain ? "font-semibold text-tyre-wet" : "text-muted"}>
                {w.rain ? (
                  <>
                    <span aria-hidden="true">☂ </span>Rain
                  </>
                ) : (
                  "Dry"
                )}
              </span>
            </span>
          </Cell>
        )}
      </dl>

      {podium.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small">
          <span className="font-semibold text-muted">Podium</span>
          {podium.map((r) => (
            <span key={r.num} className="inline-flex items-center gap-1.5">
              <span className="num font-bold">{r.position}</span>
              <TeamBar colour={r.teamColour} className="h-4" />
              <span className="font-semibold">{r.code}</span>
            </span>
          ))}
        </p>
      )}

      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </section>
  );
}

/** Label beside the value: the strip is one line tall, so labels don't stack. */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="text-small font-semibold text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
