"""Scripted end-to-end user journey against the running app.

Usage (backend on :8000 started from BACKEND_DIR, frontend on :3000):
    .venv/bin/python scripts/e2e_journey.py --out shots/e2e --backend-dir backend

Covers: demo populates the tower, replay speed + jump to the safety car,
battles suppressed under SC, driver selection and driver page, phone tabs,
backend killed and restarted (browser reconnects from a fresh snapshot), and
a round trip through the real live feed (needs network; skip with --no-live).
It stops and restarts the backend, so don't run it against a session you care about.
"""
import argparse
import os
import signal
import subprocess
import sys
import time

from playwright.sync_api import expect, sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:3000")
ap.add_argument("--out", default="shots/e2e")
ap.add_argument("--backend-dir", default="backend")
ap.add_argument("--no-live", action="store_true", help="skip the real live-feed step")
args = ap.parse_args()
BASE = args.base
OUT = args.out
CLONE_BACKEND = os.path.abspath(args.backend_dir)
PY = sys.executable
os.makedirs(OUT, exist_ok=True)
results = []


def step(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS" if ok else "FAIL"), name, detail, flush=True)


def backend_pid():
    out = subprocess.run(["lsof", "-ti", "tcp:8000", "-sTCP:LISTEN"], capture_output=True, text=True).stdout.split()
    return int(out[0]) if out else None


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))

    # 1. Live page populated from the demo
    pg.goto(BASE + "/")
    expect(pg.locator("tbody tr")).to_have_count(20, timeout=15000)
    step("live tower shows 20 drivers", True)
    pill = pg.get_by_role("status").first.inner_text()
    step("connection pill shows demo", "Demo" in pill, repr(pill))

    # 2. Replay controls: speed + jump to safety car
    pg.get_by_role("link", name="Replay", exact=True).click()
    pg.wait_for_url("**/replay")
    pg.get_by_role("radio", name="5×", exact=True).or_(pg.get_by_role("button", name="5×", exact=True)).first.click()
    pg.get_by_role("button", name="Safety car").first.click()
    pg.wait_for_timeout(1500)
    pg.get_by_role("link", name="Live", exact=True).click()
    pg.wait_for_url(BASE + "/")
    sc = pg.get_by_text("Safety car", exact=True).first
    expect(sc).to_be_visible(timeout=8000)
    step("seek to safety car reflected on live page", True)
    battles = pg.locator("tbody").get_by_text("(battle)").count()
    step("no battle highlights under the safety car", battles == 0, f"{battles} battles")
    pg.screenshot(path=f"{OUT}/e2e_sc_1440.png")

    # 3. Select a driver, then open their page
    row = pg.locator("tbody tr").nth(4)
    code = row.locator("th button span.font-semibold").first.inner_text().strip()
    row.click()
    expect(pg.get_by_role("heading", name=f"Telemetry: {code}")).to_be_visible(timeout=5000)
    step("selecting a row switches telemetry", True, code)
    pg.goto(f"{BASE}/driver/{code}")
    expect(pg.get_by_role("heading", name="Lap times")).to_be_visible(timeout=10000)
    step("driver page renders", pg.title().startswith(code), pg.title())

    # 4. Phone: tabs
    ph = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    ph.goto(BASE + "/")
    expect(ph.locator("tbody tr").first).to_be_visible(timeout=15000)
    ph.get_by_role("tab", name="Map").click()
    expect(ph.locator("figure svg").first).to_be_visible(timeout=5000)
    ph.get_by_role("tab", name="Control").click()
    expect(ph.get_by_label("Race control messages, newest first")).to_be_visible(timeout=5000)
    step("phone tabs: map and race control", True)
    step("phone has no horizontal scroll", ph.evaluate("document.documentElement.scrollWidth") <= 390)

    # 5. Backend dies, comes back: browser reconnects and starts from a fresh snapshot
    pid = backend_pid()
    os.kill(pid, signal.SIGTERM)
    pg.goto(BASE + "/")
    pg.wait_for_timeout(500)
    expect(pg.get_by_text("Reconnecting").or_(pg.get_by_text("Can't reach the backend")).first).to_be_visible(timeout=15000)
    step("backend down is shown clearly", True)
    pg.screenshot(path=f"{OUT}/e2e_backend_down.png")
    proc = subprocess.Popen([PY, "-m", "f1live", "serve"], cwd=CLONE_BACKEND, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    expect(pg.locator("tbody tr")).to_have_count(20, timeout=45000)
    step("browser reconnects and repopulates from a fresh snapshot", True)

    # 6. Settings: switch to the real live feed (no token), then back to the demo
    if args.no_live:
        b.close()
        failed = [r for r in results if not r[1]]
        print(f"\n{len(results) - len(failed)}/{len(results)} steps passed (live step skipped)")
        sys.exit(1 if failed else 0)
    pg.goto(BASE + "/settings")
    pg.get_by_role("radio", name="Live timing").click()
    expect(pg.get_by_role("status").filter(has_text="Live").first).to_be_visible(timeout=30000)
    pg.goto(BASE + "/")
    msg = pg.get_by_text("Car telemetry needs an F1 TV token").first
    expect(msg).to_be_visible(timeout=20000)
    rows = pg.locator("tbody tr").count()
    step("real live feed: timing works, telemetry explains token", rows > 0, f"{rows} rows")
    pg.screenshot(path=f"{OUT}/e2e_live_real.png")
    pg.goto(BASE + "/settings")
    pg.get_by_role("radio", name="Demo race").click()
    pg.goto(BASE + "/")
    expect(pg.locator("tbody tr")).to_have_count(20, timeout=15000)
    step("switch back to demo", True)

    real_errors = [e for e in errors if "Failed to load resource" not in e and "ERR_CONNECTION_REFUSED" not in e and "EventSource" not in e]
    step("no unexpected console errors", not real_errors, str(real_errors[:3]))
    b.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} steps passed")
sys.exit(1 if failed else 0)
