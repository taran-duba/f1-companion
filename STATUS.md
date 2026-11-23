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

- All pages built and independently reviewed (M5): telemetry panel with rolling chart,
  track map traced from positions, gap chart + battle list, strategy view, lap time chart,
  /driver overview, /driver/[code], /replay with marked seek bar, /settings.
  Backend 105 tests, frontend 63 tests, `next build` passes.
- Fixed after review: phone overflow on the live page (grid column min width), pit-in laps
  showing the new compound, partial laps saved as "best" telemetry trace after a seek.

- Design Step C: impeccable critique (dual-agent, 26/40, snapshot in `.impeccable/critique/`).
  All P0–P2 findings fixed: race control moved to the top of the right column, phone ticker,
  sticky tabs, selected-driver bar, quiet green / loud abnormal flag frame, battles only when
  racing, neutral last-lap colour, compact live telemetry, 12px glyph minimum, a11y names.
- Real live feed checked end-to-end (DECISIONS.md D7): works without a token for timing;
  found and fixed a tower overflow that only real data triggered.

- Design Step C: impeccable polish done (three areas, two independent verifiers). Notable:
  one-tab-stop tower with arrow/j/k navigation, no false position arrows after seeks,
  stale pit-lane gaps hidden, "Retry now" when the backend is down, purple fastest-lap
  traces, SC shading on lap charts. Frontend 73 tests, backend 108 tests, build passes,
  10/10 page×width layout checks clean.
- A usage limit interrupted the polish run once; it resumed on its own while I had
  restarted it, so two polish passes ran concurrently. Both finished, both verifiers passed,
  and the merged result was rechecked before committing.

## In progress
- Design Step D: web interface guidelines audit (manual; skill not installed).

## Tooling notes
- `web-design-guidelines` skill: **not installed**. Step D will be done manually against
  common web interface guidelines (accessibility, contrast, focus, touch targets).
- `webapp-testing` skill: **not installed**. Step E uses Playwright directly via
  `scripts/screenshot.py` (screenshots at 390 and 1440 + automated overflow, console-error
  and touch-target checks).
- `ui-ux-pro-max`, `frontend-design` and `impeccable` skills are installed and used.
- Impeccable reported an update (v4.0.2 → v4.10.0). Not applied: you asked me not to stop for
  questions, and the update only takes effect next session. Run `npx impeccable update` if wanted.
