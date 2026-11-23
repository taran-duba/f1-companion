"use client";

import { apiBase } from "@/lib/api";
import type { StreamSnapshot } from "@/lib/stream";
import type { ReactNode } from "react";
import { useNow, useTimingStream } from "@/lib/store";
import { Code, Detail, DetailList, Empty, ErrorText, StatusText, type Tone } from "./Bits";
// Same h:mm:ss clock as the replay transport, so a position reads identically on both pages.
import { formatClock } from "@/components/replay/format";
import { SOURCE_LABEL, formatAgo, formatCount, stateWord, toChoice, toEpochMs } from "./format";
import { useClientValue } from "./useClientValue";

/** Browser↔backend link first, then the backend's own source details. */
export function ConnectionSection({ snap }: { snap: StreamSnapshot }) {
  const { connection, attempts, retryAt, lastEventAt, status, state } = snap;
  const stream = useTimingStream();
  const now = useNow(1000);
  const base = useClientValue(apiBase);
  const src = status?.source;
  const kind = toChoice(src?.kind);
  const live = kind === "live";

  let tone: Tone = "warn";
  let word: ReactNode = "Connecting";
  if (connection === "open") {
    tone = "ok";
    word = "Connected";
  } else if (connection === "reconnecting") {
    const secs = retryAt && now ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : null;
    word =
      secs != null ? (
        <>
          Reconnecting in <span className="num">{secs}</span> s
        </>
      ) : (
        "Reconnecting"
      );
  } else if (connection === "closed") {
    tone = "danger";
    word = "Offline";
  }

  const telemetry = src?.telemetry_available ?? state?.Feed?.telemetry;
  const srcTone: Tone = !src
    ? "muted"
    : src.state === "error"
      ? "danger"
      : src.state === "reconnecting" || src.state === "connecting"
        ? "warn"
        : src.state === "idle" || src.state === "ended" || src.state === "paused"
          ? "muted"
          : "ok";

  return (
    <div className="grid gap-4">
      <div>
        <h3 className="mb-1 text-small font-semibold text-text">This browser to the backend</h3>
        <DetailList>
          <Detail term="Status">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusText tone={tone}>{word}</StatusText>
              {connection === "reconnecting" && attempts > 0 && (
                <span className="text-muted">
                  Attempt <span className="num">{attempts}</span>
                </span>
              )}
              {(connection === "reconnecting" || connection === "closed") && (
                <button
                  type="button"
                  onClick={() => stream?.reconnectNow()}
                  className="inline-flex min-h-11 items-center rounded-chip border border-line-control px-3 font-semibold text-text hover:bg-raised"
                >
                  Retry now
                </button>
              )}
            </div>
          </Detail>
          <Detail term="Last update">
            {lastEventAt != null && now ? <span className="num">{formatAgo(lastEventAt, now)}</span> : <Empty label="Nothing received yet" />}
          </Detail>
          <Detail term="Backend address">{base ? <Code>{base}</Code> : <Empty />}</Detail>
        </DetailList>
        {connection !== "open" && (
          <p className="mt-2 max-w-[65ch] text-small text-muted">
            The page reconnects on its own. If it keeps failing, check the backend is running: from the{" "}
            <Code>backend</Code> folder run <Code>python -m f1live serve</Code>.
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-small font-semibold text-text">What the backend is playing</h3>
        <DetailList>
          <Detail term="Source">
            {kind ? SOURCE_LABEL[kind] : src?.kind === "none" ? "None chosen" : <Empty />}
            {src?.name && kind !== "demo" && <span className="block break-all text-faint">{src.name}</span>}
          </Detail>
          <Detail term="State">{src ? <StatusText tone={srcTone}>{stateWord(src.state)}</StatusText> : <Empty />}</Detail>
          {status?.loading && (
            <Detail term="Loading">
              <StatusText tone="warn">Loading a FastF1 session. The first load can take a few minutes.</StatusText>
            </Detail>
          )}
          {live && <LiveDetails snap={snap} now={now} />}
          {(kind === "demo" || kind === "replay" || kind === "fastf1") && (
            <>
              <Detail term="Position">
                {src?.position != null && src.start != null && src.end != null ? (
                  <span className="num">
                    {formatClock(src.position - src.start)} of {formatClock(src.end - src.start)}
                  </span>
                ) : (
                  <Empty />
                )}
              </Detail>
              <Detail term="Speed">{src?.speed != null ? <span className="num">{src.speed}×</span> : <Empty />}</Detail>
              <Detail term="Messages">
                <span className="num">{formatCount(src?.messages)}</span>
                {typeof src?.bad_lines === "number" && src.bad_lines > 0 && (
                  <span className="block text-warn">
                    <span className="num">{src.bad_lines}</span> unreadable lines skipped
                  </span>
                )}
              </Detail>
            </>
          )}
          <Detail term="Car telemetry">
            {telemetry == null ? (
              <Empty />
            ) : telemetry ? (
              <StatusText tone="ok">Available</StatusText>
            ) : (
              <StatusText tone="muted">Not available</StatusText>
            )}
          </Detail>
          {status?.error && (
            <Detail term="Last backend error">
              <ErrorText>{status.error}</ErrorText>
            </Detail>
          )}
        </DetailList>
      </div>
    </div>
  );
}

function LiveDetails({ snap, now }: { snap: StreamSnapshot; now: number }) {
  const src = snap.status?.source;
  if (!src) return null;
  const missing = Array.isArray(src.missing_topics) ? src.missing_topics : [];
  const lastMsg = toEpochMs(src.last_message_at);
  const since = toEpochMs(src.connected_since);
  const transport = src.transport ?? snap.status?.transport;
  return (
    <>
      <Detail term="Transport">
        {transport ? (
          <>
            {transport === "legacy" ? "Legacy" : transport === "core" ? "Core" : transport}
            <span className="block text-faint">{transport === "legacy" ? "Older SignalR endpoint" : "SignalR Core endpoint"}</span>
          </>
        ) : (
          <Empty />
        )}
      </Detail>
      <Detail term="Connected since">
        <span className="num">{since ? formatAgo(since, now) : "Not connected"}</span>
      </Detail>
      <Detail term="Last message">
        <span className="num">{lastMsg ? formatAgo(lastMsg, now) : "None yet"}</span>
      </Detail>
      <Detail term="Messages">
        <span className="num">{formatCount(src.messages)}</span>
      </Detail>
      <Detail term="Reconnects">
        <span className="num">{formatCount(src.reconnects)}</span>
      </Detail>
      <Detail term="Missing topics">
        {missing.length === 0 ? (
          <span className="text-muted">None</span>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {missing.map((t) => (
              <li key={t}>
                <Code>{t}</Code>
              </li>
            ))}
          </ul>
        )}
      </Detail>
      <Detail term="Last error">
        {src.last_error ? <ErrorText>{src.last_error}</ErrorText> : <span className="text-muted">None</span>}
      </Detail>
    </>
  );
}
