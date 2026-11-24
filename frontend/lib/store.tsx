"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { apiBase } from "./api";
import { usePrefs } from "./prefs";
import { TimingStream, type StreamSnapshot } from "./stream";

const StreamContext = createContext<TimingStream | null>(null);

const EMPTY: StreamSnapshot = {
  state: null,
  status: null,
  connection: "connecting",
  retryAt: null,
  attempts: 0,
  lastEventAt: null,
  generation: 0,
  delayMs: 0,
  pendingUntil: null,
  version: 0,
};

export function StreamProvider({ children }: { children: ReactNode }) {
  const [stream] = useState(() => (typeof window === "undefined" ? null : new TimingStream({ url: `${apiBase()}/api/stream` })));
  const { delaySec } = usePrefs().prefs;
  useEffect(() => {
    if (!stream) return;
    stream.start();
    return () => stream.stop();
  }, [stream]);
  useEffect(() => {
    stream?.setDelay(delaySec * 1000);
  }, [stream, delaySec]);
  return <StreamContext.Provider value={stream}>{children}</StreamContext.Provider>;
}

const noopSubscribe = () => () => {};

/** Current stream snapshot (state, status, connection). Re-renders on every update. */
export function useStream(): StreamSnapshot {
  const stream = useContext(StreamContext);
  return useSyncExternalStore(
    stream ? stream.subscribe : noopSubscribe,
    stream ? stream.getSnapshot : () => EMPTY,
    () => EMPTY,
  );
}

export function useTimingStream(): TimingStream | null {
  return useContext(StreamContext);
}

/** Re-render every `ms` (for "x s ago" style labels). */
export function useNow(ms = 1000): number {
  // 0 during prerender/hydration; the real clock starts in the effect.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, ms);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [ms]);
  return now;
}
