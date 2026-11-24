"use client";

import { useNow, useStream, useTimingStream } from "@/lib/store";

export type Tone = "ok" | "warn" | "danger" | "accent";

/**
 * "Can I trust what I'm seeing?": browser↔backend connection first, then the backend's
 * own source state. Shared by the source chip and the connection pill.
 */
export function useConnectionView() {
  const { connection, status, retryAt, lastEventAt } = useStream();
  const now = useNow(1000);
  const src = status?.source;

  let tone: Tone = "warn";
  let label = "Connecting";
  let detail = "";

  if (connection === "reconnecting") {
    tone = "warn";
    const secs = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;
    label = "Reconnecting";
    detail = retryAt ? `in ${secs} s` : "";
  } else if (connection === "closed") {
    tone = "danger";
    label = "Offline";
  } else if (connection === "open" && src) {
    const stale = lastEventAt != null && now - lastEventAt > 20000;
    if (src.kind === "live") {
      if (src.state === "connected") {
        tone = stale ? "warn" : "ok";
        label = stale ? "Live (stale)" : "Live";
      } else if (src.state === "error" || src.state === "reconnecting") {
        tone = "danger";
        label = "Feed down";
        detail = src.state === "reconnecting" ? "retrying" : "";
      } else {
        tone = "warn";
        label = "Feed connecting";
      }
    } else if (src.kind === "none") {
      tone = "danger";
      label = "No source";
    } else {
      tone = "accent";
      const what = src.kind === "demo" ? "Demo" : src.kind === "fastf1" ? "FastF1" : "Replay";
      const st = src.state === "paused" ? "paused" : src.state === "ended" ? "ended" : `${src.speed ?? 1}×`;
      label = `${what} ${st}`;
    }
  } else if (connection === "open") {
    tone = "ok";
    label = "Connected";
  }

  const pulsing = tone === "ok" && src?.kind === "live";
  return { tone, label, detail, pulsing, replay: src?.state, connection };
}

export const TONE_CLASS: Record<Tone, string> = {
  ok: "text-ok border-ok/60",
  warn: "text-warn border-warn/60",
  danger: "text-danger border-danger/60",
  // A replay is a neutral state, not an alert: the accent can be red in some themes.
  accent: "text-text border-line-control",
};

/** One pill with the connection state, for places where a plain status is enough. */
export function ConnectionPill() {
  const { tone, label, detail, pulsing, replay, connection } = useConnectionView();
  const stream = useTimingStream();

  return (
    <div className="flex items-center gap-2">
      <p className={`flex min-h-8 items-center gap-2 rounded-full border px-3 text-small font-semibold ${TONE_CLASS[tone]}`}>
        <StatusGlyph tone={tone} pulsing={pulsing} replay={replay} />
        <span>
          {/* Only the state is live; the ticking countdown stays out so it isn't re-announced every second. */}
          <span role="status" aria-live="polite">
            {label}
          </span>
          {detail && <span className="ml-1 font-normal text-muted num">{detail}</span>}
        </span>
      </p>
      {connection === "reconnecting" && (
        <button
          type="button"
          onClick={() => stream?.reconnectNow()}
          className="min-h-11 rounded-chip px-2 text-small font-semibold text-accent underline underline-offset-4 hover:bg-raised"
        >
          Retry now
        </button>
      )}
    </div>
  );
}

export function StatusGlyph({ tone, pulsing, replay }: { tone: string; pulsing: boolean; replay?: string }) {
  // Shape differs per state so colour isn't the only signal.
  if (tone === "danger")
    return (
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (tone === "warn")
    return (
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
        <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" />
      </svg>
    );
  if (tone === "accent" && replay === "paused")
    return (
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
        <path d="M3 2h2v8H3zM7 2h2v8H7z" fill="currentColor" />
      </svg>
    );
  if (tone === "accent" && replay === "ended")
    return (
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
        <rect x="2.5" y="2.5" width="7" height="7" fill="currentColor" />
      </svg>
    );
  if (tone === "accent")
    return (
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
        <path d="M3 2l7 4-7 4z" fill="currentColor" />
      </svg>
    );
  return <span aria-hidden="true" className={`size-2.5 rounded-full bg-current ${pulsing ? "animate-pulse-dot" : ""}`} />;
}
