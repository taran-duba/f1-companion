"use client";

import { formatClock, lapAt, type ReplayMarkers } from "./format";
import { BAR_PERIODS } from "./SeekBar";

function Swatch({ status }: { status: string }) {
  const style =
    status === "red"
      ? { background: "var(--color-flag-red)" }
      : status === "sc"
        ? {
            background:
              "repeating-linear-gradient(45deg, var(--color-flag-yellow) 0 3px, color-mix(in srgb, var(--color-flag-yellow) 25%, transparent) 3px 6px)",
          }
        : {
            background:
              "radial-gradient(circle, var(--color-flag-yellow) 1.2px, transparent 1.4px) 0 0 / 5px 5px, color-mix(in srgb, var(--color-flag-yellow) 15%, transparent)",
          };
  return <span aria-hidden="true" className="inline-block h-3.5 w-5 shrink-0 rounded-[2px]" style={style} />;
}

/**
 * Legend for the shaded periods on the seek bar, doubling as jump buttons
 * (pattern + word, never colour alone).
 */
export function PeriodList({
  markers,
  start,
  disabled,
  onJump,
}: {
  markers: ReplayMarkers;
  start: number;
  disabled?: boolean;
  onJump: (t: number) => void;
}) {
  const periods = markers.periods.filter((p) => BAR_PERIODS.has(p.status));
  if (!periods.length) {
    return markers.laps.length ? (
      <p className="text-small text-faint">No safety car, virtual safety car or red flag in this session.</p>
    ) : null;
  }
  return (
    <div>
      <h3 className="mb-1 text-small font-semibold text-muted">Jump to</h3>
      <ul className="flex flex-wrap gap-2">
        {periods.map((p, i) => {
          const lapFrom = lapAt(markers.laps, p.start);
          const lapTo = lapAt(markers.laps, p.end);
          const laps = lapFrom == null ? null : lapTo != null && lapTo !== lapFrom ? `Laps ${lapFrom}–${lapTo}` : `Lap ${lapFrom}`;
          return (
            <li key={`${p.start}-${i}`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onJump(p.start)}
                aria-label={`Jump to ${p.label}${laps ? `, ${laps.toLowerCase()}` : ""}, at ${formatClock(p.start - start)}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-chip border border-line-control px-3 text-small hover:bg-raised disabled:opacity-60"
              >
                <Swatch status={p.status} />
                <span className="font-semibold text-text">{p.label}</span>
                {laps && <span className="num text-muted">{laps}</span>}
                <span className="num text-faint">{formatClock(p.start - start)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
