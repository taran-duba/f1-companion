#!/usr/bin/env python3
"""Render the demo race's team radio clips with macOS text-to-speech.

Runs the same simulation as ``generate_demo.py`` (so the clip list can't drift
from the fixture), speaks each line with ``say`` (one voice for the engineer,
another for the driver), joins the parts and encodes small mono AAC files with
``afconvert`` into ``data/demo/radio/``. macOS only; the generator itself just
references the committed clips.

Usage (from the repo root)::

    python backend/scripts/demo/make_radio.py [--seed N] [--laps N] [--out DIR]
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_DIR))

from generate_demo import DEFAULT_LAPS, DEFAULT_SEED, REPO_ROOT, simulate  # noqa: E402

DEFAULT_OUT = REPO_ROOT / "data" / "demo" / "radio"
VOICES = {"engineer": "Daniel", "driver": "Reed (English (UK))"}
RATE = 16000
GAP_S = 0.35  # silence between speakers


def _speak(text: str, voice: str, out: Path) -> None:
    subprocess.run(["say", "-v", voice, "-r", "195", f"--data-format=LEI16@{RATE}", "-o", str(out), text],
                   check=True)


def render(parts: list[tuple[str, str]], out: Path, tmp: Path) -> None:
    """Speak each part, join them with short gaps, encode to AAC in ``out``."""
    frames = b""
    gap = b"\0\0" * int(RATE * GAP_S)
    for i, (who, text) in enumerate(parts):
        part = tmp / f"part{i}.wav"
        _speak(text, VOICES[who], part)
        with wave.open(str(part)) as w:
            frames += (gap if frames else b"") + w.readframes(w.getnframes())
    joined = tmp / "joined.wav"
    with wave.open(str(joined), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(frames)
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "24000", "-c", "1", str(joined), str(out)],
                   check=True)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--laps", type=int, default=DEFAULT_LAPS)
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="output directory")
    args = ap.parse_args(argv)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    _, stats = simulate(seed=args.seed, laps=args.laps)
    with tempfile.TemporaryDirectory() as tmp:
        for path, parts in stats["radio"]:
            out = out_dir / Path(path).name
            render(parts, out, Path(tmp))
            print(f"{out}  {out.stat().st_size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
