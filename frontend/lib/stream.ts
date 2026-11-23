/**
 * EventSource wrapper for the backend SSE stream.
 *
 * - Every connection starts from a fresh snapshot: on (re)connect the local
 *   state is discarded and nothing is applied until a `snapshot` event arrives.
 * - Reconnects itself with exponential backoff + jitter (the browser's native
 *   EventSource retry is disabled by closing on error), so a dead backend
 *   doesn't get hammered and the UI can show "Reconnecting in N s".
 * - Patches carry a `seq`; any patch not newer than the snapshot is ignored.
 */

import { merge } from "./merge";
import type { ConnectionState, ServerStatus, TimingState } from "./types";

export interface EventSourceLike {
  addEventListener(type: string, listener: (ev: MessageEvent) => void): void;
  close(): void;
  onopen: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
}

export type EventSourceFactory = (url: string) => EventSourceLike;

export interface StreamSnapshot {
  state: TimingState | null;
  status: ServerStatus | null;
  connection: ConnectionState;
  /** Epoch ms when the next reconnect attempt happens (while reconnecting). */
  retryAt: number | null;
  attempts: number;
  /** Epoch ms of the last event of any kind from the server. */
  lastEventAt: number | null;
  /** Bumped on every snapshot; lets views reset local buffers. */
  generation: number;
  version: number;
}

export interface StreamOptions {
  url: string;
  factory?: EventSourceFactory;
  minDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

type Listener = () => void;

export class TimingStream {
  private es: EventSourceLike | null = null;
  private timer: unknown = null;
  private listeners = new Set<Listener>();
  private snapshotSeq = -1;
  private stopped = true;
  private snap: StreamSnapshot = {
    state: null,
    status: null,
    connection: "closed",
    retryAt: null,
    attempts: 0,
    lastEventAt: null,
    generation: 0,
    version: 0,
  };
  private readonly o: Required<StreamOptions>;

  constructor(opts: StreamOptions) {
    this.o = {
      factory: (url) => new EventSource(url) as unknown as EventSourceLike,
      minDelayMs: 1000,
      maxDelayMs: 30000,
      random: Math.random,
      now: Date.now,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      ...opts,
    };
  }

  get snapshot(): StreamSnapshot {
    return this.snap;
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): StreamSnapshot => this.snap;

  private emit(patch: Partial<StreamSnapshot>) {
    this.snap = { ...this.snap, ...patch, version: this.snap.version + 1 };
    for (const l of this.listeners) l();
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.timer !== null) this.o.clearTimer(this.timer);
    this.timer = null;
    this.es?.close();
    this.es = null;
    this.emit({ connection: "closed", retryAt: null });
  }

  /** Force an immediate reconnect (e.g. "Retry now" button). */
  reconnectNow() {
    if (this.stopped) return;
    if (this.timer !== null) this.o.clearTimer(this.timer);
    this.timer = null;
    this.es?.close();
    this.es = null;
    this.connect();
  }

  private connect() {
    // A new connection always starts from scratch: drop state until the
    // server's snapshot arrives.
    this.snapshotSeq = -1;
    const reconnecting = this.snap.attempts > 0;
    this.emit({ connection: reconnecting ? "reconnecting" : "connecting", retryAt: null });
    let es: EventSourceLike;
    try {
      es = this.o.factory(this.o.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.es = es;
    es.onopen = () => {
      if (this.es !== es) return;
      this.emit({ lastEventAt: this.o.now() });
    };
    es.onerror = () => {
      if (this.es !== es) return;
      // Take over retrying from the browser so we control backoff.
      es.close();
      this.es = null;
      this.scheduleReconnect();
    };
    es.addEventListener("snapshot", (ev) => {
      if (this.es !== es) return;
      const body = parse(ev.data);
      if (!body || typeof body !== "object" || !("state" in body)) return;
      const { seq, state } = body as { seq: number; state: TimingState };
      this.snapshotSeq = typeof seq === "number" ? seq : 0;
      this.emit({
        state,
        connection: "open",
        attempts: 0,
        retryAt: null,
        lastEventAt: this.o.now(),
        generation: this.snap.generation + 1,
      });
    });
    es.addEventListener("patch", (ev) => {
      if (this.es !== es || this.snapshotSeq < 0 || !this.snap.state) return;
      const body = parse(ev.data) as { seq?: number; changes?: Record<string, unknown> } | null;
      if (!body || typeof body.changes !== "object" || body.changes === null) return;
      if (typeof body.seq === "number" && body.seq <= this.snapshotSeq) return;
      // Copy-on-write per changed topic: unchanged topics keep their identity,
      // so views can memoise on e.g. `state.TimingData`.
      const next = { ...this.snap.state };
      for (const [topic, delta] of Object.entries(body.changes)) {
        const prev = next[topic];
        const base = typeof prev === "object" && prev !== null ? structuredClone(prev) : prev;
        next[topic] = merge(base, delta) as never;
      }
      this.emit({ state: next, lastEventAt: this.o.now() });
    });
    es.addEventListener("status", (ev) => {
      if (this.es !== es) return;
      const body = parse(ev.data) as ServerStatus | null;
      if (body) this.emit({ status: body, lastEventAt: this.o.now() });
    });
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    const attempts = this.snap.attempts + 1;
    const base = Math.min(this.o.maxDelayMs, this.o.minDelayMs * 2 ** (attempts - 1));
    const delay = Math.round(base * (0.5 + this.o.random() * 0.5));
    this.emit({ connection: "reconnecting", attempts, retryAt: this.o.now() + delay });
    this.timer = this.o.setTimer(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }
}

function parse(data: unknown): unknown {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
