import { beforeEach, describe, expect, it } from "vitest";
import { TimingStream, type EventSourceLike } from "@/lib/stream";

class FakeES implements EventSourceLike {
  static all: FakeES[] = [];
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  closed = false;
  private handlers: Record<string, ((ev: MessageEvent) => void)[]> = {};
  constructor(public url: string) {
    FakeES.all.push(this);
  }
  addEventListener(type: string, fn: (ev: MessageEvent) => void) {
    (this.handlers[type] ??= []).push(fn);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, body: unknown) {
    const data = typeof body === "string" ? body : JSON.stringify(body);
    for (const fn of this.handlers[type] ?? []) fn({ data } as MessageEvent);
  }
  fail() {
    this.onerror?.(new Event("error"));
  }
}

function setup() {
  FakeES.all = [];
  const timers: { fn: () => void; ms: number }[] = [];
  let now = 1_000_000;
  const stream = new TimingStream({
    url: "http://x/api/stream",
    factory: (u) => new FakeES(u),
    random: () => 1, // deterministic: delay = base
    now: () => now,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => {},
  });
  return {
    stream,
    timers,
    es: () => FakeES.all[FakeES.all.length - 1],
    advance: (ms: number) => (now += ms),
    fireTimer: () => timers.shift()!.fn(),
  };
}

const snap = (seq: number, state: object) => ({ seq, generation: 1, state });

describe("TimingStream", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it("applies nothing until the snapshot, then merges newer patches", () => {
    t.stream.start();
    expect(t.stream.snapshot.connection).toBe("connecting");
    t.es().emit("patch", { seq: 1, changes: { LapCount: { CurrentLap: 1 } } });
    expect(t.stream.snapshot.state).toBeNull();
    t.es().emit("snapshot", snap(5, { LapCount: { CurrentLap: 3, TotalLaps: 50 } }));
    expect(t.stream.snapshot.connection).toBe("open");
    t.es().emit("patch", { seq: 5, changes: { LapCount: { CurrentLap: 99 } } }); // stale: ignored
    t.es().emit("patch", { seq: 6, changes: { LapCount: { CurrentLap: 4 } } });
    expect(t.stream.snapshot.state?.LapCount).toEqual({ CurrentLap: 4, TotalLaps: 50 });
  });

  it("keeps identity of untouched topics and replaces changed ones", () => {
    t.stream.start();
    t.es().emit("snapshot", snap(0, { A: { x: 1 }, B: { y: 1 } }));
    const before = t.stream.snapshot.state!;
    t.es().emit("patch", { seq: 1, changes: { A: { x: 2 } } });
    const after = t.stream.snapshot.state!;
    expect(after.B).toBe(before.B);
    expect(after.A).not.toBe(before.A);
    expect(before.A).toEqual({ x: 1 });
  });

  it("reconnects with exponential backoff and starts again from a fresh snapshot", () => {
    t.stream.start();
    t.es().emit("snapshot", snap(10, { LapCount: { CurrentLap: 7 }, Old: { keep: false } }));
    const gen = t.stream.snapshot.generation;

    t.es().fail();
    expect(t.es().closed).toBe(true);
    expect(t.stream.snapshot.connection).toBe("reconnecting");
    expect(t.timers.map((x) => x.ms)).toEqual([1000]);
    t.fireTimer();
    t.es().fail();
    expect(t.timers.map((x) => x.ms)).toEqual([2000]);
    t.fireTimer();
    t.es().fail();
    expect(t.timers.map((x) => x.ms)).toEqual([4000]);
    t.fireTimer();

    // New connection: patches before its snapshot are ignored even if their
    // seq looks newer than the old connection's snapshot.
    t.es().emit("patch", { seq: 11, changes: { LapCount: { CurrentLap: 8 } } });
    expect(t.stream.snapshot.state?.LapCount).toEqual({ CurrentLap: 7 });

    // The new snapshot replaces state wholesale (Old disappears) and resets backoff.
    t.es().emit("snapshot", snap(2, { LapCount: { CurrentLap: 9 } }));
    expect(t.stream.snapshot.state).toEqual({ LapCount: { CurrentLap: 9 } });
    expect(t.stream.snapshot.generation).toBe(gen + 1);
    expect(t.stream.snapshot.attempts).toBe(0);
    // Server seq restarted at 2 after a backend restart: patch 3 must apply.
    t.es().emit("patch", { seq: 3, changes: { LapCount: { CurrentLap: 10 } } });
    expect(t.stream.snapshot.state?.LapCount).toEqual({ CurrentLap: 10 });

    t.es().fail();
    expect(t.timers.map((x) => x.ms)).toEqual([1000]);
  });

  it("caps backoff at maxDelay", () => {
    t.stream.start();
    for (let i = 0; i < 10; i++) {
      t.es().fail();
      t.fireTimer();
    }
    t.es().fail();
    expect(t.timers[0].ms).toBe(30000);
  });

  it("ignores events from a superseded connection and malformed payloads", () => {
    t.stream.start();
    const first = t.es();
    first.fail();
    t.fireTimer();
    first.emit("snapshot", snap(1, { Stale: {} }));
    expect(t.stream.snapshot.state).toBeNull();
    t.es().emit("snapshot", "not json");
    t.es().emit("snapshot", { nope: 1 });
    expect(t.stream.snapshot.state).toBeNull();
    t.es().emit("snapshot", snap(1, { Ok: {} }));
    t.es().emit("patch", "{broken");
    expect(t.stream.snapshot.state).toEqual({ Ok: {} });
  });

  it("stop() closes and prevents reconnects", () => {
    t.stream.start();
    const es = t.es();
    t.stream.stop();
    expect(es.closed).toBe(true);
    es.fail();
    expect(t.timers).toHaveLength(0);
    expect(t.stream.snapshot.connection).toBe("closed");
  });
});
