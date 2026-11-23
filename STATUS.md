# Status — morning report

_Last updated 2026-11-23. The overnight run is finished. Everything is committed;
nothing is deployed._

## TL;DR

- **The app works end to end** on the synthetic demo race, on recordings, and against
  **F1's real live endpoint** (tested: timing, tower, header and race control all work
  without a login).
- **Live car telemetry and the track map need an F1 TV token** in live mode. F1 has locked
  `CarData.z` / `Position.z` (and the old `/signalr` endpoint, and the static archive that
  FastF1 uses). Details in DECISIONS.md D1 and D7. Nothing tries to get around this.
- All design steps A–E ran. Tests: backend 109, frontend 74, plus a 13-step browser
  journey on a fresh clone with the production build. All pass.

Run it: README → "Run the demo". Two terminals, then open http://localhost:3000.

## What works

**Data**
- Live client (SignalR Core by default, legacy `/signalr` selectable). It reconnects with
  backoff and jitter, recycles a stalled socket, skips malformed frames, starts from a fresh
  snapshot on every reconnect, and accepts an optional `F1TV_TOKEN`.
- Decoder for `.z` topics; deep merge with index-keyed list updates.
- Replay at 0.5×–30×, pause and seek. A forward seek applies only the gap. A backward seek
  rebuilds from the start, skipping telemetry samples older than 150 s. Measured on the
  demo: about 1.0 s to mid-race, about 1.9 s across the whole race.
- Recorder writes live sessions in the replay format.
- Synthetic demo race (committed, deterministic): 50 laps, 20 fictional drivers, safety
  car, VSC, rain and drying, 1–2 stops each, a DNF, blue flags, a penalty.
- FastF1 converter and loader. It can't load real data here (needs an F1 TV login) and
  says so clearly.

**Server**
- FastAPI streams to the browser over SSE: a snapshot first, then coalesced patches
  every 200 ms.
- Lap history, the circuit outline, rolling telemetry and per-lap traces are derived
  server-side.
- Shuts down promptly even while browsers are connected (a bug found tonight).

**Dashboard**
- `/`:
  - timing tower with sector colours plus glyphs, tyres with letters and age, pits, PIT, OUT and DNF;
  - session header with track status, weather, and a podium at the finish;
  - marshal-panel flag band;
  - race control;
  - compact live telemetry;
  - track map, gap chart and battles.
  - On phone: tower first, a race-control ticker, sticky tabs, and a selected-driver bar.
- `/driver` and `/driver/[code]`: tyre strategy chart, race order, lap time chart with
  SC shading, sector table, stints, last vs best lap traces.
- `/replay`: sources (demo, recordings, FastF1), transport with a marked seek bar and
  "jump to safety car".
- `/settings`: data source, connection details, token status (never the value), recorder
  switch, how to open it on a phone.

## Design process (as briefed)

| Step | Done with | Output |
|---|---|---|
| A | `ui-ux-pro-max` skill | `DESIGN_SYSTEM.md`, tokens in `frontend/app/globals.css` |
| B | `frontend-design` skill | `DESIGN_PLAN.md` (includes revisions after a self-review) |
| C | `impeccable` skill: critique (two independent assessments, 26/40), fixes, polish | `.impeccable/critique/`; every P0–P2 fixed |
| D | **`web-design-guidelines` not installed**, so a manual audit against standard web interface guidelines | 34 findings; 14 confirmed high/medium plus 3 downgraded-but-real, all fixed |
| E | **`webapp-testing` not installed**, so Playwright directly (`scripts/screenshot.py`) | every page at 390 and 1440, reviewed by eye; 3 fixes confirmed with new screenshots |

## Bugs found by testing, not by tests

These were each found by running the app, not by unit tests:
- **Tower overflow with real data.** A retired car still flagged as in the pit showed two
  status chips and pushed the tower wider than its column. Found against the real live feed.
- **Stale pit-lane gaps out of order.** A pitting car kept a gap smaller than the car ahead
  of it. Found by stepping through the demo.
- **Backend hung on Ctrl+C or SIGTERM while a browser was open.** Uvicorn waited forever
  for the SSE streams. Found by the end-to-end journey.

## Known issues / limitations

- **F1 TV token path is untested.** No subscription was available.
- **22-car grid at 1440×900.** In live mode with the 2026 grid, the last two tower rows
  sit just below the fold. The demo's 20 fit.
- **Race-control lap labels differ by width.** The phone ticker shows "L31"; the full
  feed shows "Lap 31".
- **Pit wording differs by place.** "PIT" in the tower, "In pit" on driver cards.
- **Replay at 768–1024 px.** The page is a single column, so the tower comes after the
  sources panel.
- **No authentication.** The backend binds to 127.0.0.1 by default. See README before
  using `--host 0.0.0.0`.
- **Two Retry buttons when the backend is down.** One next to the header pill, one in the
  card. Harmless, slightly redundant.
- **Overnight hiccup.** A usage limit paused the run twice. One polish workflow resumed by
  itself while I had restarted it, so two polish passes ran on the same files at once. Both
  passed their verifiers, and the merged result was re-tested before committing.
- **Impeccable update skipped.** The skill offered an update (v4.0.2 → v4.10.0). I didn't
  apply it because you asked me not to stop for questions. `npx impeccable update` if wanted.

## What I'd do next

1. Try `F1TV_TOKEN` during a real session. If telemetry arrives, check the map and
   telemetry panels against real data rates.
2. Record a real race weekend with the recorder and replay it, especially qualifying
   (different gap fields) and a red-flag restart. The demo doesn't cover those.
3. Fit 22 rows at 900px height: a denser row variant when the field is over 20, or a
   collapsible session header.
4. Optional URL state for the selected driver (`/?driver=PEM`) so a phone and a laptop can
   share a view.
5. If hosting: follow the README's always-on notes. Run ingest under systemd or Docker,
   put the API behind a reverse proxy with buffering off, and add auth.
