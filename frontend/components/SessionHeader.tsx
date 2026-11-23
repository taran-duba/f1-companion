import { sessionTitle, trackStatus, weather } from "@/lib/timing";
import type { TimingState } from "@/lib/types";

const TONE_PILL: Record<string, string> = {
  green: "bg-flag-green text-bg",
  yellow: "bg-flag-yellow text-bg",
  sc: "bg-flag-yellow text-bg",
  vsc: "bg-flag-yellow text-bg",
  red: "bg-flag-red text-bg",
  chequered: "bg-text text-bg",
  unknown: "bg-raised text-muted",
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

  return (
    <section aria-label="Session" className="mb-3 flex flex-wrap items-stretch gap-x-6 gap-y-2 border-b border-line pb-3">
      <div className="mr-auto min-w-0">
        <h1 className="truncate text-title font-bold leading-tight lg:text-headline">{meeting}</h1>
        <p className="text-small text-muted">
          {session || "Session"}
          {status && <span className="ml-2 text-text">{SESSION_STATUS[status] ?? status}</span>}
        </p>
      </div>

      <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Cell label="Lap">
          {lap?.CurrentLap != null ? (
            <span className="num text-headline font-bold leading-none">
              {lap.CurrentLap}
              {lap.TotalLaps != null && <span className="text-title font-semibold text-muted"> / {lap.TotalLaps}</span>}
            </span>
          ) : remaining ? (
            <span className="num text-headline font-bold leading-none">{remaining}</span>
          ) : (
            <span className="text-faint">—</span>
          )}
        </Cell>
        <Cell label="Track">
          <span
            className={`inline-flex min-h-8 items-center rounded-full px-3 text-small font-bold ${TONE_PILL[ts.tone]}`}
          >
            {ts.label}
          </span>
        </Cell>
        <Cell label="Weather">
          {w.known ? (
            <span className="num flex items-baseline gap-3 text-body">
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
          ) : (
            <span className="text-faint">—</span>
          )}
        </Cell>
      </dl>
    </section>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-small font-semibold text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
