"use client";

import { useMemo } from "react";
import { EmptyState } from "@/components/Panel";
import { TeamBar } from "@/components/timing/Atoms";
import { radioClips, toggleRadio, useRadioPlayer } from "@/lib/radio";
import { parseUtc } from "@/lib/telemetry";
import type { TimingState } from "@/lib/types";

/** Play / stop for one clip; says when the clip can't be fetched. */
export function RadioButton({ path, label }: { path: string; label: string }) {
  const player = useRadioPlayer();
  const mine = player.path === path;
  const status = mine ? player.status : "idle";
  const verb = status === "playing" || status === "loading" ? "Stop" : "Play";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggleRadio(path);
      }}
      aria-label={`${verb} ${label}`}
      title={status === "error" ? "Couldn't load this clip" : `${verb} ${label}`}
      className={`grid size-9 shrink-0 place-items-center rounded-full border transition-colors duration-150 ${
        status === "error" ? "border-warn text-warn" : status === "idle" ? "border-line-control text-text hover:bg-raised" : "border-accent bg-accent text-on-accent"
      }`}
    >
      {status === "playing" || status === "loading" ? (
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
          <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" className={status === "loading" ? "animate-pulse-dot" : undefined} />
        </svg>
      ) : status === "error" ? (
        <span aria-hidden="true" className="text-small font-bold">
          !
        </span>
      ) : (
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
          <path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}

function ago(utc: string | null, now: number | null): string {
  const t = parseUtc(utc);
  if (t == null || now == null) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`;
}

/** Team radio clips, newest first. `num` limits it to one driver. */
export function TeamRadio({ state, num }: { state: TimingState; num?: string | null }) {
  const all = useMemo(() => radioClips(state), [state]);
  const clips = num ? all.filter((c) => c.num === num) : all;
  // "Ago" is measured on the feed's clock, so it is right in a replay too.
  const now = parseUtc(state.Heartbeat?.Utc ?? state.CarData?.Utc ?? null);

  if (!clips.length) {
    return (
      <EmptyState>
        {all.length ? "No radio from this driver yet." : "No team radio yet. Clips appear here as teams publish them, a minute or so after they are said."}
      </EmptyState>
    );
  }
  return (
    <ol className="grid gap-1" aria-label="Team radio, newest first">
      {clips.map((c) => (
        <li key={c.i} className="flex items-start gap-3 rounded-chip px-1 py-1.5 hover:bg-raised/50">
          <RadioButton path={c.path} label={`${c.code} team radio`} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-small">
              <TeamBar colour={c.teamColour} className="h-4" />
              <span className="font-semibold text-text">{c.code}</span>
              <span className="truncate text-faint">{c.name}</span>
              <span className="ml-auto shrink-0 text-micro text-faint">{ago(c.utc, now)}</span>
            </p>
            {c.text && <p className="mt-0.5 text-small text-muted">“{c.text}”</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
