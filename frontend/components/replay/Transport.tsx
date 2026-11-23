"use client";

import { useEffect, useRef, useState } from "react";
import type { SourceStatus } from "@/lib/types";
import { KeyHint, PlayButton, SpeedControl } from "./Controls";
import { clampPos, DEFAULT_SPEEDS, formatClock, lapAt, readMarkers, spokenClock } from "./format";
import { PeriodList } from "./PeriodList";
import { SeekBar } from "./SeekBar";
import { usePlaybackClock, type ReplayAction } from "./useReplay";

const ARROW_STEP_S = 10;
const ARROW_DEBOUNCE_MS = 300;

/** Elements that use arrow keys themselves (the seek slider handles its own). */
const ARROW_OWNERS = 'input, textarea, select, [contenteditable="true"], [role="tab"], [role="slider"], [role="radio"], [role="listbox"], [role="menu"], [role="grid"]';
/** Elements that also own Space (it activates buttons and links natively). */
const SPACE_OWNERS = `${ARROW_OWNERS}, button, a[href], summary, [role="button"]`;

const STATE_WORD: Record<string, string> = { playing: "Playing", paused: "Paused", ended: "Ended" };

interface Props {
  source: SourceStatus;
  totalLaps?: number;
  send: (action: ReplayAction, value?: number) => Promise<boolean>;
  error: string | null;
  /** One-row bar for the bottom of the screen: jump-to periods open on demand. */
  dock?: boolean;
}

