"use client";

import { useMemo } from "react";
import { raceControl } from "@/lib/timing";
import type { RaceControlMessage, TimingState } from "@/lib/types";
import { EmptyState } from "./Panel";

const FLAG_STYLE: Record<string, { cls: string; label: string }> = {
  GREEN: { cls: "border-flag-green text-flag-green", label: "Green" },
  CLEAR: { cls: "border-flag-green text-flag-green", label: "Clear" },
  YELLOW: { cls: "border-flag-yellow text-flag-yellow", label: "Yellow" },
  "DOUBLE YELLOW": { cls: "border-flag-yellow text-flag-yellow", label: "Double yellow" },
  RED: { cls: "border-flag-red text-flag-red", label: "Red" },
  BLUE: { cls: "border-tyre-wet text-tyre-wet", label: "Blue" },
  CHEQUERED: { cls: "border-text text-text", label: "Chequered" },
  "BLACK AND WHITE": { cls: "border-text text-text", label: "Black and white" },
};

function tag(m: RaceControlMessage): { cls: string; label: string } | null {
  if (m.Flag && FLAG_STYLE[m.Flag]) return FLAG_STYLE[m.Flag];
  if (m.Category === "SafetyCar") return { cls: "border-flag-yellow text-flag-yellow", label: m.Mode === "VIRTUAL SAFETY CAR" ? "VSC" : "Safety car" };
  if (m.Category === "Drs") return { cls: "border-accent text-accent", label: "DRS" };
  if (m.Category === "CarEvent") return { cls: "border-warn text-warn", label: "Incident" };
  return null;
}

function time(utc?: string) {
  if (!utc) return "";
  const d = new Date(utc.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(utc) ? utc : `${utc}Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

/** Newest first. New messages are announced politely to screen readers. */
export function RaceControlFeed({ state, limit = 60, maxHeight = "28rem" }: { state: TimingState; limit?: number; maxHeight?: string }) {
  const msgs = useMemo(() => raceControl(state).slice(0, limit), [state, limit]);
  if (!msgs.length) return <EmptyState>No race control messages yet.</EmptyState>;
  const latest = msgs[0];
  return (
    <>
      <p aria-live="polite" className="sr-only">
        {latest?.Message ? `Race control: ${latest.Message}` : ""}
      </p>
      <ol className="-mx-1 overflow-y-auto overscroll-contain px-1" style={{ maxHeight }} tabIndex={0} aria-label="Race control messages, newest first">
        {msgs.map((m, i) => {
          const t = tag(m);
          return (
            <li key={`${m.Utc}-${i}-${m.Message}`} className="flex gap-3 border-b border-line py-2 last:border-b-0">
              <div className="flex w-16 shrink-0 flex-col font-mono text-micro text-faint">
                <time dateTime={m.Utc}>{time(m.Utc)}</time>
                {m.Lap != null && <span>Lap {m.Lap}</span>}
              </div>
              <div className="min-w-0 flex-1">
                {t && (
                  <span className={`mr-2 inline-flex rounded-chip border px-1.5 text-micro font-bold leading-5 ${t.cls}`}>{t.label}</span>
                )}
                <span className="text-small text-text">{sentence(m.Message ?? "")}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** Race control shouts in caps; sentence case is easier to read at a glance. */
function sentence(s: string) {
  if (!s || s !== s.toUpperCase()) return s;
  const lower = s.toLowerCase();
  return lower
    .replace(/(^|[.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase())
    .replace(/\b(drs|vsc|sc|pu|fia)\b/g, (m) => m.toUpperCase())
    .replace(/\bcar (\d+) \(([a-z]{3})\)/g, (_, n, c) => `car ${n} (${c.toUpperCase()})`)
    .replace(/\(([a-z]{3})\)/g, (_, c) => `(${c.toUpperCase()})`);
}
