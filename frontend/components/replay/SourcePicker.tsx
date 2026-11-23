"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, type SourcesResponse } from "@/lib/api";
import type { ServerStatus } from "@/lib/types";
import { FastF1Form } from "./FastF1Form";
import { formatBytes } from "./format";
import { BUTTON, DEMO_DESCRIPTION, InlineError, SourceSection, useSourceSwitch } from "./sourceUi";

/** Demo race, recordings and FastF1: the three ways to start a replay. */
export function SourcePicker({ server }: { server: ServerStatus | null }) {
  const [sources, setSources] = useState<SourcesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { pending, error, run } = useSourceSwitch();
  const src = server?.source;

  const load = useCallback(() => {
    api
      .get<SourcesResponse>("/api/sources")
      .then((r) => {
        setSources(r);
        setLoadError(null);
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Request failed"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const demoAvailable = sources?.demo.available ?? true;
  const recordings = sources?.recordings ?? [];

  return (
    <div className="flex flex-col gap-4">
      <SourceSection id="src-demo" title="Demo race" active={src?.kind === "demo"}>
        <p className="mb-3 max-w-[65ch] text-small text-muted">{DEMO_DESCRIPTION}</p>
        {demoAvailable ? (
          <button
            type="button"
            className={BUTTON}
            disabled={pending !== null}
            onClick={() => void run("demo", { kind: "demo", speed: 5 })}
          >
            {pending === "demo" ? "Starting…" : src?.kind === "demo" ? "Restart demo race" : "Play demo race"}
          </button>
        ) : (
          <p className="text-small text-muted">
            The demo file is missing from the backend. Generate it with{" "}
            <code className="break-all font-mono text-text">python backend/scripts/generate_demo.py</code>.
          </p>
        )}
        {error?.key === "demo" && <InlineError>{error.message}</InlineError>}
      </SourceSection>

      <SourceSection id="src-recordings" title="Recordings" active={src?.kind === "replay"}>
        {loadError ? (
          <div>
            <InlineError title="Couldn't list recordings">{loadError}</InlineError>
            <button type="button" className={`${BUTTON} mt-2`} onClick={load}>
              Try again
            </button>
          </div>
        ) : !sources ? (
          <p className="text-small text-faint" aria-busy="true">
            Loading recordings…
          </p>
        ) : recordings.length === 0 ? (
          <div className="rounded-chip border border-dashed border-line-strong px-3 py-3 text-small text-muted">
            <p className="max-w-[65ch]">
              No recordings yet. Recordings are made while the live feed is on: turn on the recorder in Settings during a
              session and it will appear here to replay.
            </p>
            <Link href="/settings" className={`${BUTTON} mt-3`}>
              Open Settings
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {recordings.map((r) => {
              const key = `rec:${r.name}`;
              const isActive = src?.kind === "replay" && src.name === r.name;
              return (
                <li key={r.name} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-body font-semibold text-text">{r.name}</p>
                    <p className="num text-small text-muted">
                      <span>{formatBytes(r.size)}</span>
                      <span className="ml-3">
                        {new Date(r.modified * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                      {isActive && <span className="ml-3 font-semibold text-text">{src.state === "playing" ? "Playing" : "Loaded"}</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={pending !== null}
                    aria-label={`Replay ${r.name}`}
                    onClick={() => void run(key, { kind: "replay", file: r.name, speed: 1 })}
                  >
                    {pending === key ? "Starting…" : "Replay"}
                  </button>
                  {error?.key === key && (
                    <div className="w-full">
                      <InlineError>{error.message}</InlineError>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SourceSection>

      <FastF1Form info={sources?.fastf1 ?? null} server={server} active={src?.kind === "fastf1"} />
    </div>
  );
}
