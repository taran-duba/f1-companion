#!/usr/bin/env python3
"""Generate the synthetic demo race fixture.

Everything in the output is fictional: drivers, teams, the event and the
circuit are invented, and the race is simulated from a fixed seed, so the
same arguments always produce the same file.

Usage (from the repo root)::

    python backend/scripts/generate_demo.py [--seed N] [--laps N] [--out PATH]
"""

from __future__ import annotations

import argparse
import gzip
import sys
import time
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPTS_DIR.parent
REPO_ROOT = BACKEND_DIR.parent
for p in (str(BACKEND_DIR), str(SCRIPTS_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from f1live.messages import Message, dumps_lines  # noqa: E402

from demo.sim import Race  # noqa: E402

DEFAULT_SEED = 2026
DEFAULT_LAPS = 50
DEFAULT_OUT = REPO_ROOT / "data" / "demo" / "demo_race.jsonl.gz"
MAX_LAPS = 200


def simulate(seed: int = DEFAULT_SEED, laps: int = DEFAULT_LAPS) -> tuple[list[Message], dict]:
    """Run the simulation and return ``(messages, stats)`` without writing anything."""
    if not 1 <= laps <= MAX_LAPS:
        raise ValueError(f"laps must be between 1 and {MAX_LAPS}")
    race = Race(seed=seed, laps=laps)
    msgs = race.run()
    stats = dict(race.stats)
    stats["messages"] = len(msgs)
    stats["duration"] = msgs[-1].t if msgs else 0.0
    stats["classification"] = [(c.num, c.info.tla, c.laps_done, "DNF" if c.retired else "") for c in race.order]
    stats["stops"] = {c.num: c.stops for c in race.cars}
    return msgs, stats


def _write(out: Path, msgs: list[Message]) -> None:
    """Write JSON Lines; .gz output gets a fixed header (no name, mtime 0) so the
    same seed always produces a byte-identical file."""
    text = dumps_lines(msgs).encode("utf-8")
    if out.suffix == ".gz":
        with open(out, "wb") as raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as gz:
            gz.write(text)
    else:
        out.write_bytes(text)


def generate(out: str | Path = DEFAULT_OUT, seed: int = DEFAULT_SEED, laps: int = DEFAULT_LAPS) -> dict:
    """Simulate a race and write it as (gzipped) JSON Lines. Returns stats."""
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    msgs, stats = simulate(seed=seed, laps=laps)
    _write(out, msgs)
    stats["path"] = str(out)
    stats["bytes"] = out.stat().st_size
    return stats


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED, help=f"random seed (default {DEFAULT_SEED})")
    ap.add_argument("--laps", type=int, default=DEFAULT_LAPS, help=f"race distance in laps (default {DEFAULT_LAPS})")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="output path (.jsonl or .jsonl.gz)")
    ap.add_argument("-q", "--quiet", action="store_true", help="print only the output path")
    args = ap.parse_args(argv)
    if not 1 <= args.laps <= MAX_LAPS:
        ap.error(f"--laps must be between 1 and {MAX_LAPS}")
    t0 = time.time()
    stats = generate(args.out, seed=args.seed, laps=args.laps)
    if args.quiet:
        print(stats["path"])
        return 0
    print(f"wrote {stats['path']}: {stats['messages']} messages, {stats['bytes'] / 1e6:.2f} MB, "
          f"{stats['duration']:.0f} s of session time, generated in {time.time() - t0:.1f} s")
    print(f"overtakes={stats['overtakes']} pit_stops={stats['pit_stops']}")
    for t, what in stats["events"]:
        print(f"  t={t:7.1f}  {what}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
