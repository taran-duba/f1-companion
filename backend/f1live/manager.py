"""Owns the active data source and the optional recorder.

Exactly one source runs at a time. Switching sources stops the old one,
resets the store and starts the new one. Every message goes through
:class:`TapSink`, which forwards it to the store and, when recording is on
and the source is live, to the recorder.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from pathlib import Path
from typing import Any, Callable

from . import credentials
from .messages import Message, utc_iso
from .sources.base import Source
from .sources.replay import ReplaySource
from .state import StateStore

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
DEMO_PATH = Path(os.environ.get("F1_DEMO_FILE", ROOT / "data" / "demo" / "demo_race.jsonl.gz"))
RECORDINGS_DIR = Path(os.environ.get("F1_RECORDINGS_DIR", ROOT / "data" / "recordings"))
_SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.jsonl(\.gz)?$")


class TapSink:
    """Forwards messages to the store and, when enabled, to a recorder."""

    def __init__(self, store: StateStore) -> None:
        self.store = store
        self.recorder: Any = None
        self._t0: float | None = None

    def apply_message(self, msg: Message, heavy: bool = True) -> None:
        self.store.apply_message(msg, heavy=heavy)
        rec = self.recorder
        if rec is not None:
            if self._t0 is None:
                self._t0 = msg.t
            try:
                rec.write(Message(t=max(0.0, msg.t - self._t0), topic=msg.topic, data=msg.data,
                                  ts=msg.ts, snapshot=msg.snapshot))
            except Exception:  # noqa: BLE001 - recording must never break ingest
                log.exception("recorder write failed; disabling recorder")
                self.recorder = None

    def reset(self) -> None:
        self.store.reset()

    def invalidate(self) -> None:
        self.store.invalidate()

    def attach_recorder(self, recorder: Any, now_t: float) -> None:
        """Start recording: write the current raw state as snapshot lines."""
        ts = utc_iso()
        for topic, data in self.store.topics.items():
            recorder.write(Message(t=0.0, topic=topic, data=data, ts=ts, snapshot=True))
        self._t0 = now_t
        self.recorder = recorder

    def detach_recorder(self) -> None:
        self.recorder = None
        self._t0 = None


def safe_recording_path(name: str) -> Path:
    """Resolve a recording file name; rejects anything but a plain file name."""
    if not isinstance(name, str) or not _SAFE_NAME.match(name):
        raise ValueError("invalid recording name")
    path = (RECORDINGS_DIR / name).resolve()
    if path.parent != RECORDINGS_DIR.resolve() or not path.is_file():
        raise FileNotFoundError(name)
    return path


def list_recordings() -> list[dict[str, Any]]:
    out = []
    if RECORDINGS_DIR.is_dir():
        for p in sorted(RECORDINGS_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if p.is_file() and _SAFE_NAME.match(p.name):
                st = p.stat()
                out.append({"name": p.name, "size": st.st_size, "modified": st.st_mtime})
    return out


class SourceManager:
    def __init__(self, store: StateStore, on_status: Callable[[], None] | None = None) -> None:
        self.store = store
        self.sink = TapSink(store)
        self.source: Source | None = None
        self._task: asyncio.Task | None = None
        self._on_status = on_status
        self.recording_requested = False
        self.recorder: Any = None
        self.loading: dict[str, Any] | None = None
        self.last_error: str | None = None
        self._switch_lock = asyncio.Lock()

    # -- status --------------------------------------------------------------
    def _notify(self) -> None:
        if self._on_status:
            self._on_status()

    def status(self) -> dict[str, Any]:
        src = self.source.status() if self.source else {"kind": "none", "state": "idle"}
        rec = self.recorder.status() if self.recorder else {"enabled": False}
        rec["requested"] = self.recording_requested
        return {
            "source": src,
            "recorder": rec,
            "loading": self.loading,
            "error": self.last_error,
            "token_present": bool(os.environ.get("F1TV_TOKEN")),
            "token_source": credentials.source(),
            "transport": os.environ.get("F1_TRANSPORT", "core"),
        }

    # -- switching -------------------------------------------------------------
    async def _start(self, source: Source) -> None:
        await self._stop_current()
        self.store.reset()
        self.source = source
        source.on_status_change(self._notify)
        self._task = asyncio.create_task(self._run(source), name=f"source:{source.kind}")
        await self._sync_recorder()
        self._notify()

    async def _run(self, source: Source) -> None:
        try:
            await source.run()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            log.exception("source %s crashed", source.kind)
            self.last_error = f"{source.kind} source stopped: {exc}"
        finally:
            self._notify()

    async def _stop_current(self) -> None:
        self._stop_recorder()
        if self.source:
            try:
                await self.source.stop()
            except Exception:  # noqa: BLE001
                log.exception("error stopping source")
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        self.source = None
        self._task = None

    async def use_replay_file(self, path: Path, *, speed: float = 1.0, autoplay: bool = True) -> None:
        async with self._switch_lock:
            self.last_error = None
            src = await asyncio.to_thread(ReplaySource.from_file, self.sink, path, speed=speed, autoplay=autoplay)
            await self._start(src)

    async def use_demo(self, **kw: Any) -> None:
        if not DEMO_PATH.is_file():
            raise FileNotFoundError(f"demo fixture missing: {DEMO_PATH} (run backend/scripts/generate_demo.py)")
        await self.use_replay_file(DEMO_PATH, **kw)
        if self.source is not None:
            self.source.name = "Demo race (synthetic)"  # type: ignore[attr-defined]
            self.source.kind = "demo"

    async def use_recording(self, name: str, **kw: Any) -> None:
        await self.use_replay_file(safe_recording_path(name), **kw)

    async def use_live(self) -> None:
        from .sources.live import LiveSource  # imported lazily: optional deps

        async with self._switch_lock:
            self.last_error = None
            await self._start(LiveSource(self.sink))

    async def use_fastf1(self, year: int, event: str, session: str, *, speed: float = 1.0) -> None:
        from .sources.fastf1_source import FastF1Unavailable, load_fastf1_session

        async with self._switch_lock:
            self.last_error = None
            self.loading = {"kind": "fastf1", "year": year, "event": event, "session": session}
            self._notify()
            try:
                msgs = await asyncio.to_thread(load_fastf1_session, year, event, session)
            except FastF1Unavailable as exc:
                self.last_error = str(exc)
                raise
            except Exception as exc:  # noqa: BLE001
                self.last_error = f"FastF1 load failed: {exc}"
                raise
            finally:
                self.loading = None
                self._notify()
            src = ReplaySource(self.sink, msgs, name=f"FastF1 {year} {event} {session}", speed=speed)
            src.kind = "fastf1"
            await self._start(src)

    async def shutdown(self) -> None:
        await self._stop_current()

    # -- recorder ----------------------------------------------------------------
    async def set_recording(self, enabled: bool) -> None:
        self.recording_requested = enabled
        await self._sync_recorder()
        self._notify()

    async def _sync_recorder(self) -> None:
        want = self.recording_requested and self.source is not None and self.source.kind == "live"
        if want and self.recorder is None:
            from .recorder import Recorder

            rec = Recorder(RECORDINGS_DIR)
            session = (self.store.topics.get("SessionInfo") or {})
            rec.start(session_name=_session_label(session))
            self.recorder = rec
            self.sink.attach_recorder(rec, self.store.feed.get("t", 0.0))
        elif not want:
            self._stop_recorder()

    def _stop_recorder(self) -> None:
        if self.recorder is not None:
            self.sink.detach_recorder()
            try:
                self.recorder.stop()
            except Exception:  # noqa: BLE001
                log.exception("error stopping recorder")
            self.recorder = None


def _session_label(info: dict) -> str:
    meeting = (info.get("Meeting") or {}).get("Name") or "session"
    name = info.get("Name") or ""
    return f"{meeting} {name}".strip()
