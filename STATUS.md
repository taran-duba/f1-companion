# Status

_Last updated: 2026-11-23 ~04:30 (in progress — overnight run). Note: the run hit a usage limit around 03:00 and paused until ~03:50._

## Works
- Live feed probe done first (DECISIONS.md D1): legacy `/signalr` is 401; SignalR Core
  serves timing anonymously but withholds `CarData.z` / `Position.z`.
- Backend core: decoder, deep merge, recording format, state store with derived views,
  replay (speed/pause/seek), SSE server, live client (core + legacy), recorder. 76 tests pass.
- Frontend core: SSE wrapper with backoff + snapshot reset, timing tower, session header,
  race control, live page. 14 vitest tests pass.
- End-to-end check: backend replaying the mini test fixture → tower renders at 390/1440,
  no console errors, no horizontal scroll.

- Synthetic demo race: 50 laps, 20 fictional drivers, safety car (laps ~22–26), rain then
  drying, 1–2 stops each, one DNF, blue flags, penalties. 8.2 MB gzipped, deterministic.
- FastF1 converter: reviewed; tested on a synthetic FastF1-shaped session (no F1 TV login here).
- Backend: 103 tests pass.
- Live page against the demo: all 20 tower rows fit at 1440×900; phone layout is tower
  first, then tabs.

## In progress
- Telemetry panel, track map, charts, driver/replay/settings pages (agents, in review).

## Tooling notes
- `web-design-guidelines` skill: **not installed**. Step D will be done manually against
  common web interface guidelines (accessibility, contrast, focus, touch targets).
- `webapp-testing` skill: **not installed**. Step E uses Playwright directly via
  `scripts/screenshot.py` (screenshots at 390 and 1440 + automated overflow, console-error
  and touch-target checks).
- `ui-ux-pro-max`, `frontend-design` and `impeccable` skills are installed and used.
