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
**Replay** to change speed (0.5×–30×), pause and seek (Space plays/pauses, ←/→ jump 10 s;
"Jump to" buttons go straight to the safety car and VSC periods).

For a production build of the dashboard: `cd frontend && npm run build && npm start`.

Keyboard on the live page: Tab into the timing tower, then ↑/↓ or j/k move the selected
driver; Home/End jump to the leader/last car.

### Making it yours (Settings)

Everything here is saved in the browser (localStorage), per device.

- **Themes.** Broadcast (default: carbon and race red), Paddock light, Night race, Ember and
  seven team-livery-inspired themes. The palette button in the top bar switches them and
  turns the background art off / subtle / bold. **Make your own** picks five colours (page,
  panels, text, accent, selection) and previews them on the whole app; everything else is
  derived (`frontend/lib/theme/themes.ts`) and nudged to stay readable, with contrast checks
  shown. Tyre, sector and flag colours keep their meaning in every theme (deeper shades on a
  light page).
- **Favourites.** Star drivers or whole teams (Settings, the star next to "Following", or a
  driver page). Their rows carry the team colour in the tower, they're followed first when a
  session starts, and they decide who "favourites" alerts are about.
- **TV delay.** While the source is live, hold everything back N seconds (0–300) so the tower,
  flags, radio and alerts line up with your broadcast instead of spoiling it. The "Sync" chip
  appears in the top bar in live mode. Replays are never delayed.
- **Alerts.** Overtakes, pit stops (with the tyre change), fastest lap, flags and safety cars,
  stewards' decisions, retirements and team radio, each set to off / favourites / everyone.
- **Tower.** Click the Interval header to swap between interval and gap to the leader. A ±
  column shows places gained since the start, and the fastest-lap holder gets an FL badge.
  In qualifying the tower shows Q1/Q2/Q3, a cut line, the drop zone and who's out.
- **Team radio.** A Team radio tile (in the Pit wall layout) and radio alerts with a play
  button. Clips come through the backend (`GET /api/radio?path=TeamRadio/…`): from
  `data/demo/radio/` for the demo, or F1's static archive for live sessions (sent with your
  F1 TV token when one is set). The demo's clips are synthetic voices reading invented lines.

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

or pick **Live timing** from the source chip (top right). What to expect (tested 2026-11-22, see
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

Turn on **Record live sessions** in the source panel (Live tab). While the source is live, every message is
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
cd backend && ../.venv/bin/python -m pytest -q     # 109 tests
cd frontend && npm test                             # 74 tests
```

Backend tests cover the `.z` decoder, deep merge (index-keyed lists, `_deleted`), replay
timing (fake clock: speed, pause, seek, end), the store's deltas, reconnect-from-snapshot
(live client against a fake SignalR server, and the SSE hub), the recorder round trip, the
FastF1 converter on a synthetic session, the demo fixture, and an end-to-end test that runs
the real server on the demo and reads the SSE stream. Frontend tests cover the TypeScript
merge (mirrors the Python one), the reconnecting EventSource wrapper (backoff, snapshot
reset, stale patches), timing/battle rules, charts, telemetry buffering and the map.

Browser checks (both servers running; `pip install playwright && python -m playwright
install chromium` first):

- `.venv/bin/python scripts/screenshot.py --out shots` — every page at 390 and 1440 px,
  flags horizontal overflow, console errors and touch targets under 44 px.
- `.venv/bin/python scripts/e2e_journey.py --out shots/e2e` — a scripted user journey:
  replay controls, safety car, driver pages, phone tabs, backend killed and restarted
  (the browser recovers from a fresh snapshot) and a round trip through the real live feed
  (`--no-live` to skip). It restarts the backend.

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
- The tower fits 20 cars at 1440×900. The 2026 grid has 22, so in live mode the last two
  rows sit just below the fold on that screen size.
- The demo can't reproduce everything the real feed does (e.g. qualifying sessions, red
  flags with restarts); those paths are only tested with unit tests.
- No authentication on the API. Bind to `127.0.0.1` (default) unless on a trusted LAN.
