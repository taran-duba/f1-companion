"""Load a past session through FastF1 and turn it into a recording.

Since FastF1 3.9 the F1 live-timing archive requires an F1 TV account, so
loading fails without credentials; that is reported as
:class:`FastF1Unavailable` with instructions instead of yielding an empty
session. The conversion itself lives in :mod:`fastf1_convert` (pure).

CLI::

    python -m f1live.sources.fastf1_source --year 2024 --event Bahrain --session R \
        --out ../data/recordings/2024-bahrain-r.jsonl.gz
"""

from __future__ import annotations

import argparse
import asyncio
import inspect
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any, Awaitable, Callable

from ..messages import Message, write_messages
from .base import MessageSink, Source
from .fastf1_common import FastF1Unavailable, frame, safe_attr
from .fastf1_convert import ConversionResult, convert_session

__all__ = ["FastF1Unavailable", "FastF1Source", "convert_session", "load_fastf1_session", "DEFAULT_CACHE_DIR"]

log = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CACHE_DIR = Path(os.environ.get("F1LIVE_FASTF1_CACHE", REPO_ROOT / "data" / "fastf1-cache"))
DEFAULT_RECORDINGS_DIR = REPO_ROOT / "data" / "recordings"

AUTH_HINT = (
    "Since FastF1 3.9 the F1 live-timing archive requires an F1 TV account. "
    "Set F1_USERNAME and F1_PASSWORD in the backend's environment, or run "
    "'python -m fastf1 auth f1tv --authenticate' once, then try again."
)


def _label(year: int, event: str | int, session: str) -> str:
    return f"{year} {event} {session}"


def load_fastf1_session(year: int, event: str | int, session: str,
                        cache_dir: str | Path | None = None, *, telemetry_hz: float = 2.0,
                        load_telemetry: bool = True) -> ConversionResult:
    """Load ``year/event/session`` via FastF1 and convert it to messages.

    The result is a ``list[Message]`` (:class:`ConversionResult`) whose
    ``has_telemetry`` / ``warnings`` say what was missing. Raises
    :class:`FastF1Unavailable` when no lap data could be loaded.
    """
    if isinstance(event, str) and event.strip().isdigit():
        event = int(event.strip())  # round number, e.g. from the HTTP API
    label = _label(year, event, session)
    try:
        import fastf1  # noqa: PLC0415 - heavy import, only when actually used
        from fastf1.exceptions import DataNotLoadedError  # noqa: PLC0415
    except ImportError as exc:
        raise FastF1Unavailable(f"FastF1 is not installed ({exc}); pip install fastf1") from exc

    cache = Path(cache_dir) if cache_dir else DEFAULT_CACHE_DIR
    try:
        cache.mkdir(parents=True, exist_ok=True)
        fastf1.Cache.enable_cache(str(cache))
    except Exception as exc:  # noqa: BLE001
        raise FastF1Unavailable(f"cannot use FastF1 cache directory {cache}: {exc}") from exc

    try:
        ses = fastf1.get_session(year, event, session)
    except Exception as exc:  # noqa: BLE001 - unknown event, schedule fetch failure, ...
        raise FastF1Unavailable(f"FastF1 could not find session {label}: {exc}") from exc
    try:
        ses.load(laps=True, telemetry=load_telemetry, weather=True, messages=True)
    except Exception as exc:  # noqa: BLE001
        raise FastF1Unavailable(f"FastF1 failed to load {label}: {exc}. {AUTH_HINT}") from exc

    try:
        laps = ses.laps
    except DataNotLoadedError:
        laps = None
    if frame(laps) is None:
        raise FastF1Unavailable(f"FastF1 returned no lap timing data for {label}. {AUTH_HINT}")

    result = convert_session(ses, telemetry_hz=telemetry_hz, include_telemetry=load_telemetry)
    if load_telemetry and frame_count(safe_attr(ses, "car_data")) == 0:
        result.warnings.append(f"telemetry missing for {label} (timing converted without it). {AUTH_HINT}")
        result.has_telemetry = False
    for w in result.warnings:
        log.warning("fastf1 %s: %s", label, w)
    return result


def frame_count(mapping: Any) -> int:
    """Number of drivers with non-empty telemetry in a FastF1 ``car_data`` dict."""
    if not hasattr(mapping, "values"):
        return 0
    return sum(1 for df in mapping.values() if frame(df) is not None)


