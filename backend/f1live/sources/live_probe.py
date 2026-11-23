"""Manual probe for the live feed: one short connection, prints what it serves.

Usage (from ``backend/``)::

    python -m f1live.sources.live --probe [--transport legacy] [--seconds 10]

Run it sparingly against the real endpoint; it opens exactly one connection.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from ..messages import Message
from . import signalr
from .live import DEFAULT_BASE_URL, LiveSource


class _ProbeSink:
    def __init__(self) -> None:
        self.snapshot: dict[str, int] = {}
        self.updates: dict[str, int] = {}
        self.resets = 0

    def reset(self) -> None:
        self.resets += 1
        self.snapshot.clear()

    def apply_message(self, msg: Message) -> None:
        size = len(json.dumps(msg.data)) if not isinstance(msg.data, str) else len(msg.data)
        if msg.snapshot:
            self.snapshot[msg.topic] = size
        else:
            self.updates[msg.topic] = self.updates.get(msg.topic, 0) + 1


async def _probe(transport: str | None, seconds: float, base_url: str) -> dict[str, Any]:
    sink = _ProbeSink()
    src = LiveSource(sink, transport=transport, base_url=base_url, stall_timeout=max(seconds, 15.0))
    task = asyncio.create_task(src.run())
    await asyncio.sleep(seconds)
    await src.stop()
    await asyncio.gather(task, return_exceptions=True)
    st = src.status()
    return {
        "transport": src.transport,
        "token_present": src.token_present,
        "snapshot_topics": {k: f"{v} bytes" for k, v in sink.snapshot.items()},
        "updates": sink.updates,
        "missing_topics": [tp for tp in src.topics if tp not in sink.snapshot and tp not in sink.updates],
        "telemetry_available": st["telemetry_available"],
        "reconnects": st["reconnects"],
        "last_error": st["last_error"],
    }


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="F1 live timing probe")
    ap.add_argument("--probe", action="store_true", help="connect once, print topics, exit")
    ap.add_argument("--transport", choices=signalr.TRANSPORTS, default=None)
    ap.add_argument("--seconds", type=float, default=10.0)
    ap.add_argument("--base-url", default=DEFAULT_BASE_URL)
    args = ap.parse_args(argv)
    if not args.probe:
        ap.print_help()
        return 2
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    report = asyncio.run(_probe(args.transport, args.seconds, args.base_url))
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
