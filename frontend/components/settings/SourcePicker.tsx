"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api, ApiError, type SourcesResponse } from "@/lib/api";
import type { ServerStatus } from "@/lib/types";
import { DEMO_DESCRIPTION } from "@/components/replay/sourceUi";
import { Chip } from "@/components/timing/Atoms";
import { useTimingStream } from "@/lib/store";
import { StatusText } from "./Bits";
import { SOURCE_LABEL, toChoice, type SourceChoice } from "./format";

const ORDER: SourceChoice[] = ["demo", "replay", "live", "fastf1"];

const DESCRIPTION: Record<SourceChoice, string> = {
  demo: DEMO_DESCRIPTION,
  replay: "A live session you recorded earlier, played back from data/recordings/.",
  live: "F1's live timing feed. Works without login for timing; car telemetry and positions need an F1 TV token.",
  fastf1: "A past session downloaded with the FastF1 library, played back like a recording.",
};

type Result = { ok: boolean; message: string } | null;

/**
 * Radio cards for the data source. Demo and Live switch immediately; Recording
 * and FastF1 need a file or session, which is picked on /replay.
 *
 * Arrow keys only move focus (Space or Enter chooses), so tabbing through the
 * group can't switch the backend to live timing by accident.
 */
export function SourcePicker({ status }: { status: ServerStatus | null }) {
  const active = toChoice(status?.source.kind);
  const [sources, setSources] = useState<SourcesResponse | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [pending, setPending] = useState<SourceChoice | null>(null);
  const [picked, setPicked] = useState<SourceChoice | null>(null);
  const [result, setResult] = useState<Result>(null);
  // After a successful switch, keep showing the new source until the next
  // status event arrives (otherwise the old card flashes back for a moment).
  const [held, setHeld] = useState<{ kind: SourceChoice; until: ServerStatus | null } | null>(null);
  const stream = useTimingStream();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [sourcesTick, setSourcesTick] = useState(0);
  const loadSources = useCallback(() => setSourcesTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    api.get<SourcesResponse>("/api/sources").then(
      (body) => {
        if (cancelled) return;
        setSources(body);
        setSourcesError(null);
      },
      (e: unknown) => {
        if (!cancelled) setSourcesError(e instanceof ApiError ? e.message : "Couldn't list sources.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sourcesTick, active]); // refetch when the source changes (new recordings, demo generated)

  const demoMissing = sources ? !sources.demo.available : false;
  const disabled = (c: SourceChoice) => pending !== null || (c === "demo" && demoMissing);
  const current = held && status === held.until ? held.kind : active;
  const checked = pending ?? picked ?? current;

  async function apply(kind: "demo" | "live") {
    setPending(kind);
    setPicked(null);
    setResult(null);
    try {
      await api.post("/api/source", { kind });
      setHeld({ kind, until: stream?.getSnapshot().status ?? null });
      setResult({
        ok: true,
        message:
          kind === "demo"
            ? "Switched to the demo race. It's playing now."
            : "Switched to live timing. If no session is running, the timing stays empty until one starts.",
      });
    } catch (e) {
      const why = e instanceof ApiError ? e.message : "Unknown error.";
      setResult({ ok: false, message: `Couldn't switch to ${SOURCE_LABEL[kind].toLowerCase()}. ${why}` });
    } finally {
      setPending(null);
    }
  }

  function choose(c: SourceChoice) {
    if (disabled(c)) return;
    if (c === "replay" || c === "fastf1") {
      setResult(null);
      setPicked(c === current ? null : c);
      return;
    }
    setPicked(null);
    if (c === current) {
      setResult({ ok: true, message: `${SOURCE_LABEL[c]} is already the source.` });
      return;
    }
    void apply(c);
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, c: SourceChoice) {
    const enabled = ORDER.filter((o) => !(o === "demo" && demoMissing));
    const i = enabled.indexOf(c);
    let next: SourceChoice | undefined;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = enabled[(i + 1) % enabled.length];
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = enabled[(i - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled[enabled.length - 1];
    if (next) {
      e.preventDefault();
      refs.current[next]?.focus();
    }
  }

  const tabStop = checked && !(checked === "demo" && demoMissing) ? checked : ORDER.find((o) => !(o === "demo" && demoMissing));

  return (
    <div>
      <p id="source-help" className="max-w-[65ch] text-small text-muted">
        Where the dashboard gets its timing from. Every page reads the same data, so switching here changes all of them.
      </p>
      <div role="radiogroup" aria-labelledby="source-title" aria-describedby="source-help" aria-busy={pending !== null} className="mt-3 grid gap-2">
        {ORDER.map((c) => {
          const isChecked = checked === c;
          const isDisabled = c === "demo" && demoMissing;
          return (
            <div
              key={c}
              onClick={(e) => {
                // Links and buttons inside the card do their own thing.
                if ((e.target as HTMLElement).closest('a, button:not([role="radio"])')) return;
                if (!(e.target as HTMLElement).closest('[role="radio"]')) refs.current[c]?.focus();
                choose(c);
              }}
              className={`rounded-panel border transition-colors duration-150 has-[[role=radio]:focus-visible]:outline-2 has-[[role=radio]:focus-visible]:outline-offset-2 has-[[role=radio]:focus-visible]:outline-accent ${
                isChecked ? "border-accent bg-raised" : "border-line-strong bg-surface hover:bg-raised"
              } ${isDisabled ? "opacity-70" : "cursor-pointer"}`}
            >
              <button
                ref={(el) => {
                  refs.current[c] = el;
                }}
                type="button"
                role="radio"
                aria-checked={isChecked}
                aria-disabled={isDisabled || pending !== null || undefined}
                aria-describedby={`source-${c}-desc`}
                tabIndex={tabStop === c ? 0 : -1}
                onKeyDown={(e) => onKeyDown(e, c)}
                className="flex min-h-11 w-full items-center gap-3 rounded-panel px-3 pt-2 text-left focus-visible:outline-none"
              >
                <RadioDot checked={isChecked} />
                <span className="text-body font-semibold text-text">{SOURCE_LABEL[c]}</span>
                {current === c && <Chip tone="ok">In use</Chip>}
                {pending === c && <span className="text-small text-muted">Switching…</span>}
              </button>
              <div className="pb-3 pl-10 pr-3">
                <p id={`source-${c}-desc`} className="max-w-[65ch] text-small text-muted">
                  {DESCRIPTION[c]}
                </p>
                <CardExtra
                  choice={c}
                  status={status}
                  sources={sources}
                  active={current === c}
                  picked={picked === c}
                  onRecheck={loadSources}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div aria-live="polite" className="mt-3 grid gap-1 text-small empty:hidden">
        {result?.ok && <StatusText tone="ok">{result.message}</StatusText>}
        {sourcesError && <StatusText tone="warn">{`Couldn't check which sources are available. ${sourcesError}`}</StatusText>}
      </div>
      {result && !result.ok && (
        <p role="alert" className="mt-3 text-small">
          <StatusText tone="danger">{result.message}</StatusText>
        </p>
      )}
    </div>
  );
}

function RadioDot({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-[18px] shrink-0 place-items-center rounded-full border-2 ${checked ? "border-accent" : "border-line-control"}`}
    >
      {checked && <span className="size-2 rounded-full bg-accent" />}
    </span>
  );
}

const linkButton =
  "mt-2 inline-flex min-h-11 items-center rounded-chip border border-line-control px-3 text-small font-semibold text-text hover:bg-bg";

function CardExtra({
  choice,
  status,
  sources,
  active,
  picked,
  onRecheck,
}: {
  choice: SourceChoice;
  status: ServerStatus | null;
  sources: SourcesResponse | null;
  active: boolean;
  picked: boolean;
  onRecheck: () => void;
}) {
  if (choice === "demo" && sources && !sources.demo.available) {
    return (
      <div className="mt-2 text-small">
        <StatusText tone="warn">Not generated yet</StatusText>
        <p className="mt-1 max-w-[65ch] text-muted">
          Run <code className="font-mono text-text">python backend/scripts/generate_demo.py</code>, then check again.
        </p>
        <button type="button" onClick={onRecheck} className={linkButton}>
          Check again
        </button>
      </div>
    );
  }
  if (choice === "replay") {
    const n = sources?.recordings.length;
    return (
      <div className="text-small">
        {active && status?.source.name && (
          <p className="mt-1 text-faint">
            Playing <span className="break-all text-muted">{status.source.name}</span>
          </p>
        )}
        {n != null && (
          <p className="mt-1 text-faint">
            <span className="num">{n}</span> {n === 1 ? "recording" : "recordings"} saved
          </p>
        )}
        {(picked || active) && (
          <Link href="/replay" className={linkButton}>
            {active ? "Choose a different recording" : "Choose a recording"}
          </Link>
        )}
      </div>
    );
  }
  if (choice === "fastf1") {
    const installed = sources?.fastf1.installed;
    return (
      <div className="text-small">
        {active && status?.source.name && (
          <p className="mt-1 text-faint">
            Playing <span className="text-muted">{status.source.name}</span>
          </p>
        )}
        {installed === false && (
          <p className="mt-1">
            <StatusText tone="warn">FastF1 isn&apos;t installed in the backend&apos;s Python environment.</StatusText>
          </p>
        )}
        {(picked || active) && (
          <Link href="/replay" className={linkButton}>
            {active ? "Load a different session" : "Choose a session"}
          </Link>
        )}
      </div>
    );
  }
  if (choice === "live" && active && status && !status.token_present) {
    return (
      <p className="mt-1 max-w-[65ch] text-small text-faint">
        No F1 TV token is set, so car telemetry and positions are off. Timing still works.
      </p>
    );
  }
  return null;
}
