# F1 Companion — Design System

Generated with the **ui-ux-pro-max** skill (`--design-system --density 9 --motion 2 --variance 3`,
plus `style`, `color`, `typography`, `chart` and `ux` domain searches), then adapted for a
second-screen race companion. Tokens live in `frontend/app/globals.css` (`@theme`), so every
value below is available as a Tailwind utility (`bg-surface`, `text-muted`, `text-sector-purple`…).

## Product read

| Question | Answer |
|---|---|
| Product type | Real-time monitoring dashboard (skill result: *Real-Time Monitoring* + *Dark Mode (OLED)*) |
| Context | Glanced at for 1–2 s while the race is on TV; often across a room or on a phone propped up |
| Density | Very high (skill dial 9): 20 drivers × ~10 columns must fit without scrolling at 1440×900 |
| Motion | Minimal (dial 2): data changes, nothing decorative moves |
| Personality | Precise, quiet chrome, loud data |

Rejected from the skill output: its light blue landing-page palette and "exaggerated minimalism"
hero type — both are for marketing pages. The skill's own anti-pattern list says "light mode
default" is wrong here, so the app is **dark only** (see DECISIONS.md D6).

## Color

> **Themes (2026-11-23).** Surfaces, text, accent and selection are now themeable. The
> default is **Broadcast** (carbon `#0a0b0d` / `#121418`, race red `#e10600`, white
> selection marker); Paddock light is the first light theme, so "dark only" below no longer
> holds. A theme is five picked colours and `frontend/lib/theme/themes.ts` derives the rest
> (raised, lines, muted, faint, `on-accent`, `ink`), enforcing the contrast rules in this
> section. New tokens: `on-accent` (text on an accent fill), `select` (selected row/car
> marker, kept apart from the accent so a red accent never reads as "danger"), and `ink`
> (dark text on bright fills such as flag pills and tyre bars). Status, sector, tyre and flag
> colours are not themeable; light themes swap in deeper shades of the same hues. The hex
> tables below describe the original blue-black scheme, now the **Night race** theme.

Base palette follows the skill's *Digital Signage / Kiosk* dark scheme (high contrast for
distance reading), tuned toward blue-black so team colours and sector colours pop.

### Surfaces and text

| Token | Hex | Use | Contrast of `text` on it |
|---|---|---|---|
| `bg` | `#05070D` | Page background | 18.5:1 |
| `surface` | `#0D111C` | Panels, tower | 17.3:1 |
| `raised` | `#161C2B` | Selected row, hover, active tab, inputs | 15.6:1 |
| `line` | `#2A3346` | Hairline dividers (decorative only) | — |
| `line-strong` | `#3D4A63` | Panel borders, table header rule | — |
| `line-control` | `#65728E` | Borders of interactive controls (≥3:1 vs surfaces) | — |
| `text` | `#F3F5F9` | Primary text, all timing numbers | — |
| `muted` | `#A9B3C7` | Secondary labels, column headers | ≥ 8.0:1 everywhere |
| `faint` | `#b8a1a5` | Tertiary text (timestamps, units) | ≥ 5.3:1 everywhere |
| `accent` | `#5CC8FF` | Focus ring, selection, links, primary controls | ≥ 9.0:1 |

Rule: **no text colour below `faint`**. Every listed foreground clears WCAG AA (4.5:1) on all
three surfaces; most clear AAA (7:1).

### Status (connection, alerts)

| Token | Hex | Meaning | Always paired with |
|---|---|---|---|
| `ok` | `#3DDC84` | Live / connected | dot + word "LIVE"/"Connected" |
| `warn` | `#FFB020` | Reconnecting, stale data | ring icon + word |
| `danger` | `#FF5C5C` | Disconnected, error, retired | cross icon + word |

### Sector / lap timing (F1 convention) — never colour alone

| Token | Hex | Meaning | Non-colour cue |
|---|---|---|---|
| `sector-purple` | `#C68AFF` | Fastest overall | `◆` diamond glyph before the time, `aria-label="fastest overall"` |
| `sector-green` | `#3DDC84` | Personal best | `▲` triangle glyph, `aria-label="personal best"` |
| `sector-yellow` | `#FFD43B` | Slower than personal best (sectors only) | no glyph, plain weight; legend explains. In the tower's last-lap column a non-PB lap is plain `text`: yellow on 19 of 20 rows carried no signal (critique, 2026-11-23). |
| (none) | `text` | No time yet | `—` |

