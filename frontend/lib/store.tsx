"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { apiBase } from "./api";
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
  version: 0,
};

export function StreamProvider({ children }: { children: ReactNode }) {
  const [stream] = useState(() => (typeof window === "undefined" ? null : new TimingStream({ url: `${apiBase()}/api/stream` })));
  useEffect(() => {
    if (!stream) return;
    stream.start();
    return () => stream.stop();
  }, [stream]);
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
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
