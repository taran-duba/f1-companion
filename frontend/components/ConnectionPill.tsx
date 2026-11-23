"use client";

import { useNow, useStream, useTimingStream } from "@/lib/store";

/**
 * One pill answering "can I trust what I'm seeing?": browser↔backend
 * connection first, then the backend's own source state.
 */
export function ConnectionPill() {
  const { connection, status, retryAt, lastEventAt } = useStream();
  const stream = useTimingStream();
  const now = useNow(1000);
  const src = status?.source;

  let tone: "ok" | "warn" | "danger" | "accent" = "warn";
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

  const toneClass = {
    ok: "text-ok border-ok/60",
    warn: "text-warn border-warn/60",
    danger: "text-danger border-danger/60",
    accent: "text-accent border-accent/60",
  }[tone];
  const pulsing = tone === "ok" && src?.kind === "live";

  return (
    <div className="flex items-center gap-2">
      <p
        role="status"
        aria-live="polite"
        className={`flex min-h-8 items-center gap-2 rounded-full border px-3 text-small font-semibold ${toneClass}`}
      >
        <StatusGlyph tone={tone} pulsing={pulsing} />
        <span>
          {label}
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

function StatusGlyph({ tone, pulsing }: { tone: string; pulsing: boolean }) {
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
  if (tone === "accent")
    return (
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
        <path d="M3 2l7 4-7 4z" fill="currentColor" />
      </svg>
    );
  return <span aria-hidden="true" className={`size-2.5 rounded-full bg-current ${pulsing ? "animate-pulse-dot" : ""}`} />;
}
