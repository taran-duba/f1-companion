# Setup guide

F1 Companion runs on your own machine with your own credentials. Nothing is hosted, and no
account or key is built in. You need credentials only for the live-data features below.

## What needs credentials

| You want | You need |
|---|---|
| The demo race, replays of your recordings | Nothing |
| Live timing tower, race control, weather | Nothing |
| Live car telemetry and the track map | An F1 TV token (`F1TV_TOKEN`) |
| Replaying past sessions through FastF1 | An F1 TV login (`F1_USERNAME` / `F1_PASSWORD`) |

F1 TV credentials come from an F1 TV subscription you hold. This project never creates,
shares or bypasses one. The live-telemetry token path is untested by the author (no
subscription was available), so please report what you find.

## 1. Install

Requirements: Python 3.11+ and Node 20+.

```bash
git clone <your-fork-or-this-repo-url> f1-companion
cd f1-companion

python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt

cd frontend && npm install && cd ..
```

On Windows, use `.venv\Scripts\python` and `.venv\Scripts\pip` in place of `.venv/bin/...`.

## 2. Run the demo

The demo is a synthetic race with fictional drivers. It needs no network and no credentials.

```bash
# terminal 1: backend (http://127.0.0.1:8000)
cd backend && ../.venv/bin/python -m f1live serve

# terminal 2: dashboard (http://localhost:3000)
cd frontend && npm run dev
```

Open http://localhost:3000. If the race plays, the install is good.

## 3. Add your credentials

Pick one of these. All of them stay on your machine.

### Option A: a `.env` file (recommended)

```bash
cp .env.example .env
```

Edit `.env` and uncomment what you need:

```bash
F1_SOURCE=live            # start in live mode instead of the demo
F1TV_TOKEN=eyJ...         # live telemetry and track map
F1_USERNAME=you@example.com   # FastF1 past sessions
F1_PASSWORD=your-password
```

Restart the backend. The backend reads `.env` from the repo root at startup. A variable
already set in your shell wins over the file. `.env` is gitignored.

Next.js reads its own settings from `frontend/.env.local`, not the root `.env`. You only need
that file if the backend isn't at `<same host>:8000`:

```bash
echo 'NEXT_PUBLIC_API_URL=http://localhost:8000' > frontend/.env.local
```

### Option B: enter them in the dashboard

Open the source panel (the source chip at the top right) and use the F1 TV section:

- **Sign in** with your F1 account email and password. The backend exchanges them for a
  token and keeps only the token. The password is never stored.
- **Or paste a token** you already have.

The token is saved to `data/credentials.json` (file mode 0600, gitignored) and is never sent
back to the browser. The panel only shows whether one is set. A token in `F1TV_TOKEN` wins
at startup until you save one from the dashboard.

### FastF1 past sessions

FastF1 needs an F1 TV login. Either set `F1_USERNAME` and `F1_PASSWORD` as above, or run this
once:

```bash
.venv/bin/python -m fastf1 auth f1tv --authenticate
```

Downloaded data is cached in `data/fastf1-cache/` (gitignored).

## 4. Run live

```bash
cd backend && F1_SOURCE=live ../.venv/bin/python -m f1live serve
```

Or choose **Live timing** from the source chip. Live feeds only exist during a session, so
use the demo or a recording when nothing is running.

To keep a copy, turn on **Record live sessions** in the source panel. Recordings land in
`data/recordings/` and show up on the Replay page. They are gitignored, so don't commit F1 data.

## 5. Use it on your phone

Put your phone on the same Wi-Fi, run both servers on all interfaces, and open
`http://<your-computer-ip>:3000`:

```bash
cd backend && ../.venv/bin/python -m f1live serve --host 0.0.0.0
cd frontend && npm run dev -- -H 0.0.0.0
```

The API has no authentication. Only do this on a network you trust.

## Settings reference

All optional. Set them in `.env` or your shell.

| Variable | Default | Purpose |
|---|---|---|
| `F1_SOURCE` | `demo` | Starting source: `demo`, `live`, or a `.jsonl[.gz]` path |
| `F1TV_TOKEN` | none | F1 TV token for live telemetry, positions and radio clips |
| `F1_USERNAME`, `F1_PASSWORD` | none | F1 TV login for FastF1 |
| `F1_TRANSPORT` | `core` | `core` (current SignalR Core) or `legacy` |
| `F1_CORS_ORIGINS` | `*` | Comma-separated origins allowed to call the API |
| `F1_RECORDINGS_DIR` | `data/recordings` | Where recordings are written and read |
| `F1_CREDENTIALS_FILE` | `data/credentials.json` | Where a dashboard-saved token lives |
| `F1LIVE_FASTF1_CACHE` | `data/fastf1-cache` | FastF1 cache directory |
| `F1_DEMO_FILE` | `data/demo/demo_race.jsonl.gz` | Demo fixture |
| `NEXT_PUBLIC_API_URL` | `<same host>:8000` | Backend origin (frontend, `frontend/.env.local`) |

## Keeping secrets out of git

`.env`, `data/credentials.json`, `data/recordings/` and `data/fastf1-cache/` are all in
`.gitignore`. Before you push a fork, run `git status` and confirm none of them appear. If
you ever commit a token, revoke it (sign out of F1 TV or change your password) and then
remove it from history. Deleting the file in a later commit isn't enough.

## Troubleshooting

- **Dashboard says it can't reach the backend.** Check the backend terminal is running and
  that the API is at `<same host>:8000`. Otherwise set `NEXT_PUBLIC_API_URL` in
  `frontend/.env.local` and restart `npm run dev`.
- **`ModuleNotFoundError: No module named 'f1live'`.** Run the backend from the `backend/`
  directory, as in the commands above.
- **Telemetry and track map say they need a token.** You are in live mode without
  `F1TV_TOKEN`. Add it (step 3) and restart, or switch to the demo.
- **Live connects but there is no timing.** No session is running. Try the demo.
- **FastF1 says it needs a login.** Set `F1_USERNAME` and `F1_PASSWORD`, or run the
  `fastf1 auth` command above.
- **Changed `.env` and nothing happened.** Restart the backend. A variable already exported in
  your shell overrides `.env`.

## Tests

```bash
cd backend && ../.venv/bin/python -m pytest -q
cd frontend && npm test
```
