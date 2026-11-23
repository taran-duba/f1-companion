"use client";

import type { ReactNode } from "react";
import { isAbnormal } from "@/components/FlagBand";
import { sentence } from "@/components/RaceControlFeed";
import { TeamBar } from "@/components/timing/Atoms";
import { raceControl, sessionTitle, towerRows, trackStatus, weather } from "@/lib/timing";
import type { TimingState } from "@/lib/types";

// Green is the normal state: outline only, so the filled pills stand out.
const TONE_PILL: Record<string, string> = {
  green: "border border-flag-green/70 text-flag-green",
  yellow: "bg-flag-yellow text-bg",
  sc: "bg-flag-yellow text-bg",
  vsc: "bg-flag-yellow text-bg",
  red: "bg-flag-red text-bg",
  chequered: "bg-text text-bg",
  unknown: "border border-line-control text-muted",
};

// Tint plus a left edge stripe while the track is not green.
const TONE_FRAME: Record<string, string> = {
  yellow: "bg-flag-yellow/10 shadow-[inset_4px_0_0_var(--color-flag-yellow)]",
  sc: "bg-flag-yellow/10 shadow-[inset_4px_0_0_var(--color-flag-yellow)]",
  vsc: "bg-flag-yellow/10 shadow-[inset_4px_0_0_var(--color-flag-yellow)]",
  red: "bg-flag-red/10 shadow-[inset_4px_0_0_var(--color-flag-red)]",
  chequered: "bg-raised/80 shadow-[inset_4px_0_0_var(--color-text)]",
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
 * The session in one calm row: which session, the lap, the track state, and a whisper of
 * weather and the latest race control message. `actions` sits at the right (the workspace
 * puts its driver picker and Customize button there).
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
  const latest = raceControl(state)[0];
  const weatherText = w.known
    ? [w.air != null ? `${w.air.toFixed(0)}° air` : null, w.track != null ? `${w.track.toFixed(0)}° track` : null, w.rain ? "rain" : "dry"].filter(Boolean).join(" · ")
    : null;

  return (
    <section
      aria-label="Session"
      className={`boot-strip flex flex-wrap items-center gap-x-6 gap-y-2 rounded-panel px-1 py-3 lg:py-2 ${loud ? `px-4 ${TONE_FRAME[ts.tone] ?? ""}` : ""}`}
    >
      <div className="min-w-0 max-w-full">
        <h1 className="truncate text-title font-bold leading-tight">{meeting}</h1>
        <p className="truncate text-small leading-tight text-muted">
          {session || "Session"}
          {status && <span className="ml-2 text-faint">{SESSION_STATUS[status] ?? status}</span>}
        </p>
      </div>

      <div className="flex items-baseline gap-2" role="group" aria-label="Lap">
        {lap?.CurrentLap != null ? (
          <span className="num text-display font-bold leading-none tracking-tight">
            {lap.CurrentLap}
            {lap.TotalLaps != null && <span className="ml-1.5 text-title font-semibold text-faint">/ {lap.TotalLaps}</span>}
          </span>
        ) : remaining ? (
          <span className="num text-headline font-bold leading-none">{remaining}</span>
        ) : null}
        <span className="text-small font-semibold text-muted">{lap?.CurrentLap != null ? "lap" : remaining ? "left" : ""}</span>
      </div>

      <span className={`inline-flex min-h-8 items-center rounded-full px-3.5 text-small font-bold ${TONE_PILL[ts.tone]}`}>
        <span className="sr-only">Track: </span>
        {ts.label}
      </span>

      {weatherText && <p className="num hidden text-small text-muted md:block">{weatherText}</p>}

      {latest?.Message && (
        <p className="hidden min-w-0 max-w-[30ch] truncate text-small text-faint 2xl:block" title={sentence(latest.Message)}>
          {latest.Lap != null && <span className="num mr-1.5">L{latest.Lap}</span>}
          {sentence(latest.Message)}
        </p>
      )}

      {podium.length > 0 && (
        <p className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-small 2xl:flex">
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
