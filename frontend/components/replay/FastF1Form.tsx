"use client";

import { useState } from "react";
import type { SourcesResponse } from "@/lib/api";
import { useNow } from "@/lib/store";
import type { ServerStatus } from "@/lib/types";
import { BUTTON, InlineError, SourceSection, useSourceSwitch } from "./sourceUi";

const SESSIONS = [
  { value: "R", label: "Race (R)" },
  { value: "Q", label: "Qualifying (Q)" },
  { value: "S", label: "Sprint (S)" },
  { value: "FP1", label: "Practice 1 (FP1)" },
  { value: "FP2", label: "Practice 2 (FP2)" },
  { value: "FP3", label: "Practice 3 (FP3)" },
];

const FIELD =
  "min-h-11 w-full rounded-chip border border-line-control bg-raised px-3 text-body text-text placeholder:text-faint";

/** Load a past session through FastF1 (slow: downloads the whole session). */
export function FastF1Form({
  info,
  server,
  active,
}: {
  info: SourcesResponse["fastf1"] | null;
  server: ServerStatus | null;
  active: boolean;
}) {
  const [year, setYear] = useState("2025");
  const [event, setEvent] = useState("");
  const [session, setSession] = useState("R");
  const { pending, error, run } = useSourceSwitch();
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const serverLoading = server?.loading && server.loading.kind === "fastf1" ? server.loading : null;
  const loading = pending !== null || !!serverLoading;
  const serverError = !pending && !error && server?.error && /fastf1/i.test(server.error) ? server.error : null;

  const yearNum = Number(year);
  const yearValid = Number.isInteger(yearNum) && yearNum >= 2018 && yearNum <= 2100;
  const eventValid = event.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!yearValid || !eventValid || loading) return;
    setStartedAt(Date.now());
    await run("fastf1", { kind: "fastf1", year: yearNum, event: event.trim(), session, speed: 1 });
    setStartedAt(null);
  }

  const loadingLabel = serverLoading
    ? `${serverLoading.event ?? event} ${serverLoading.year ?? year} ${serverLoading.session ?? session}`
    : `${event.trim()} ${year} ${session}`;

  return (
    <SourceSection id="src-fastf1" title="FastF1 session" active={active}>
      <p className="mb-3 text-small text-muted">Any past session from 2018 on, rebuilt from FastF1 timing data.</p>
      {info && !info.installed && (
        <p className="mb-3 text-small text-muted">
          FastF1 isn&apos;t installed in the backend. Install it with <code className="font-mono text-text">pip install fastf1</code>,
          then restart the backend.
        </p>
      )}
      <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
        <div>
          <label htmlFor="ff1-year" className="mb-1 block text-small font-semibold text-muted">
            Year
          </label>
          <input
            id="ff1-year"
            type="number"
            inputMode="numeric"
            min={2018}
            max={2100}
            required
            value={year}
            onChange={(e) => setYear(e.target.value)}
            aria-invalid={!yearValid}
            aria-describedby={!yearValid ? "ff1-year-err" : undefined}
            className={`num ${FIELD}`}
          />
          {!yearValid && (
            <p id="ff1-year-err" className="mt-1 text-small text-danger">
              2018 or later
            </p>
          )}
        </div>
        <div>
          <label htmlFor="ff1-event" className="mb-1 block text-small font-semibold text-muted">
            Event
          </label>
          <input
            id="ff1-event"
            type="text"
            required
            autoComplete="off"
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            aria-describedby="ff1-event-help"
            className={FIELD}
          />
          <p id="ff1-event-help" className="mt-1 text-small text-faint">
            Name or round number, e.g. Monza or 14
          </p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ff1-session" className="mb-1 block text-small font-semibold text-muted">
            Session
          </label>
          <select id="ff1-session" value={session} onChange={(e) => setSession(e.target.value)} className={FIELD}>
            {SESSIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={loading || !yearValid || !eventValid} className={BUTTON}>
            {loading ? "Loading session…" : "Load session"}
          </button>
          {!eventValid && !loading && <span className="text-small text-faint">Enter an event to load.</span>}
        </div>
      </form>

      {loading && (
        <div role="status" aria-live="polite" className="mt-3 rounded-chip border border-line-strong bg-raised px-3 py-2 text-small">
          <p className="font-semibold text-text">Loading {loadingLabel.trim()}</p>
          <p className="text-muted">
            FastF1 downloads timing and car data for the whole session. The first load can take a few minutes; later loads come
            from the cache.
            {pending && startedAt != null && <Waiting since={startedAt} />}
          </p>
        </div>
      )}

      {error && <InlineError title="FastF1 couldn't load the session">{error.message}</InlineError>}
      {serverError && <InlineError title="Last FastF1 load failed">{serverError}</InlineError>}

      <p className="mt-3 text-small text-faint">
        FastF1 needs an F1 TV login: set <code className="font-mono text-muted">F1_USERNAME</code> and{" "}
        <code className="font-mono text-muted">F1_PASSWORD</code> for the backend, or run{" "}
        <code className="break-all font-mono text-muted">python -m fastf1 auth f1tv --authenticate</code> once.
        {info && (info.credentials ? " Login details are set." : " No login details are set for the backend yet.")}
      </p>
    </SourceSection>
  );
}

/** Seconds since the load started; ticks only while mounted (i.e. while loading). */
function Waiting({ since }: { since: number }) {
  const now = useNow(1000);
  if (!now) return null;
  // Hidden from the live region so screen readers aren't told every second.
  return (
    <span aria-hidden="true">
      {" "}
      Waiting <span className="num text-text">{Math.max(0, Math.round((now - since) / 1000))}</span> s.
    </span>
  );
}
