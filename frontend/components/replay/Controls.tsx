"use client";

import { formatSpeed } from "./format";

/** Primary play / pause button; label and icon follow the replay state. */
export function PlayButton({ state, disabled, onClick, compact = false }: { state: string; disabled?: boolean; onClick: () => void; compact?: boolean }) {
  const playing = state === "playing";
  const ended = state === "ended";
  const label = playing ? "Pause" : ended ? "Restart" : "Play";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label} replay`}
      className={`inline-flex min-h-11 items-center justify-center gap-2 bg-accent font-semibold text-bg transition-opacity duration-150 hover:opacity-90 disabled:opacity-60 motion-reduce:transition-none ${compact ? "size-11 rounded-full" : "min-w-28 rounded-chip px-4 text-body"}`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
        {playing ? (
          <>
            <rect x="3" y="2" width="3.5" height="12" rx="1" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
          </>
        ) : ended ? (
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.5 8.5A5.5 5.5 0 1 1 11.6 4" />
            <path d="M12.5 1.5V4.5H9.5" />
          </g>
        ) : (
          <path d="M4 2.2v11.6c0 .6.7 1 1.2.6l8.6-5.8a.7.7 0 0 0 0-1.2L5.2 1.6C4.7 1.2 4 1.6 4 2.2Z" />
        )}
      </svg>
      {!compact && <span aria-hidden="true">{label}</span>}
    </button>
  );
}

/** Segmented speed control; the active speed is aria-pressed. */
export function SpeedControl({
  speeds,
  value,
  disabled,
  onChange,
}: {
  speeds: number[];
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span id="replay-speed-label" className="text-small font-semibold text-muted">
        Speed
      </span>
      <div
        role="group"
        aria-labelledby="replay-speed-label"
        className="flex min-w-0 max-w-sm flex-1 rounded-chip border border-line-control md:max-w-none md:flex-none"
      >
        {speeds.map((s) => {
          const active = Math.abs(s - value) < 1e-6;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => !active && onChange(s)}
              className={`num min-h-11 min-w-0 flex-1 px-2 text-small first:rounded-l-[3px] last:rounded-r-[3px] focus-visible:-outline-offset-2 transition-colors duration-150 motion-reduce:transition-none md:min-w-11 md:flex-none ${
                active ? "bg-raised font-bold text-text underline decoration-accent decoration-2 underline-offset-4" : "text-muted hover:bg-raised hover:text-text"
              }`}
            >
              {formatSpeed(s)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Keyboard shortcuts, shown under the transport. */
export function KeyHint() {
  const kbd = "rounded-[3px] border border-line-control px-1.5 font-sans text-micro text-text";
  return (
    <p className="text-small text-faint">
      Keyboard: <kbd className={kbd}>Space</kbd> plays or pauses, <kbd className={kbd}>←</kbd> and{" "}
      <kbd className={kbd}>→</kbd> jump 10 seconds.
    </p>
  );
}
