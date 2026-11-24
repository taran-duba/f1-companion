/**
 * EventSource wrapper for the backend SSE stream.
 *
 * - Every connection starts from a fresh snapshot: on (re)connect the local
 *   state is discarded and nothing is applied until a `snapshot` event arrives.
 * - Reconnects itself with exponential backoff + jitter (the browser's native
 *   EventSource retry is disabled by closing on error), so a dead backend
 *   doesn't get hammered and the UI can show "Reconnecting in N s".
 * - Patches carry a `seq`; any patch not newer than the snapshot is ignored.
 * - TV delay: while the source is live, snapshots and patches can be held back a set
 *   number of seconds so the screen lines up with a delayed broadcast. Connection and
 *   source status are never delayed. With no delay everything applies synchronously.
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
  /** Delay in force (ms): the requested TV delay while the source is live, else 0. */
  delayMs: number;
  /** Epoch ms when held-back data first shows, while nothing is on screen yet. */
  pendingUntil: number | null;
  version: number;
}

type Queued =
  | { at: number; kind: "snapshot"; seq: number; state: TimingState }
  | { at: number; kind: "patch"; seq: number | null; changes: Record<string, unknown> };

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
  /** Seq of the snapshot on screen; patches not newer than it are stale. */
  private snapshotSeq = -1;
  /** The current connection has delivered its snapshot (patches before it are dropped). */
  private connSnapshot = false;
  private stopped = true;
  private delayMs = 0;
  private queue: Queued[] = [];
  private drainTimer: unknown = null;
  private snap: StreamSnapshot = {
    state: null,
    status: null,
    connection: "closed",
    retryAt: null,
    attempts: 0,
    lastEventAt: null,
    generation: 0,
    delayMs: 0,
    pendingUntil: null,
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
    this.clearDrain();
    this.queue = [];
    this.es?.close();
    this.es = null;
    this.emit({ connection: "closed", retryAt: null, pendingUntil: null });
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

  /**
   * Hold live data back by `ms` to match a TV broadcast. A longer delay freezes the screen
   * until the held data is due; a shorter one catches up at once.
   */
  setDelay(ms: number) {
    this.delayMs = Math.max(0, Number.isFinite(ms) ? ms : 0);
    this.drain();
  }

  /** Only a live feed is delayed: a replay is already under your control. */
  private effectiveDelay(): number {
    return this.snap.status?.source?.kind === "live" ? this.delayMs : 0;
  }

  private clearDrain() {
    if (this.drainTimer !== null) this.o.clearTimer(this.drainTimer);
    this.drainTimer = null;
  }

  /** Apply everything that is due, then wake up when the next item is. */
  private drain() {
    this.clearDrain();
    const delay = this.effectiveDelay();
    const now = this.o.now();
    while (this.queue.length && this.queue[0].at + delay <= now) this.applyQueued(this.queue.shift()!);
    const next = this.queue[0];
    const pendingUntil = next && !this.snap.state ? next.at + delay : null;
    if (delay !== this.snap.delayMs || pendingUntil !== this.snap.pendingUntil) this.emit({ delayMs: delay, pendingUntil });
    if (next) {
      this.drainTimer = this.o.setTimer(() => {
        this.drainTimer = null;
        this.drain();
      }, Math.max(0, next.at + delay - now));
    }
  }

  private applyQueued(item: Queued) {
    if (item.kind === "snapshot") {
      this.snapshotSeq = item.seq;
      this.emit({ state: item.state, generation: this.snap.generation + 1 });
      return;
    }
    if (!this.snap.state) return;
    if (item.seq != null && item.seq <= this.snapshotSeq) return;
    // Copy-on-write per changed topic: unchanged topics keep their identity,
    // so views can memoise on e.g. `state.TimingData`.
    const next = { ...this.snap.state };
    for (const [topic, delta] of Object.entries(item.changes)) {
      const prev = next[topic];
      const base = typeof prev === "object" && prev !== null ? structuredClone(prev) : prev;
      next[topic] = merge(base, delta) as never;
    }
    this.emit({ state: next });
  }

  private connect() {
    // A new connection always starts from a fresh snapshot: patches are ignored until it
    // arrives. (Held-back data from the previous connection still plays out in order.)
    this.connSnapshot = false;
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
      this.connSnapshot = true;
      const now = this.o.now();
      this.emit({ connection: "open", attempts: 0, retryAt: null, lastEventAt: now });
      this.queue.push({ at: now, kind: "snapshot", seq: typeof seq === "number" ? seq : 0, state });
      this.drain();
    });
    es.addEventListener("patch", (ev) => {
      if (this.es !== es || !this.connSnapshot) return;
      const body = parse(ev.data) as { seq?: number; changes?: Record<string, unknown> } | null;
      if (!body || typeof body.changes !== "object" || body.changes === null) return;
      const now = this.o.now();
      // Recorded without an emit of its own: the applied patch (or the next one) carries it,
      // so a patch costs one render, as before.
      this.snap = { ...this.snap, lastEventAt: now };
      this.queue.push({ at: now, kind: "patch", seq: typeof body.seq === "number" ? body.seq : null, changes: body.changes });
      this.drain();
    });
    es.addEventListener("status", (ev) => {
      if (this.es !== es) return;
      const body = parse(ev.data) as ServerStatus | null;
      if (!body) return;
      this.emit({ status: body, lastEventAt: this.o.now() });
      // Switching to or from a live source changes the delay in force.
      this.drain();
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
