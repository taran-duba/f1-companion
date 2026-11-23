# Decisions

Defaults chosen while working unattended. Newest at the bottom.

## D1 — Live feed access test (2026-11-22, ~23:00 ET, no live session running)

Probed without any credentials, using only the documented protocol:

| Request | Result |
|---|---|
| `GET /signalr/negotiate?connectionData=[{"name":"Streaming"}]&clientProtocol=1.5` (with and without `User-Agent: BestHTTP`, `Accept-Encoding: gzip,identity`) | **HTTP 401**, `WWW-Authenticate: Basic realm="Authentication"` and `WWW-Authenticate: Bearer`. No ConnectionToken issued. |
| `GET /signalr/connect?transport=webSockets&clientProtocol=1.5` | **HTTP 401** |
| `GET /static/2024/Index.json`, `/static/2026/Index.json`, per-session `.json`/`.jsonStream` archive files | **HTTP 401** (only `/static/StreamingStatus.json` is public: `{"Status":"Offline"}`) |
| `POST /signalrcore/negotiate?negotiateVersion=1` | **HTTP 200**, ConnectionToken issued |
| `wss://livetiming.formula1.com/signalrcore?id=<token>` + JSON hub handshake + `Subscribe([...all 12 topics...])` | Connects. Snapshot contains `Heartbeat, SessionInfo, SessionStatus, TrackStatus, WeatherData, LapCount, DriverList, TimingData, TimingAppData, RaceControlMessages`. **`CarData.z` and `Position.z` are silently omitted** (no error, just absent). |
| FastF1 3.9.2 `get_session(2024,'Bahrain','R').load()` | Every livetiming request fails; FastF1 logs "Failed to authenticate with Formula 1 account … Set F1_USERNAME and F1_PASSWORD". Timing, car and position data all unavailable. |

**Conclusion:** the legacy `/signalr` endpoint in the brief now requires
authentication. The current SignalR Core endpoint serves the low-frequency
timing topics anonymously but gates the high-frequency `CarData.z` and
`Position.z` channels behind an F1 TV subscription token (FastF1 confirms the
mechanism: it sends the F1 TV `subscriptionToken` as `Authorization: Bearer`).

**Decision:**
- Replay mode + demo fixture are the primary, fully working path.
- The live client implements both transports. `F1_TRANSPORT=core` (default)
  uses SignalR Core, which is F1's current public endpoint and serves exactly
  what F1 chooses to serve anonymously — this is not a workaround: the gated
  topics stay gated. `F1_TRANSPORT=legacy` implements the brief's `/signalr`
  protocol verbatim and will 401 without a token.
- Optional `F1TV_TOKEN` env var: when set it is sent as
  `Authorization: Bearer <token>` on negotiate and connect. Untested — I don't
  have a subscription. Nothing tries to obtain a token automatically.
- Without a token, live mode shows timing tower, header, race control and
  weather; telemetry and track map show an explicit "requires F1 TV token"
  state instead of blank panels.
- FastF1 loading is implemented, but it needs FastF1's own F1 TV login
  (`F1_USERNAME`/`F1_PASSWORD` or `python -m fastf1 auth f1tv --authenticate`).
  Its failure is reported in the UI with that instruction. The converter is
  tested against a synthetic FastF1-shaped session object.

## D2 — Recording format
JSON Lines, `{"t": float seconds from start, "ts": ISO UTC, "topic", "data"}`,
snapshot lines first flagged `"snapshot": true`. `.z` payloads are stored
raw (as received) so replay exercises the real decoder. `.jsonl.gz` is
accepted everywhere; the demo fixture is committed gzipped to keep the repo
small.

## D3 — Default data source
The backend starts on the demo fixture so every screen is populated on first
run. `F1_SOURCE=live` (or the Settings page) switches to live.

## D4 — Browser → backend addressing
The frontend connects straight to the FastAPI server (no Next.js proxy, which
can buffer SSE). Base URL is `NEXT_PUBLIC_API_URL` if set, otherwise
`<page protocol>//<page hostname>:8000`, so opening the dashboard from a phone
on the same LAN works without configuration. The server binds `127.0.0.1` by
default; `--host 0.0.0.0` is required for phone use (documented).

## D5 — SSE payload
On connect the server sends one `snapshot` event (full public state), then
`patch` events coalesced every 200 ms (`{seq, changes: {topic: delta}}`),
plus `status` events. Raw `.z` payloads never go to the browser: the server
decodes them and publishes only the latest sample per car (`CarData`,
`Position`). History (lap times, telemetry traces) is derived server-side
and exposed through the same state or REST endpoints.

## D6 — Dark only, Fira type
The design system (ui-ux-pro-max) flags light-mode default as an anti-pattern
for a real-time monitoring product, and a second screen next to a TV is
usually in a dim room. The app ships one dark theme; no theme toggle.
Fonts are Fira Sans + Fira Code via `next/font/google`, which downloads
them at build time and serves them locally (no runtime Google requests).
