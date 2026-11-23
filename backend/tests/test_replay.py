"""Replay timing: speed, pause, seek, using a fake clock (no real waiting)."""

import asyncio
from pathlib import Path

import pytest

from f1live.messages import Message, ReadStats, read_messages
from f1live.sources.replay import ReplaySource
from f1live.state import StateStore

FIXTURE = Path(__file__).parent / "fixtures" / "mini_session.jsonl"


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        # Advance virtual time instead of waiting; yield so others run.
        self.now += seconds
        await asyncio.sleep(0)


class RecordingSink:
    def __init__(self) -> None:
        self.applied: list[tuple[float, str]] = []
        self.resets = 0
        self.invalidations = 0

    def apply_message(self, msg: Message, heavy: bool = True) -> None:
        self.applied.append((msg.t, msg.topic))

    def reset(self) -> None:
        self.resets += 1
        self.applied.clear()

    def invalidate(self) -> None:
        self.invalidations += 1


def _msgs(times):
    return [Message(t=t, topic=f"T{i}", data={}) for i, t in enumerate(times)]


async def _run_until(src: ReplaySource, clock: FakeClock, virtual_seconds: float) -> None:
    """Drive the loop until the fake clock has advanced ``virtual_seconds``."""
    target = clock.now + virtual_seconds
    task = asyncio.create_task(src.run())
    try:
        for _ in range(100000):
            if clock.now >= target or src.ended:
                break
            await asyncio.sleep(0)
    finally:
        await src.stop()
        await asyncio.wait_for(task, 2)


def test_fixture_reads_and_skips_malformed_lines():
    stats = ReadStats()
    msgs = read_messages(FIXTURE, stats)
    assert stats.bad_lines == 3
    assert msgs[0].snapshot and msgs[0].t == 0
    assert [m.t for m in msgs] == sorted(m.t for m in msgs)
    assert msgs[-1].topic == "WeatherData"


@pytest.mark.parametrize("speed", [1.0, 2.0, 5.0])
async def test_messages_apply_on_schedule(speed):
    clock = FakeClock()
    sink = RecordingSink()
    src = ReplaySource(sink, _msgs([0, 10, 20, 40]), speed=speed, clock=clock, sleep=clock.sleep)
    # 15 seconds of recording time takes 15/speed wall seconds.
    await _run_until(src, clock, 15 / speed)
    assert [t for t, _ in sink.applied] == [0, 10]
    assert src.position == pytest.approx(15, abs=0.2 * speed)


async def test_full_replay_ends():
    clock = FakeClock()
    sink = RecordingSink()
    src = ReplaySource(sink, _msgs([0, 1, 2]), speed=5, clock=clock, sleep=clock.sleep)
    await _run_until(src, clock, 100)
    assert src.ended and src.status()["state"] == "ended"
    assert len(sink.applied) == 3


def test_pause_freezes_position_and_resume_continues():
    clock = FakeClock()
    src = ReplaySource(RecordingSink(), _msgs([0, 100]), clock=clock, sleep=clock.sleep)
    clock.now += 10
    assert src.position == pytest.approx(10)
    src.pause()
    clock.now += 50
    assert src.position == pytest.approx(10)
    assert src.status()["state"] == "paused"
    src.play()
    clock.now += 5
    assert src.position == pytest.approx(15)


def test_speed_change_reanchors_without_jump():
    clock = FakeClock()
    src = ReplaySource(RecordingSink(), _msgs([0, 1000]), clock=clock, sleep=clock.sleep)
    clock.now += 10
    src.set_speed(5)
    assert src.position == pytest.approx(10)
    clock.now += 10
    assert src.position == pytest.approx(60)
    with pytest.raises(ValueError):
        src.set_speed(0)


def test_seek_backward_rebuilds_from_start():
    clock = FakeClock()
    sink = RecordingSink()
    src = ReplaySource(sink, _msgs([0, 10, 20, 30]), clock=clock, sleep=clock.sleep)
    src.seek(25)
    assert [t for t, _ in sink.applied] == [0, 10, 20]
    assert sink.resets == 0  # forward seek from the start applies the gap
    src.seek(12)
    assert sink.resets == 1  # backward seek rebuilds
    assert [t for t, _ in sink.applied] == [0, 10]
    assert src.position == pytest.approx(12)
    assert sink.invalidations == 2


def test_seek_forward_applies_only_the_gap():
    clock = FakeClock()
    sink = RecordingSink()
    src = ReplaySource(sink, _msgs([0, 10, 20, 30]), clock=clock, sleep=clock.sleep)
    src.seek(5)
    resets = sink.resets
    src.seek(25)
    assert sink.resets == resets
    assert [t for t, _ in sink.applied] == [0, 10, 20]


def test_seek_clamps_and_seek_after_end_resumes():
    clock = FakeClock()
    src = ReplaySource(RecordingSink(), _msgs([0, 10]), clock=clock, sleep=clock.sleep)
    src.seek(-5)
    assert src.position == 0
    src.seek(999)
    assert src.position == 10


async def test_replay_of_fixture_into_store():
    clock = FakeClock()
    store = StateStore()
    src = ReplaySource.from_file(store, FIXTURE, speed=10, clock=clock, sleep=clock.sleep)
    await _run_until(src, clock, 60)
    snap = store.snapshot()
    assert snap["LapCount"]["CurrentLap"] == 2
    assert snap["TimingAppData"]["Lines"]["2"]["Stints"][1]["Compound"] == "HARD"
    assert snap["RaceControlMessages"]["Messages"][0]["Flag"] == "YELLOW"
    assert snap["CarData"]["Cars"]["1"]["speed"] == 280
    assert snap["Position"]["Entries"]["1"]["X"] == 100
    lap = snap["Derived"]["LapHistory"]["1"][0]
    assert (lap["lap"], lap["ms"], lap["s1"], lap["s2"], lap["s3"]) == (1, 90000, 30000, 30500, 29500)
    assert snap["WeatherData"]["Rainfall"] == "1"
    # The undecodable CarData.z line was counted, not fatal.
    assert snap["Feed"]["errors"] == 1


def test_snapshot_block_mid_recording_resets_state():
    """A recording that captured a feed reconnect replays as a fresh start."""
    clock = FakeClock()
    sink = RecordingSink()
    msgs = [Message(0, "A", {}, snapshot=True), Message(5, "B", {}),
            Message(10, "A", {}, snapshot=True), Message(10, "C", {}, snapshot=True), Message(12, "D", {})]
    src = ReplaySource(sink, msgs, clock=clock, sleep=clock.sleep)
    src.seek(12)
    assert sink.resets == 1
    assert [topic for _, topic in sink.applied] == ["A", "C", "D"]
