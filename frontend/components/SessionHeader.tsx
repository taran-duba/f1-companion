import { sessionTitle, towerRows, trackStatus, weather } from "@/lib/timing";
import type { TimingState } from "@/lib/types";
import { isAbnormal } from "./FlagBand";
import { TeamBar } from "./timing/Atoms";

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

// Tint + left edge stripe on the header while the track is not green.
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

/** Session name, status, lap X of Y, track status and weather as separate labelled cells. */
export function SessionHeader({ state }: { state: TimingState }) {
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
      className={`-mx-4 mb-1.5 border-b border-line px-4 pb-1.5 pt-1 lg:-mx-6 lg:px-6 ${loud ? (TONE_FRAME[ts.tone] ?? "") : ""}`}
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
        <div className="mr-auto min-w-0 max-w-full">
          <h1 className="truncate text-title font-bold leading-tight">{meeting}</h1>
          <p className="text-small text-muted">
            {session || "Session"}
            {status && <span className="ml-2 text-text">{SESSION_STATUS[status] ?? status}</span>}
          </p>
        </div>

        {podium.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body">
            <span className="font-semibold text-muted">Podium</span>
            {podium.map((r) => (
              <span key={r.num} className="inline-flex items-center gap-1.5">
                <span className="num font-bold">{r.position}</span>
                <TeamBar colour={r.teamColour} className="h-5" />
                <span className="font-semibold">{r.code}</span>
                <span className="hidden text-muted sm:inline">{r.name}</span>
              </span>
            ))}
          </p>
        )}

        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 md:gap-x-6">
          <Cell label="Lap">
            {lap?.CurrentLap != null ? (
              <span className="num text-title font-bold leading-none md:text-headline">
                {lap.CurrentLap}
                {lap.TotalLaps != null && <span className="text-body font-semibold text-muted md:text-title"> of {lap.TotalLaps}</span>}
              </span>
            ) : remaining ? (
              <span className="num text-title font-bold leading-none md:text-headline">{remaining}</span>
            ) : (
              <span className="text-faint">—</span>
            )}
          </Cell>
          <Cell label="Track">
            <span className={`inline-flex min-h-8 items-center rounded-full px-3 text-small font-bold ${TONE_PILL[ts.tone]}`}>
              {ts.label}
            </span>
          </Cell>
          <Cell label="Weather">
            {w.known ? (
              <span className="num flex items-baseline gap-3 text-body">
                <span>
                  Air <strong className="font-semibold">{w.air != null ? `${w.air.toFixed(0)}°` : "—"}</strong>
                </span>
                <span className="hidden md:inline">
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
            ) : (
              <span className="text-faint">—</span>
            )}
          </Cell>
        </dl>
      </div>

    </section>
  );
}

/** Label above the value on wide screens; inline (label first) on phones to save height. */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 md:flex-col md:items-start md:gap-0.5">
      <dt className="text-small font-semibold text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
