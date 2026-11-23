"use client";

import { useMemo, useState } from "react";
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

/**
 * Newest first. With `initial`, only the latest few show until "Show all" is
 * pressed, so the panel stays short enough to sit above the fold. While collapsed,
 * every row has the same height (text clamped to two lines; "Show all" has the rest),
 * so a new message never pushes the panels below up or down. New messages are
 * announced politely to screen readers, in full.
 */
export function RaceControlFeed({ state, limit = 60, initial, maxHeight = "28rem" }: {
  state: TimingState;
  limit?: number;
  initial?: number;
  maxHeight?: string;
}) {
  const all = useMemo(() => raceControl(state).slice(0, limit), [state, limit]);
  const [expanded, setExpanded] = useState(false);
  if (!all.length) return <EmptyState>No race control messages yet.</EmptyState>;
  const collapsed = initial != null && !expanded && all.length > initial;
  const msgs = collapsed ? all.slice(0, initial) : all;
  const latest = all[0];
  return (
    <>
      <p aria-live="polite" className="sr-only">
        {latest?.Message ? `Race control: ${latest.Message}` : ""}
      </p>
      <ol
        className="-mx-1 overflow-y-auto overscroll-contain px-1"
        style={collapsed ? undefined : { maxHeight }}
        tabIndex={collapsed ? undefined : 0}
        aria-label="Race control messages, newest first"
      >
        {msgs.map((m, i) => (
          <MessageRow key={`${m.Utc}-${i}-${m.Message}`} m={m} clamp={collapsed} />
        ))}
      </ol>
      {initial != null && all.length > initial && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="mt-1 min-h-11 rounded-chip px-2 text-small font-semibold text-accent underline underline-offset-4 hover:bg-raised lg:min-h-9"
        >
          {expanded ? "Show latest only" : `Show all ${all.length} messages`}
        </button>
      )}
    </>
  );
}

/** Collapsed row height: py-2 + two 24px lines + the 1px divider. */
const CLAMPED_ROW = "h-[4.0625rem] overflow-hidden";

function MessageRow({ m, clamp }: { m: RaceControlMessage; clamp: boolean }) {
  const t = tag(m);
  return (
    <li className={`flex gap-3 border-b border-line py-2 last:border-b-0 ${clamp ? CLAMPED_ROW : ""}`}>
      <div className="flex w-16 shrink-0 flex-col font-mono text-micro text-faint">
        <time dateTime={m.Utc}>{time(m.Utc)}</time>
        {m.Lap != null && <span>Lap {m.Lap}</span>}
      </div>
      <div className={`min-w-0 flex-1 leading-6 ${clamp ? "line-clamp-2" : ""}`}>
        {t && <span className={`mr-2 inline-flex rounded-chip border px-1.5 text-micro font-bold leading-5 ${t.cls}`}>{t.label}</span>}
        <span className="text-small text-text">{sentence(m.Message ?? "")}</span>
      </div>
    </li>
  );
}

/** Race control shouts in caps; sentence case is easier to read at a glance. */
export function sentence(s: string) {
  if (!s || s !== s.toUpperCase()) return s;
  const lower = s.toLowerCase();
  return lower
    .replace(/(^|[.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase())
    .replace(/\b(drs|vsc|sc|pu|fia|f1)\b/gi, (m) => m.toUpperCase())
    .replace(/\bcar (\d+) \(([a-z]{3})\)/g, (_, n, c) => `car ${n} (${c.toUpperCase()})`)
    .replace(/\(([a-z]{3})\)/g, (_, c) => `(${c.toUpperCase()})`);
}