/** Play/pause, speed and seek for the active replay, demo or FastF1 session. */
export function Transport({ source, totalLaps, send, error, dock = false }: Props) {
  const [jumps, setJumps] = useState(false);
  const start = source.start ?? 0;
  const end = source.end ?? start;
  const markers = readMarkers(source);
  const [epoch, setEpoch] = useState(0);
  const clock = usePlaybackClock(source, epoch);
  const [scrub, setScrub] = useState<number | null>(null);
  const shown = clampPos(scrub ?? clock, start, end);

  const arrowTarget = useRef<number | null>(null);
  const arrowTimer = useRef<number | null>(null);

  async function commitSeek(t: number) {
    const target = clampPos(t, start, end);
    setScrub(target);
    setEpoch((e) => e + 1);
    await send("seek", target);
    setScrub(null);
  }

  function seekBy(delta: number) {
    const target = clampPos((arrowTarget.current ?? shown) + delta, start, end);
    arrowTarget.current = target;
    setScrub(target);
    if (arrowTimer.current) window.clearTimeout(arrowTimer.current);
    arrowTimer.current = window.setTimeout(() => {
      arrowTarget.current = null;
      arrowTimer.current = null;
      void commitSeek(target);
    }, ARROW_DEBOUNCE_MS);
  }

  useEffect(
    () => () => {
      if (arrowTimer.current) window.clearTimeout(arrowTimer.current);
    },
    [],
  );

  // Global shortcuts: Space toggles, ←/→ seek ±10 s, unless a control has focus.
  const keys = useRef({ toggle: () => {}, seekBy });
  useEffect(() => {
    keys.current = { toggle: () => void send("toggle"), seekBy };
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (e.key === " " || e.code === "Space") {
        // The seek slider doesn't use Space itself, so it still toggles from there.
        if (target?.closest(SPACE_OWNERS) && !target.matches('input[type="range"]')) return;
        e.preventDefault();
        // Holding Space would otherwise flip play/pause on every key repeat.
        if (!e.repeat) keys.current.toggle();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (target?.closest(ARROW_OWNERS)) return;
        e.preventDefault();
        keys.current.seekBy(e.key === "ArrowLeft" ? -ARROW_STEP_S : ARROW_STEP_S);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const elapsed = shown - start;
  const total = end - start;
  const lap = lapAt(markers.laps, shown);
  const lastLap = totalLaps ?? (markers.laps.length ? markers.laps[markers.laps.length - 1].lap : undefined);
  const lapText = lap != null ? `Lap ${lap}${lastLap ? ` of ${lastLap}` : ""}` : null;
  const speeds = source.speeds?.length ? source.speeds : DEFAULT_SPEEDS;
  const stateWord = STATE_WORD[source.state] ?? source.state;

  const seekBar = (
    <SeekBar
      start={start}
      end={end}
      value={shown}
      markers={markers}
      valueText={`${spokenClock(elapsed)} of ${spokenClock(total)}${lapText ? `, ${lapText.toLowerCase()}` : ""}`}
      // While playback moves the slider, a focused slider only re-announces once per lap (or minute).
      holdKey={source.state === "playing" && scrub === null ? (lap != null ? `lap${lap}` : `min${Math.floor(elapsed / 60)}`) : null}
      onScrub={setScrub}
      onCommit={(v) => void commitSeek(v)}
      onCancel={() => setScrub(null)}
      onKeySeek={seekBy}
    />
  );
  const errorBox = error && (
    <p role="alert" className="rounded-chip border border-danger px-3 py-2 text-small text-text">
      <span className="font-semibold text-danger">
        <span aria-hidden="true">✕ </span>Couldn&apos;t control the replay:
      </span>{" "}
      {error}
    </p>
  );

  if (dock) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <PlayButton compact state={source.state} onClick={() => void send("toggle")} />
          <span className="num text-body font-semibold">
            <span aria-hidden="true">{formatClock(elapsed)}</span>
            <span aria-hidden="true" className="font-normal text-faint">
              {" / "}
              {formatClock(total)}
            </span>
            <span className="sr-only">
              {stateWord}, {spokenClock(elapsed)} of {spokenClock(total)}
            </span>
            {scrub !== null && <span className="ml-2 text-small font-normal text-faint">seeking</span>}
          </span>
          <div className="order-last w-full lg:order-none lg:w-auto lg:min-w-48 lg:flex-1">{seekBar}</div>
          <div className="hidden md:block">
            <SpeedControl speeds={speeds} value={source.speed ?? 1} onChange={(v) => void send("speed", v)} />
          </div>
          {/* Phones: one button that steps through the speeds, instead of a six-way control. */}
          <button
            type="button"
            onClick={() => {
              const i = speeds.indexOf(source.speed ?? 1);
              void send("speed", speeds[(i + 1) % speeds.length]);
            }}
            aria-label={`Playback speed ${source.speed ?? 1} times. Tap for the next speed.`}
            className="num ml-auto min-h-11 min-w-14 rounded-chip border border-line-control px-3 text-small font-semibold text-text md:hidden"
          >
            {source.speed ?? 1}×
          </button>
          {markers.periods.length > 0 && (
            <button
              type="button"
              aria-expanded={jumps}
              onClick={() => setJumps((j) => !j)}
              className="hidden min-h-11 rounded-chip border border-line-control px-3 text-small font-semibold text-text transition-colors duration-150 hover:bg-raised md:inline-flex md:items-center"
            >
              Jump to
            </button>
          )}
        </div>
        {jumps && <PeriodList markers={markers} start={start} onJump={(t) => void commitSeek(t)} />}
        {errorBox}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <PlayButton state={source.state} onClick={() => void send("toggle")} />

        <div className="flex min-w-0 flex-col">
          <span className="text-small font-semibold text-muted">
            {stateWord}
            {scrub !== null && <span className="font-normal text-faint"> (seeking)</span>}
          </span>
          <span className="num text-title font-semibold leading-tight">
            <span aria-hidden="true">{formatClock(elapsed)}</span>
            <span aria-hidden="true" className="text-body font-normal text-faint">
              {" / "}
              {formatClock(total)}
            </span>
            <span className="sr-only">
              {spokenClock(elapsed)} of {spokenClock(total)}
            </span>
          </span>
        </div>

        {lapText && (
          <div className="flex flex-col">
            <span className="text-small font-semibold text-muted">Lap</span>
            <span className="num text-title font-semibold leading-tight">
              {lap}
              {lastLap ? <span className="text-body font-normal text-faint"> of {lastLap}</span> : null}
            </span>
          </div>
        )}

        <div className="w-full md:ml-auto md:w-auto">
          <SpeedControl speeds={speeds} value={source.speed ?? 1} onChange={(v) => void send("speed", v)} />
        </div>
      </div>

      {seekBar}

      {errorBox}

      <PeriodList markers={markers} start={start} onJump={(t) => void commitSeek(t)} />
      <KeyHint />
    </div>
  );
}
