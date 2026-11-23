"use client";

import Link from "next/link";
import { useState } from "react";
import { useStream } from "@/lib/store";
import type { TimingState } from "@/lib/types";
import { EmptyState } from "../Panel";
import { DriverLine } from "./DriverLine";
import { Gauges } from "./Gauges";
import { RollingChart } from "./RollingChart";
import { useTelemetryBuffer } from "./useTelemetryBuffer";
import { teamColour } from "@/lib/timing";

const WINDOWS = [30_000, 60_000] as const;

function WindowToggle({ value, onChange }: { value: number; onChange: (ms: number) => void }) {
  return (
    <div role="group" aria-label="Chart time window" className="inline-flex gap-1 rounded-panel border border-line-strong p-0.5">
      {WINDOWS.map((ms) => {
        const on = ms === value;
        return (
          <button
            key={ms}
            type="button"
            aria-pressed={on}
            aria-label={`${ms / 1000} seconds`}
            onClick={() => onChange(ms)}
            className={`num min-h-11 min-w-12 rounded-chip px-2 text-small lg:min-h-9 ${
              on ? "bg-raised font-bold text-text shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-muted hover:bg-raised/60"
            }`}
          >
            {ms / 1000} s
          </button>
        );
      })}
    </div>
  );
}

function TelemetryBody({ state, num, windowMs, onWindow, paused }: {
  state: TimingState;
  num: string;
  windowMs: number;
  onWindow: (ms: number) => void;
  paused: boolean;
}) {
  const { samples, backfilled, error } = useTelemetryBuffer(state, num);
  const driver = state.DriverList?.[num];
  const code = driver?.Tla ?? num;
  const latest = samples[samples.length - 1] ?? null;

  if (!latest) {
    if (!backfilled) return <p className="text-small text-muted">Loading recent telemetry for {code}…</p>;
    return (
      <EmptyState>
        {error
          ? `Couldn't load the last minute of telemetry for ${code}. ${/[.?!]$/.test(error) ? error : `${error}.`} New samples appear here as soon as the feed sends them.`
          : `No car data for ${code} yet. Speed, throttle and brake appear here as soon as the feed sends samples for this car.`}
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Gauges sample={latest} />
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-small font-semibold text-muted">
            Last <span className="num">{windowMs / 1000}</span> seconds
            {paused && <span className="ml-2 font-normal text-faint">(replay paused)</span>}
          </h3>
          <WindowToggle value={windowMs} onChange={onWindow} />
        </div>
        <RollingChart samples={samples} windowMs={windowMs} colour={teamColour(driver)} code={code} />
      </div>
    </div>
  );
}

/** Selected driver's live telemetry: gauges plus a short rolling chart. */
export function TelemetryPanel({ state, selected }: { state: TimingState; selected: string | null }) {
  const { status, generation } = useStream();
  const [windowMs, setWindowMs] = useState<number>(WINDOWS[0]);

  if (!selected) {
    return <EmptyState>Select a driver in the timing tower to see their speed, gear, throttle and brake here.</EmptyState>;
  }

  const source = status?.source;
  const noToken = source?.kind === "live" && !state.Feed?.telemetry;

  return (
    <div className="flex flex-col gap-4">
      <DriverLine state={state} num={selected} />
      {noToken ? (
        <EmptyState>
          <p>Car telemetry needs an F1 TV token in live mode. Timing still works.</p>
          <Link
            href="/settings"
            className="mt-1 inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2 lg:min-h-8"
          >
            Add a token in Settings
          </Link>
        </EmptyState>
      ) : (
        <TelemetryBody
          key={`${selected}:${generation}`}
          state={state}
          num={selected}
          windowMs={windowMs}
          onWindow={setWindowMs}
          paused={source?.state === "paused"}
        />
      )}
    </div>
  );
}