Mini-sector segment bars use the same colours **and** different fills: purple = solid, green =
solid with notch, yellow = 50% hatched, pit = outline only.

### Tyre compounds — letter always shown

| Token | Hex | Letter |
|---|---|---|
| `tyre-soft` | `#FF4D4D` | **S** |
| `tyre-medium` | `#FFD12E` | **M** |
| `tyre-hard` | `#F2F2F2` | **H** |
| `tyre-inter` | `#43D66F` | **I** |
| `tyre-wet` | `#4D9AFF` | **W** |
| unknown | `muted` | **?** |

Rendered as a 2px ring in the compound colour with the letter inside in the same colour
(the broadcast convention), age in laps next to it in `muted`.

### Track status flags

| State | Colour | Label |
|---|---|---|
| Green / all clear | `ok`, **outline** pill, 3px band | "Green flag" — the normal state stays quiet so abnormal states stand out |
| Yellow | `flag-yellow` `#FFD43B` | "YELLOW" |
| SC deployed | `flag-yellow` on `raised`, black text badge | "SAFETY CAR" |
| VSC / VSC ending | `flag-yellow` | "VSC" / "VSC ENDING" |
| Red | `flag-red` `#FF5C5C` | "RED FLAG" |
| Chequered | black/white checker swatch | "CHEQUERED" |

Abnormal states get a filled pill, a 10px band, a 10% tint and a 6px left edge stripe on the session header, and a single 600 ms attention fade when the state changes (none under reduced motion). The track status pill is the one place colour floods a background; text on it is `#05070D`
(≥ 9:1 on yellow/green, 6.6:1 on red).

### Team colours

Team colours come from the feed (`TeamColour`). They are **only** used as a 4px vertical bar
beside the driver code, as map dots, and as chart series — never as text colour, because
contrast is not guaranteed.

## Typography

Skill result: *Dashboard Data* pairing — **Fira Sans** (UI, labels, numbers) + **Fira Code**
(timestamps and raw values). Loaded with `next/font/google` (self-hosted at build time, no
runtime request to Google, `display: swap`).

All timing numbers use `font-variant-numeric: tabular-nums` (utility `.num`) so columns don't
jitter as digits change.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `text-micro` | 13 / 18 | 600, sentence case | Units, chip text. Minimum size anywhere. Column headers use 13–14px sentence case. |
| `text-small` | 14 / 20 | 400–500 | Secondary info, race control body |
| `text-body` | 16 / 24 | 400 | Default body; tower cells on phone |
| `text-row` | 17 / 24 | 500 | Tower cells on desktop |
| `text-title` | 20 / 28 | 600 | Panel titles, session name |
| `text-headline` | 28 / 32 | 700 | Lap counter, page titles |
| `text-display` | 44 / 44 | 700 | Speed / gear readouts |

Weights: 400 body, 500 data, 600 labels/titles, 700 headline numbers. No light weights on dark.

## Spacing and layout

4px base grid (skill density 9 → dense scale 4–32px).

| Token | px | Use |
|---|---|---|
| `1` | 4 | Glyph gaps |
| `2` | 8 | Cell padding, touch-target spacing minimum |
| `3` | 12 | Panel inner padding (phone) |
| `4` | 16 | Panel inner padding (desktop), page gutter (phone) |
| `6` | 24 | Gaps between panels, page gutter (desktop) |
| `8` | 32 | Section separation |

- **Tower row height:** 35px desktop, 44px phone (row is a touch target to select a driver).
  Measured: all 20 rows end at ≤ 887px at 1440×900 in green, safety-car and finish states.
  40px was the first target but doesn't fit 20 rows plus chrome in 900px.
- **Breakpoints:** `sm` 390 (design floor), `md` 768, `lg` 1024, `xl` 1440. Nothing may
  scroll horizontally at 390px; the tower drops columns instead (see data density).
- **Live dashboard grid (≥1024px):** tower left (fixed ~ 600px), right column = telemetry +
  track map; race control under the map. **<1024px:** session header, tower first, then
  tabbed panels (Telemetry · Map · Race control · Gaps).
- **Radius:** 6px panels, 4px chips, 999px pills. **Elevation:** none — panels are separated
  by `line-strong` borders, not shadows (shadows are invisible on near-black).
- **z-index scale:** 0 content, 10 sticky headers, 20 tab bar, 40 popovers, 100 toasts.

## Components

