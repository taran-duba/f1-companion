"use client";

import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useTimingStream } from "@/lib/store";
import type { ServerStatus } from "@/lib/types";
import { Code, Detail, DetailList, Empty, Lead, StatusText } from "./Bits";
import { formatBytes, formatCount } from "./format";

/** "Record live sessions" switch plus what the recorder is doing right now. */
export function RecorderSection({ status }: { status: ServerStatus | null }) {
  const rec = status?.recorder;
  const requested = Boolean(rec?.requested ?? rec?.enabled);
  const recording = Boolean(rec?.enabled);
  const isLive = status?.source.kind === "live";
  const [pending, setPending] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  // After a successful change, keep the new value until the next status event
  // arrives, so the switch doesn't flick back to the old position for a moment.
  const [held, setHeld] = useState<{ value: boolean; until: ServerStatus | null } | null>(null);
  const stream = useTimingStream();
  const want = held && status === held.until ? held.value : requested;
  const on = pending ?? want;

  async function toggle() {
    if (pending !== null || !status) return;
    const next = !want;
    setPending(next);
    setError(null);
    try {
      await api.post("/api/recorder", { enabled: next });
      setHeld({ value: next, until: stream?.getSnapshot().status ?? null });
    } catch (e) {
      setError(`Couldn't ${next ? "turn recording on" : "turn recording off"}. ${e instanceof ApiError ? e.message : ""}`.trim());
    } finally {
      setPending(null);
    }
  }

  const lastError = typeof rec?.last_error === "string" ? rec.last_error : null;
  let stateText = "Off";
  let stateTone: "ok" | "warn" | "muted" = "muted";
  if (recording && want) {
    stateText = "Recording now";
    stateTone = "ok";
  } else if (want && !isLive) {
    stateText = "Waiting for live timing";
    stateTone = "warn";
  } else if (want) {
    stateText = "Starting";
    stateTone = "warn";
  }

  return (
    <div className="grid gap-4">
      <Lead>
        Saves the live feed to <Code>data/recordings/</Code> so you can watch it again later from the{" "}
        <span className="text-text">Replay</span> page. It only records while the source is live timing; with the demo or a
        replay it waits.
      </Lead>

      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby="recorder-state"
        disabled={!status}
        onClick={toggle}
        className="flex min-h-11 w-full items-center gap-3 rounded-chip border border-line-control px-3 py-2 text-left hover:bg-raised disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
      >
        <span
          aria-hidden="true"
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors duration-150 ${
            on ? "border-accent bg-accent" : "border-line-control bg-bg"
          }`}
        >
          <span
            className={`absolute size-4 rounded-full transition-transform duration-150 ${
              on ? "translate-x-[22px] bg-bg" : "translate-x-[2px] bg-muted"
            }`}
          />
        </span>
        <span className="text-body font-semibold text-text">Record live sessions</span>
        <span className="ml-auto text-small font-semibold text-muted md:ml-2">{pending !== null ? "Saving…" : on ? "On" : "Off"}</span>
      </button>
      {error && (
        <p role="alert" className="text-small">
          <StatusText tone="danger">{error}</StatusText>
        </p>
      )}

      <DetailList label="Recorder status">
        <Detail term="Recorder">
          <span id="recorder-state">
            <StatusText tone={stateTone}>{stateText}</StatusText>
          </span>
        </Detail>
        <Detail term="File">{typeof rec?.path === "string" && rec.path ? <Code>{rec.path}</Code> : <Empty label="No file open" />}</Detail>
        <Detail term="Messages">
          {recording ? <span className="num">{formatCount(typeof rec?.messages === "number" ? rec.messages : null)}</span> : <Empty />}
        </Detail>
        <Detail term="Size">{recording ? <span className="num">{formatBytes(typeof rec?.bytes === "number" ? rec.bytes : null)}</span> : <Empty />}</Detail>
        {lastError && (
          <Detail term="Last error">
            <StatusText tone="danger">{lastError}</StatusText>
          </Detail>
        )}
      </DetailList>
      <Link
        href="/replay"
        className="inline-flex min-h-11 items-center justify-self-start rounded-chip border border-line-control px-3 text-small font-semibold text-text hover:bg-raised"
      >
        Open saved recordings
      </Link>
    </div>
  );
}
