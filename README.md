# F1 Companion

A personal race-day second screen: live timing tower, session status, race control,
per-driver telemetry and a track map, fed by F1's live timing stream — or by a replay of a
recording, a past session via FastF1, or a bundled **synthetic** demo race.

Personal use only. Nothing is hosted, and no F1 data is committed to this repo (the demo
race is generated, with fictional drivers and teams).

```
backend/   Python: ingest (live / replay / FastF1), state store, FastAPI SSE server
frontend/  Next.js (App Router) + Tailwind + TypeScript dashboard
data/demo/ synthetic demo race fixture (generated, committed)
data/recordings/  your own recordings (gitignored)
scripts/   screenshot / layout check tool
```

## Setup

Requirements: Python 3.11+ (tested on 3.13), Node 20+ (tested on 24).

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd frontend && npm install
```

## Run the demo (no network needed)

```bash
# terminal 1 — backend on the demo race (default source)
cd backend && ../.venv/bin/python -m f1live serve

# terminal 2 — dashboard
cd frontend && npm run dev
```

Open http://localhost:3000. The backend starts the demo race at 1× from the grid. Use
**Replay** to change speed (0.5×–30×), pause and seek.

To regenerate the demo fixture: `.venv/bin/python backend/scripts/generate_demo.py`
(`--seed`, `--laps`, `--out`).

### On your phone

Run both servers on all interfaces and open `http://<your-computer-ip>:3000` on the phone
(same Wi-Fi). The dashboard talks to the backend at `<same host>:8000`.

```bash
cd backend && ../.venv/bin/python -m f1live serve --host 0.0.0.0
cd frontend && npm run dev -- -H 0.0.0.0
```

## Run live

```bash
cd backend && F1_SOURCE=live ../.venv/bin/python -m f1live serve
```

or pick **Live timing** on the Settings page. What to expect (tested 2026-11-22, see
DECISIONS.md D1):

- The legacy `/signalr` endpoint described in most guides now returns **401**.
- The client uses F1's current **SignalR Core** endpoint by default (`F1_TRANSPORT=core`).
  Anonymous connections get the timing topics (tower, header, race control, weather), but
  **not** `CarData.z` or `Position.z`, so the telemetry panel and track map explain that a
  token is needed.
- `F1TV_TOKEN=<token>` is sent as `Authorization: Bearer` on negotiate and connect. This is
  the F1 TV subscription token FastF1 also uses. It is **untested** (no subscription was
  available while building), and the app never tries to obtain one.
- `F1_TRANSPORT=legacy` uses the original `/signalr` protocol verbatim.

Reconnects use exponential backoff with jitter; a stalled socket (no frames for 30 s) is
recycled; each reconnect starts from a fresh snapshot.

### Recording

Turn on **Record live sessions** in Settings. While the source is live, every message is
written to `data/recordings/<UTC time>_<session>.jsonl` in the replay format below.
Recordings appear on the Replay page.

## Replay

- **Demo race:** always available.
- **Recordings:** any `.jsonl` / `.jsonl.gz` in `data/recordings/`.
- **FastF1:** year / event / session. FastF1 now needs an F1 TV login for timing data:
  set `F1_USERNAME` and `F1_PASSWORD`, or run
  `.venv/bin/python -m fastf1 auth f1tv --authenticate` once. Without it, loading fails with
  that instruction. Cached under `data/fastf1-cache/` (gitignored).

Command line: `python -m f1live serve --source path/to/file.jsonl.gz`.

### Recording format

JSON Lines, one message per line:

```json
{"t": 12.345, "ts": "2026-03-08T05:00:12.345Z", "topic": "TimingData", "data": {...}}
```

`t` is seconds since the start of the recording and drives replay timing; `ts` is the feed's
UTC timestamp. The full Subscribe snapshot comes first, one line per topic, flagged
`"snapshot": true`. `.z` topics are stored exactly as received (base64 raw-deflate).

## Architecture

```
 sources (swappable)            state                       server            browser
 ─────────────────────         ─────────────────           ─────────         ──────────────
 LiveSource (SignalR) ─┐                                                     EventSource wrapper
 ReplaySource (file)  ─┼─► TapSink ─► StateStore ─► Hub ─► SSE /api/stream ─► snapshot + patches
 FastF1 → messages ───┘   (recorder)  decode .z,          snapshot first,     merged with the
                                       deep merge,        200 ms coalesced     same rules
                                       derived history    patches
```

- `f1live/decode.py` — `.z` decoding; `f1live/merge.py` — deep merge with index-keyed lists.
- `f1live/state.py` + `derive.py` — merged topics, latest car sample/position, lap history,
  circuit outline traced from positions, rolling telemetry and per-lap traces.
- `f1live/sources/` — `live.py` (+`signalr.py`), `replay.py`, `fastf1_*.py`. All implement
  `Source` (`run`, `stop`, `status`) and push `Message`s into a sink; nothing downstream
  knows which source is active.
- `f1live/server.py` — FastAPI. SSE events: `snapshot` (always first on a connection and
  after any reset/seek), `patch` (`{seq, changes}`), `status`.
- `frontend/lib/stream.ts` — reconnecting EventSource; every connection discards state and
  waits for a snapshot.

## Tests

```bash
cd backend && ../.venv/bin/python -m pytest -q
cd frontend && npm test
```

Layout check (both servers running): `.venv/bin/python scripts/screenshot.py --out shots`
(needs `pip install playwright && python -m playwright install chromium`).

## Hosting notes (not deployed)

The ingest process holds a long-lived websocket to F1 and keeps state in memory, and the
browser holds a long-lived SSE connection. That shapes where it can run:

**Always-on host (VM, home server, Fly/Render/Railway machine, a Raspberry Pi):** the
natural fit. Run `python -m f1live serve` under a process manager (systemd, Docker
`restart: unless-stopped`), put it behind a reverse proxy with buffering disabled for
`/api/stream` (nginx: `proxy_buffering off;`; the server already sends
`X-Accel-Buffering: no`), and serve the Next.js build (`next build && next start`) or a
static export. Add authentication in front (the app has none) since it's personal.

**Serverless (Vercel Functions, Lambda, Cloud Run scale-to-zero):** needs a split.
- Function instances are short-lived and not shared, so the ingest websocket can't live in
  a request handler. Run ingest as a separate always-on worker (or a scheduled job during
  sessions) that writes state to a shared store (Redis / Upstash, or a pub/sub channel).
- The SSE endpoint must then read from that store: each function invocation streams
  snapshot + patches from Redis pub/sub, within the platform's max duration (clients
  already reconnect and resync from a snapshot, so a function timeout is just a reconnect).
- In-memory derived history (lap history, traces) would move into the store too.
- The frontend deploys as-is; set `NEXT_PUBLIC_API_URL` to the API origin and restrict CORS
  with `F1_CORS_ORIGINS`.

Either way: keep it private. The F1 feed is for personal use; don't expose it publicly.

## Known limitations

- Live car telemetry and positions need an F1 TV token; the token path is untested.
- FastF1 loading needs an F1 TV login (FastF1's requirement); without it only the error
  message is shown. The converter is tested on a synthetic FastF1-shaped session.
- The track map is traced from car positions, so it appears after a car completes a clean
  lap; no official circuit geometry is bundled.
- Single user, single active source; switching the source affects every open browser.
- No authentication on the API. Bind to `127.0.0.1` (default) unless on a trusted LAN.
