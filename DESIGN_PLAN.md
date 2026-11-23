# F1 Companion — Design Plan

Written with the **frontend-design** skill, inside the constraints of `DESIGN_SYSTEM.md`.
Where this plan changes the design system, the change is listed in "Review against the brief"
and the tokens were updated to match.

## Subject, audience, job

- **Subject:** live Formula 1 timing — the same data the pit wall and the TV timing tower show.
- **Audience:** one person, watching the race on TV, glancing at a laptop or a phone propped
  against it. Hands are usually not on the device.
- **Primary job:** answer "who is where, how far apart, on what tyres, and what just happened?"
  in under two seconds of looking.

## The one bold thing: the marshal-panel frame

Trackside, marshals signal with LED panels that flood a whole rectangle with colour. The
dashboard borrows that: **the page frame is the flag**. A 6px band runs across the top of every
page (and down the left edge of the session header on desktop) in the current track-status
colour — green, yellow, Safety Car yellow with a black chevron pattern, VSC yellow with dashed
pattern, red, or a chequered pattern at the finish. A text label ("Safety car", "Red flag")
always sits next to it in the session header, so colour is never the only signal.

This is the single loud element. Everything else is quiet: no gradients, no glows, no shadows,
no decorative motion. When the flag changes, the band is the one thing that visibly changes
state across the whole screen, which is exactly the moment a viewer should look over.

## Tokens (from DESIGN_SYSTEM.md, condensed)

| Name | Hex | Role |
|---|---|---|
| Night | `#05070D` | page |
| Panel | `#0D111C` | tower and panels |
| Raised | `#161C2B` | selected row, active tab, inputs |
| Chalk | `#F3F5F9` | numbers and primary text |
| Slate | `#A9B3C7` | labels |
| Signal | `#5CC8FF` | focus, selection, primary action — used sparingly |

Plus the functional sets (sector, tyre, flag, status), which carry meaning and are always
paired with a glyph, letter or word.

**Type:** Fira Sans for everything readable (tabular numerals on), Fira Code only for
timestamps in the race control log. Two families with clearly different jobs: proportional for
reading, fixed for the time column.

## Layout concepts

### Live dashboard `/` — desktop (≥ 1024px, designed at 1440)

Tower first and largest; the right column holds what you check second.

```
██████████████████████████████ flag band (track status colour) ████████████████████████████
┌ Session header ──────────────────────────────────────────────────────────────────────────┐
│ Harbourline GP · Race      Lap 23 / 50      ▌Green       Air 24° Track 36° Dry    ● Live │
└──────────────────────────────────────────────────────────────────────────────────────────┘
┌ Timing tower (≈ 760px) ─────────────────────────┐ ┌ Selected driver: telemetry ────────┐
│ Pos Driver   Int     Gap     Last     Best   S1 S2 S3  Tyre  Pit│ │ 287 km/h  7  ▮▮▮▮ THR  ▯ BRK  DRS │
│  1 ▌NOR   Leader  Lap 23  1:21.334 1:20.9 ◆  ▲  –   (M) 12  1 │ │ rolling 30s speed/throttle/brake │
│  2 ▌VAL   +0.812  +0.812  1:21.502 ...                          │ └──────────────────────────────────┘
│  …                                                              │ ┌ Track map ─────────────────────┐
│ 20 ▌KOS   +1 lap  ...                                           │ │   circuit outline + car dots   │
└─────────────────────────────────────────────────┘ │   selected car ringed, labelled  │
                                                       └──────────────────────────────────┘
                                                       ┌ Race control (newest first) ──────┐
                                                       │ 14:32:10  L23  Yellow in sector 2 │
                                                       └──────────────────────────────────┘
```

Alignment: everything left-aligned except numeric columns, which are right-aligned so decimal
points line up. The tower never scrolls at 1440×900.

### Live dashboard `/` — phone (390px)

Tower first, the rest behind tabs (brief requirement). The tower keeps the five columns that
answer the primary job.

```
██████ flag band ██████
Harbourline GP   Lap 23/50
▌Green  24°/36° Dry  ● Live
┌──────────────────────────┐
│ P  Driver  Int    Last  T│
│ 1 ▌NOR   Leader 1:21.3 M│  44px rows, tap = select
│ 2 ▌VAL   +0.812 1:21.5 M│
│ …                        │
└──────────────────────────┘
[Driver][Map][Control][Gaps]   sticky segmented tabs, 44px
┌ active tab panel ────────┐
└──────────────────────────┘
```

