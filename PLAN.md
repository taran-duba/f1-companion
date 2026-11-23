# F1 Companion — Plan

Personal race-day companion: live F1 timing dashboard fed by F1's live timing
stream, with replay of recordings, FastF1 sessions and a synthetic demo race.

## Milestones (executed in order)

### M0 — Live feed check (done first)
- Probe `livetiming.formula1.com` negotiate/connect without credentials.
- Record exactly what works and what fails in DECISIONS.md and STATUS.md.

### M1 — Replay pipeline and demo fixture
- Recording format: JSON Lines, one message per line:
  `{"t": <seconds since recording start, float>, "ts": "<ISO-8601 UTC>", "topic": "<Topic>", "data": <payload>}`.
  First lines are the full Subscribe snapshot (one line per topic, `"snapshot": true`).
  `.z` topics are stored exactly as received (base64 raw-deflate string).
  `.jsonl` and `.jsonl.gz` are both readable.
- Decoder for `.z` topics (base64 + raw deflate, wbits=-15).
- Deep-merge with index-keyed list handling.
- Replay source: 1x/2x/5x (plus any float), pause, seek (checkpointed state).
- Recorder that writes live messages in the same format.
- Synthetic demo generator: 20 fictional drivers, full race distance, pit
  stops, a safety car, weather change (dry → rain → drying), race control
  messages, car telemetry and positions on a synthetic circuit.
  Generator + its output committed as the demo fixture.
- FastF1 loader converting a past session into the same message format.
- Tests: decoder, merge, replay timing, reconnect-from-snapshot.

### M2 — Backend and state
- `f1live.state.StateStore`: topic dict, merge, derived views (lap history,
  stints, gaps history, track outline, rolling telemetry), versioned snapshot.
- Sources behind one interface: `live`, `replay` (file / demo), `fastf1`.
- Live client: legacy SignalR and SignalR Core transports, backoff, malformed
  message tolerance, optional `F1TV_TOKEN`.
- FastAPI server: SSE `/api/stream` (snapshot then coalesced patches),
  control endpoints for source, replay and recorder.

### M3 — Design system (Step A)
- ui-ux-pro-max → `DESIGN_SYSTEM.md` + Tailwind theme tokens.

### M4 — Timing tower and live page
- Next.js App Router + Tailwind + TypeScript in `frontend/`.
- EventSource wrapper with backoff reconnect, snapshot-reset, status indicator.
- Timing tower, session header, race control feed on `/`.
- Design plan (Step B) → `DESIGN_PLAN.md`.

### M5 — Remaining pages and features
- Telemetry panel, track map, `/driver/[code]`, `/replay`, `/settings`.
- Nice-to-haves: gap chart, strategy view, battle highlighter.

### M6 — Design review (Steps C–E)
- impeccable critique → fix → polish.
- Web interface guidelines audit → fix high/medium.
- Playwright screenshots at 390px and 1440px for every page, fix, re-shoot.

### M7 — Final end-to-end test
- Full test suites, build, run against demo fixture, README, STATUS.md.

After each milestone: run tests, load the app against the demo fixture, fix
what's broken, update STATUS.md, commit.
