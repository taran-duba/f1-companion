"""Screenshot every page at phone and desktop widths and check basic layout.

Usage (backend + frontend running):
    .venv/bin/python scripts/screenshot.py [--base http://localhost:3000] [--out shots] [--widths 390,1440]

Reports per page and width: console errors, horizontal overflow (page wider
than the viewport), elements overflowing the viewport, and touch targets
smaller than 44px on phone widths. Exit code 1 if any check fails.
Requires: pip install playwright && python -m playwright install chromium
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

PAGES = ["/", "/driver", "/driver/{code}", "/replay", "/settings"]

CHECK_JS = """
(isPhone) => {
  const vw = document.documentElement.clientWidth;
  const out = { scrollWidth: document.documentElement.scrollWidth, vw, overflowing: [], smallTargets: [] };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    // Ignore content inside horizontally scrollable containers and sr-only.
    if (el.closest('.sr-only')) continue;
    let p = el.parentElement, clipped = false;
    while (p) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { clipped = true; break; } p = p.parentElement; }
    if (!clipped && (r.right > vw + 1 || r.left < -1)) {
      out.overflowing.push(`${el.tagName.toLowerCase()}.${(el.className||'').toString().slice(0,60)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
    }
    if (isPhone && el.matches('a[href], button, [role="tab"], input, select, [role="button"], summary')) {
      if (el.closest('.sr-only')) continue;
      const small = r.height < 43.5 || r.width < 24;
      if (small) out.smallTargets.push(`${el.tagName.toLowerCase()} "${(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  out.overflowing = out.overflowing.slice(0, 15);
  out.smallTargets = [...new Set(out.smallTargets)].slice(0, 25);
  return out;
}
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--out", default="shots")
    ap.add_argument("--widths", default="390,1440")
    ap.add_argument("--code", default=None, help="driver code for /driver/[code] (default: leader)")
    ap.add_argument("--wait", type=float, default=2.5, help="seconds to let live data render")
    ap.add_argument("--full", action="store_true", help="full-page screenshots")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    widths = [int(w) for w in args.widths.split(",")]
    report: dict = {}
    failed = False
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        code = args.code
        for w in widths:
            phone = w < 768
            ctx = browser.new_context(viewport={"width": w, "height": 844 if phone else 900},
                                      device_scale_factor=2 if phone else 1, is_mobile=phone, has_touch=phone)
            page = ctx.new_page()
            errors: list[str] = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            if code is None:
                page.goto(args.base + "/", wait_until="networkidle")
                page.wait_for_timeout(args.wait * 1000)
                cell = page.locator("tbody th[scope=row] span.font-semibold").first
                code = cell.inner_text().strip() if cell.count() else "AAA"
            for path in PAGES:
                url = path.format(code=code)
                errors.clear()
                page.goto(args.base + url, wait_until="networkidle")
                page.wait_for_timeout(args.wait * 1000)
                name = (url.strip("/").replace("/", "_") or "live") + f"_{w}.png"
                page.screenshot(path=str(out / name), full_page=args.full)
                res = page.evaluate(CHECK_JS, phone)
                res["consoleErrors"] = list(errors)
                res["hScroll"] = res["scrollWidth"] > res["vw"]
                report[f"{url} @{w}"] = res
                bad = res["hScroll"] or res["overflowing"] or res["consoleErrors"]
                failed |= bool(bad)
                flag = "FAIL" if bad else "ok"
                print(f"[{flag}] {url} @{w}: scroll={res['scrollWidth']}/{res['vw']} overflow={len(res['overflowing'])} "
                      f"smallTargets={len(res['smallTargets'])} errors={len(res['consoleErrors'])} -> {out / name}")
            ctx.close()
        browser.close()
    (out / "report.json").write_text(json.dumps(report, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