### Driver detail `/driver/[code]`

A single driver's race as a story: header with code, name, team bar, position, tyre; then lap
chart (lap time per lap, pit laps marked, compound shown as a strip under the x-axis), stint
bar, sector table (lap × S1/S2/S3 with best-per-column marked ◆/▲), and telemetry traces
(last lap vs best lap overlay, speed/throttle/brake vs distance). Desktop: two columns (charts
left, table right). Phone: stacked, table last, table scrolls inside its own panel vertically
only.

### Replay `/replay`

A control room for playback. Source picker (Demo race · Recordings · FastF1 session) as three
clearly labelled sections; below, a transport bar: play/pause (44px), speed segmented control
(1×, 2×, 5×, plus 10× / 30× for skimming), and a full-width seek slider with lap ticks and the
safety-car window shaded. Keyboard: Space toggles play, ←/→ seeks 10s. The live tower stays
visible below the transport in a compact form so you can see seeks take effect.

### Settings & status `/settings`

Plain, form-like, left-aligned single column (max 720px): Data source (radio cards: Demo,
Recording, Live, FastF1), Connection (state, transport, last message, reconnect count, missing
topics), F1 TV token (present / not set — never the value — with what it unlocks), Recorder
(switch + current file + bytes), and a "Why is telemetry missing?" explanation when live
without a token.

### Shared chrome

Top bar on every page: wordmark "F1 Companion" (text, no logo), nav links (Live · Driver ·
Replay · Settings) and the connection pill. On phone the nav collapses to the four links in a
row below the wordmark (all four fit at 390px as text) — no hamburger, since there are only
four destinations.

## Principles

1. **Numbers are the interface.** Times, gaps and positions are the biggest, brightest
   things on screen. Chrome recedes.
2. **The frame is the flag.** Track status gets the only full-width colour; nothing else
   competes with it.
3. **Change, not motion.** A changed value gets a brief background fade; rows never slide;
   reduced-motion turns even that off.
4. **Every colour has a word.** Sectors have ◆/▲, tyres have letters, flags have names,
   connection has a label.
5. **Graceful absence.** Missing data renders as `—` or an explanatory empty state ("Car
   telemetry needs an F1 TV token in live mode"), never as an empty box.

## Review against the brief (and what changed)

| Check | Result |
|---|---|
| Tower first at 390px, other panels in tabs | Yes — tabs below tower. |
| Legibility at a distance beats decoration | Rows 40/44px, 17px numerals, no decoration besides the flag band. |
| Tabular numerals, strong contrast | `.num` everywhere numbers appear; all text ≥ 5:1. |
| Never colour alone | Glyphs/letters/labels for sectors, tyres, flags, battles, status. |
| Reduced motion | Flash and pulse disabled; no layout animation exists. |
| Works with live, replay and demo identically | All pages read the same state; source only appears in the status pill and on Settings/Replay. |

**Revisions made after reviewing the first draft for generic defaults:**

1. *Tracked-out all-caps labels everywhere* (DESIGN_SYSTEM.md had `label-micro` uppercase on
   every column header). That's template chrome. **Changed:** column headers and panel titles
   use sentence case at 13–14px in Slate, weight 600. Uppercase is kept only where the sport
   itself uses it: three-letter driver codes and tyre letters.
2. *"Near-black with a single acid accent"* — the first draft leaned on the cyan Signal colour
   for headers, active nav, chart lines and pills. **Changed:** Signal is reserved for focus,
   selection and the primary action; charts use team colours, nav uses weight + underline.
3. *Identical rounded cards for every panel.* **Changed:** the tower is not a card; it sits
   flush on the page with only row rules, because it's the primary object. Secondary panels
   get a border. Radii: 6px for panels, 4px chips, round only for the tyre and status dot.
4. *Mono for all small data.* **Changed:** mono only for race-control timestamps; times and
   gaps use Fira Sans tabular figures, which read better at distance.
5. *Middle-dot meta strings* in the header draft. **Changed:** the session header uses
   separate labelled cells ("Lap 23 of 50", "Air 24°", "Track 36°", "Dry") instead of one
   dotted string.

## Copy

Plain, sentence case, user words: "Safety car" not "SCDeployed"; "Reconnecting in 4 s" not
"WS error"; "Car telemetry needs an F1 TV token in live mode. Timing still works." Buttons say
what they do: "Play demo race", "Load session", "Start recording".