def default_recording_path(year: int, event: str | int, session: str) -> Path:
    slug = "-".join(re.sub(r"[^a-z0-9]+", "_", str(x).strip().lower()).strip("_") or "x"
                    for x in (year, event, session))
    return DEFAULT_RECORDINGS_DIR / f"fastf1-{slug}.jsonl.gz"


OnLoaded = Callable[[list[Message]], Awaitable[None] | None]


class FastF1Source(Source):
    """Loads a session in a worker thread, then hands the messages over.

    It does not pace messages itself: pass ``on_loaded`` (e.g. to start a
    replay of the messages) and/or ``out_path`` to write a recording file.
    """

    kind = "fastf1"

    def __init__(self, sink: MessageSink, *, year: int, event: str | int, session: str,
                 cache_dir: str | Path | None = None, telemetry_hz: float = 2.0,
                 out_path: str | Path | None = None, on_loaded: OnLoaded | None = None) -> None:
        super().__init__(sink)
        self.year, self.event, self.session = year, event, session
        self.cache_dir = cache_dir
        self.telemetry_hz = telemetry_hz
        self.out_path = Path(out_path) if out_path else None
        self.on_loaded = on_loaded
        self.messages: ConversionResult | None = None
        self._state = "idle"
        self._error: str | None = None
        self._stopped = False

    def _set(self, state: str, error: str | None = None) -> None:
        self._state, self._error = state, error
        self._status_changed()

    async def run(self) -> None:
        self._stopped = False
        self._set("connecting")
        try:
            msgs = await asyncio.to_thread(load_fastf1_session, self.year, self.event, self.session,
                                           self.cache_dir, telemetry_hz=self.telemetry_hz)
            if self._stopped:
                return
            self.messages = msgs
            if self.out_path:
                self.out_path.parent.mkdir(parents=True, exist_ok=True)
                await asyncio.to_thread(write_messages, self.out_path, msgs)
            if self.on_loaded:
                res = self.on_loaded(msgs)
                if inspect.isawaitable(res):
                    await res
            self._set("ended")
        except FastF1Unavailable as exc:
            self._set("error", str(exc))
        except asyncio.CancelledError:
            self._set("idle")
            raise
        except Exception as exc:  # noqa: BLE001 - run() must not raise on bad data
            log.exception("FastF1 source failed")
            self._set("error", f"FastF1 conversion failed: {exc}")

    async def stop(self) -> None:
        # The FastF1 load can't be interrupted; its result is discarded.
        self._stopped = True
        if self._state == "connecting":
            self._set("idle")

    def status(self) -> dict[str, Any]:
        msgs = self.messages
        return {
            "kind": self.kind, "state": self._state,
            "detail": {"connecting": "loading session via FastF1"}.get(self._state, ""),
            "year": self.year, "event": self.event, "session": self.session,
            "messages": len(msgs) if msgs is not None else 0,
            "telemetry": msgs.has_telemetry if msgs is not None else None,
            "warnings": list(msgs.warnings) if msgs is not None else [],
            "path": str(self.out_path) if self.out_path else None,
            "error": self._error,
        }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Convert a past session (via FastF1) to a recording file.")
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--event", required=True, help="event name or round number")
    ap.add_argument("--session", required=True, help="R, Q, S, FP1 ...")
    ap.add_argument("--out", help="output .jsonl or .jsonl.gz (default data/recordings/fastf1-...)")
    ap.add_argument("--cache-dir", default=None)
    ap.add_argument("--hz", type=float, default=2.0, help="telemetry sample rate (0 disables)")
    args = ap.parse_args(argv)
    try:  # FastF1 installs its own (verbose) log handler
        import fastf1  # noqa: PLC0415
        fastf1.set_log_level("WARNING")
    except Exception:  # noqa: BLE001
        pass
    event: str | int = int(args.event) if args.event.isdigit() else args.event
    try:
        msgs = load_fastf1_session(args.year, event, args.session, args.cache_dir, telemetry_hz=args.hz,
                                   load_telemetry=args.hz > 0)
    except FastF1Unavailable as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    out = Path(args.out) if args.out else default_recording_path(args.year, event, args.session)
    out.parent.mkdir(parents=True, exist_ok=True)
    n = write_messages(out, msgs)
    print(f"wrote {n} messages to {out} (telemetry: {'yes' if msgs.has_telemetry else 'no'})")
    for w in msgs.warnings:
        print(f"warning: {w}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
