"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isReplayStatus } from "@/components/replay/format";
import { RadioButton } from "@/components/widgets/TeamRadio";
import { detectEvents, wanted, type EventTone, type RaceEvent } from "@/lib/events";
import { usePrefs } from "@/lib/prefs";
import { useSelection } from "@/lib/selection";
import { useStream } from "@/lib/store";
import { driverList } from "@/lib/timing";
import type { TimingState } from "@/lib/types";

const MAX = 4;
const LIFE_MS = 7000;
const RADIO_LIFE_MS = 14000;

const ICON: Record<RaceEvent["kind"], string> = {
  overtake: "⇡",
  pit: "P",
  fastest: "◆",
  flag: "⚑",
  penalty: "!",
  retire: "×",
  radio: "◉",
};

const TONE: Record<EventTone, string> = {
  info: "text-text",
  good: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  purple: "text-sector-purple",
};

/**
 * Race alerts in the corner. Watches the (already TV-delayed) state, so an alert never
 * arrives before the moment is on screen. A fresh snapshot (seek, reconnect, source change)
 * resets the comparison instead of reporting everything that changed.
 */
export function Toasts() {
  const { state, generation, status } = useStream();
  // Bottom right, clear of the top bar's controls; lifted over the playback dock in a replay.
  const dock = isReplayStatus(status?.source);
  const { prefs } = usePrefs();
  const { selected, select } = useSelection();
  const [items, setItems] = useState<RaceEvent[]>([]);
  const prev = useRef<{ state: TimingState; generation: number } | null>(null);

  // Favourite drivers and teams, as racing numbers.
  const favNums = useMemo(() => {
    const s = new Set<string>();
    for (const d of state ? driverList(state) : []) {
      if (prefs.drivers.includes((d.Tla ?? "").toUpperCase()) || (d.TeamName && prefs.teams.includes(d.TeamName))) s.add(d.RacingNumber);
    }
    return s;
  }, [state?.DriverList, prefs.drivers, prefs.teams]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = useRef({ prefs, favNums, selected });
  useEffect(() => {
    ctx.current = { prefs, favNums, selected };
  });

  useEffect(() => {
    if (!state) return;
    const last = prev.current;
    prev.current = { state, generation };
    if (!last || last.generation !== generation || last.state === state) return;
    const { prefs: p, favNums: f, selected: sel } = ctx.current;
    const fresh = detectEvents(last.state, state).filter((ev) => wanted(ev, p.notify[ev.kind], f, sel));
    if (fresh.length) setItems((xs) => [...xs, ...fresh].slice(-MAX));
  }, [state, generation]);

  // A new snapshot means a jump in time: old alerts no longer apply.
  useEffect(() => {
    setItems([]); // eslint-disable-line react-hooks/set-state-in-effect -- reset on snapshot
  }, [generation]);

  const dismiss = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));

  return (
    <div
      aria-live="polite"
      aria-label="Race alerts"
      className={`pointer-events-none fixed inset-x-3 z-40 flex flex-col items-stretch justify-end gap-2 sm:inset-x-auto sm:right-4 sm:w-[22rem] ${
        dock ? "bottom-[9.5rem] lg:bottom-[6.5rem]" : "bottom-4"
      }`}
    >
      {items.map((ev) => (
        <Toast key={ev.id} ev={ev} onDone={() => dismiss(ev.id)} onFollow={ev.nums[0] ? () => select(ev.nums[0]) : undefined} />
      ))}
    </div>
  );
}

function Toast({ ev, onDone, onFollow }: { ev: RaceEvent; onDone: () => void; onFollow?: () => void }) {
  const [hover, setHover] = useState(false);
  // The parent re-renders on every feed update; keep the timer from restarting with it.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (hover) return;
    const id = window.setTimeout(() => done.current(), ev.radio ? RADIO_LIFE_MS : LIFE_MS);
    return () => window.clearTimeout(id);
  }, [hover, ev.radio]);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="pointer-events-auto flex animate-tile-in items-stretch overflow-hidden rounded-panel border border-line-strong bg-surface shadow-[0_10px_28px_rgba(0,0,0,0.35)]"
    >
      <span aria-hidden="true" className="w-1 shrink-0" style={{ background: ev.colour ?? "var(--color-line-strong)" }} />
      <button
        type="button"
        onClick={() => {
          onFollow?.();
          onDone();
        }}
        disabled={!onFollow}
        title={onFollow ? "Follow this driver" : undefined}
        className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2.5 text-left enabled:hover:bg-raised/50 disabled:cursor-default"
      >
        <span aria-hidden="true" className={`mt-0.5 w-4 shrink-0 text-center text-body font-bold leading-5 ${TONE[ev.tone]}`}>
          {ICON[ev.kind]}
        </span>
        <span className="min-w-0">
          <span className="block text-body font-bold leading-5 text-text">{ev.title}</span>
          {ev.detail && <span className="mt-0.5 block text-small text-muted">{ev.kind === "radio" ? `“${ev.detail}”` : ev.detail}</span>}
        </span>
      </button>
      <span className="flex items-center gap-1 pr-2">
        {ev.radio && <RadioButton path={ev.radio.path} label={ev.title} />}
        <button
          type="button"
          onClick={onDone}
          aria-label="Dismiss"
          className="grid size-8 place-items-center rounded-chip text-faint transition-colors duration-150 hover:bg-raised hover:text-text"
        >
          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10">
            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </span>
    </div>
  );
}