### Timing tower row
`[pos] [team bar][CODE] [interval] [gap] [last lap] [best] [S1][S2][S3] [tyre+age] [pits] [status]`
- Position: `text-headline`-ish 20px bold, right aligned, width 2ch.
- Driver code: 600 weight, 3 letters, team bar 4×24px to its left.
- Gaps/intervals: tabular, right aligned, `+1.234` format; leader shows "LEADER"/"LAP n" in `muted`.
- Lapped cars: "+1 LAP".
- In pit: `PIT` chip (outline, `warn`); pit out: `OUT` chip; retired: row at 50% opacity
  with `OUT`/`DNF` chip in `danger` **and** strike-free text (readability).
- Selected row: `raised` background + 2px `accent` left inset.
- Battle (within 1.0s of car ahead): interval cell gets a `warn` outline + "⇢" glyph, label
  "battle" for screen readers.
- Position change: arrow glyph ▲/▼ in `ok`/`danger` for 4 s, no movement animation when
  `prefers-reduced-motion`.

### Panels
`surface` background, 1px `line-strong` border, 6px radius, title row 40px with `text-title`
heading (`h2`) and optional right-aligned meta in `faint`.

### Tabs (phone)
Segmented control in a sticky bar: 44px tall buttons, `role="tablist"`, active tab `raised`
background + `accent` underline + bold label. Labels always text, never icon-only.

### Status pills
Pill = dot/icon + sentence-case `text-micro` label. Connection pill states: `LIVE` (ok, pulsing
dot unless reduced motion), `REPLAY` (accent), `RECONNECTING` (warn, spinner ring),
`OFFLINE` (danger, cross).

### Buttons and inputs
Height 44px (36px allowed only in dense desktop toolbars with 8px spacing), `line-control`
border, `raised` hover, 2px `accent` focus ring with 2px offset (`:focus-visible`). Primary
button: `accent` background with `bg` text (≥ 9:1).

### Gauges (telemetry)
- Speed: `text-headline` number + "km/h" unit (critique: a 44px speed for one car outranked the race order); horizontal bar 0–350.
- Gear: `text-headline` digit in a square, "N" for 0. The live page uses a compact strip (one row of readouts + 30 s chart); the full panel lives on driver pages.
- Throttle / brake: vertical or horizontal bars labelled "THR"/"BRK" with % values; throttle
  `ok`, brake `danger`; DRS: pill "DRS" — outline when available/eligible, filled `ok` when
  open, `faint` when off, text label always present.
- RPM: thin bar with numeric value.

### Charts
- Rolling telemetry (skill: *Streaming Area Chart*): last 30–60 s, SVG, no animation; current
  value always shown as large text next to the chart (skill a11y fallback). Paused while the
  replay is paused.
- Lap/gap trends (skill: *Line Chart*): ≤ 6 series, each with team colour **and** distinct
  dash pattern, direct labels at line ends, gridlines in `line`.
- Every chart has a text summary via `aria-label` / `<figcaption>`.

## Data-density rules

1. Numbers are the content: biggest, brightest, tabular. Labels are `muted` and small.
2. One fact per cell. Units go in headers, not cells.
3. Column drop order at narrow widths (first dropped first): sectors → best lap → pits →
   gap to leader → tyre age. At 390px the tower keeps: pos, driver, interval, last lap, tyre.
4. Never truncate a time. Truncate names, never codes.
5. Empty value = `—` in `faint`, never blank (blank looks like a bug mid-race).
6. Stale data (> 10 s without updates while live) dims the tower header meta and shows a
   `warn` "stale" pill; values stay visible.

## Motion

- Durations 150 ms (state) / 200 ms (panels); ease-out.
- Live updates: a value that changes gets a 600 ms background fade of `raised` → transparent
  ("flash"), nothing slides.
- `prefers-reduced-motion: reduce` → no flashes, no pulsing dot, no transitions; arrows still
  appear (they carry meaning).

## Accessibility checklist

- Contrast ≥ 4.5:1 for all text (table above), ≥ 3:1 for control borders and focus ring.
- Visible `:focus-visible` ring on every interactive element; skip link to main content.
- Touch targets ≥ 44×44 px on phone, ≥ 8 px apart.
- Sector, tyre, flag, connection and battle states all have glyph/letter/word cues.
- Tower is a real `<table>` with `<th scope="col">` headers; selected row exposes
  `aria-selected`.
- Race control feed is an `aria-live="polite"` region (new messages only).
- No information only on hover; tooltips duplicate visible text.
