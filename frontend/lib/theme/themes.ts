/**
 * Themes: built-in presets and custom themes. A theme is five picked colours; everything
 * else (raised surfaces, hairlines, muted text, readable text on the accent, the light or
 * dark set of status/sector/tyre colours) is derived, so a custom theme can't produce an
 * unreadable tower. No React here: ThemeProvider applies the result as CSS variables.
 */

import { contrast, ensureContrast, isHex, isLight, mix, rgbList } from "./color";

export interface ThemeInput {
  /** Page background. */
  bg: string;
  /** Panels and tiles. */
  surface: string;
  /** Primary text and timing numbers. */
  text: string;
  /** Brand colour: buttons, focus ring, links, the logo. */
  accent: string;
  /** Marker on the selected row and car. */
  select: string;
}

export interface Theme {
  id: string;
  name: string;
  blurb: string;
  group: "base" | "team" | "custom";
  input: ThemeInput;
}

/** The value of every themeable CSS variable, ready to set on <html>. */
export type ThemeVars = Record<`--${string}`, string>;

/** Text on bright fills (flag pills, tyre bars) stays dark in every theme. */
export const INK = "#0b0c0e";

// Status, sector, tyre and flag colours follow broadcast conventions, so themes don't
// recolour them; they only swap to deeper shades on a light background to stay readable.
const DARK_SET = {
  ok: "#3ddc84",
  warn: "#ffb020",
  danger: "#ff5c5c",
  "sector-purple": "#c68aff",
  "sector-green": "#3ddc84",
  "sector-yellow": "#ffd43b",
  "tyre-soft": "#ff4d4d",
  "tyre-medium": "#ffd12e",
  "tyre-hard": "#f2f2f2",
  "tyre-inter": "#43d66f",
  "tyre-wet": "#4d9aff",
  "flag-green": "#3ddc84",
  "flag-yellow": "#ffd43b",
  "flag-red": "#ff5c5c",
};

const LIGHT_SET: typeof DARK_SET = {
  ok: "#0e7f3e",
  warn: "#9a5b00",
  danger: "#c8222c",
  "sector-purple": "#7c32d1",
  "sector-green": "#0e7f3e",
  "sector-yellow": "#8a6a00",
  "tyre-soft": "#d9161c",
  "tyre-medium": "#b88600",
  "tyre-hard": "#4b515b",
  "tyre-inter": "#11813a",
  "tyre-wet": "#1560d0",
  "flag-green": "#0e7f3e",
  "flag-yellow": "#a88000",
  "flag-red": "#d9161c",
};

const t = (id: string, name: string, blurb: string, group: Theme["group"], input: ThemeInput): Theme => ({ id, name, blurb, group, input });

export const PRESETS: Theme[] = [
  t("broadcast", "Broadcast", "Carbon black and race red, like the TV graphics.", "base", {
    bg: "#0a0b0d", surface: "#121418", text: "#f4f5f7", accent: "#e10600", select: "#ffffff",
  }),
  t("paddock", "Paddock light", "Bright and crisp for a sunny grandstand or a daytime room.", "base", {
    bg: "#e9ebef", surface: "#ffffff", text: "#111318", accent: "#d10a12", select: "#111318",
  }),
  t("night", "Night race", "Deep blue-black with floodlight cyan.", "base", {
    bg: "#05070d", surface: "#0d111c", text: "#f3f5f9", accent: "#5cc8ff", select: "#5cc8ff",
  }),
  t("ember", "Ember", "Warm carbon and amber (the old look).", "base", {
    bg: "#0e0b0d", surface: "#161115", text: "#fbf4ef", accent: "#ffa24d", select: "#ffa24d",
  }),
  t("rosso", "Rosso", "Scarlet on black, with a yellow shield accent.", "team", {
    bg: "#100506", surface: "#1a0a0b", text: "#fff3ef", accent: "#ff2800", select: "#ffd60a",
  }),
  t("papaya", "Papaya", "Papaya orange on anthracite.", "team", {
    bg: "#0b0d10", surface: "#15181d", text: "#f6f6f4", accent: "#ff8000", select: "#47c7fc",
  }),
  t("silver", "Silver arrow", "Graphite and silver with teal.", "team", {
    bg: "#0a0c0c", surface: "#151919", text: "#eef3f3", accent: "#00d7b6", select: "#c8ccce",
  }),
  t("energy", "Energy blue", "Midnight navy with red and yellow.", "team", {
    bg: "#060a19", surface: "#0e1630", text: "#f2f4fb", accent: "#ff3b52", select: "#ffcc00",
  }),
  t("green", "Racing green", "British racing green with lime.", "team", {
    bg: "#04100d", surface: "#0a1c18", text: "#eef7f3", accent: "#cedc00", select: "#cedc00",
  }),
  t("grove", "Grove blue", "Deep navy with electric blue.", "team", {
    bg: "#040a1a", surface: "#0a1630", text: "#eff4fd", accent: "#3fa9ff", select: "#ffffff",
  }),
  t("riviera", "Riviera", "Ink blue with pink.", "team", {
    bg: "#060915", surface: "#0e1324", text: "#f4f4fb", accent: "#ff6fb5", select: "#2e9bff",
  }),
];

export const DEFAULT_THEME_ID = "broadcast";

export function isDarkTheme(input: ThemeInput): boolean {
  return !isLight(input.bg);
}

/** Every colour the app uses, derived from the five picked ones. */
export function derive(input: ThemeInput): Record<string, string> {
  const { bg, surface } = input;
  const dark = isDarkTheme(input);
  // Anything too close to the panels is pushed towards white (dark panels) or black.
  const far = isLight(surface) ? "#000000" : "#ffffff";
  const text = ensureContrast(input.text, surface, 7, far);
  const raised = mix(surface, text, dark ? 0.07 : 0.05);
  const accent = ensureContrast(input.accent, surface, 3.6, far);
  const onAccent = contrast("#ffffff", accent) >= contrast(INK, accent) ? "#ffffff" : INK;
  return {
    bg,
    surface,
    raised,
    line: mix(surface, text, dark ? 0.13 : 0.12),
    "line-strong": mix(surface, text, dark ? 0.24 : 0.22),
    "line-control": ensureContrast(mix(surface, text, 0.42), surface, 3, far),
    text,
    muted: ensureContrast(mix(text, surface, 0.26), raised, 6.5, far),
    faint: ensureContrast(mix(text, surface, 0.42), raised, 4.6, far),
    accent,
    "on-accent": onAccent,
    select: ensureContrast(input.select, raised, 3, far),
    ink: INK,
    ...(dark ? DARK_SET : LIGHT_SET),
  };
}

export function themeVars(input: ThemeInput): ThemeVars {
  const colours = derive(input);
  const vars: ThemeVars = {};
  for (const [k, v] of Object.entries(colours)) vars[`--color-${k}`] = v;
  // Background art: three line tones and a comet colour, as "r,g,b".
  vars["--art-0"] = rgbList(colours.accent);
  vars["--art-1"] = rgbList(mix(colours.accent, input.text, 0.6));
  vars["--art-2"] = rgbList(mix(colours.accent, input.bg, 0.45));
  vars["--art-comet"] = rgbList(mix(colours.accent, "#ffffff", 0.55));
  return vars;
}

export interface ContrastCheck {
  label: string;
  ratio: number;
  min: number;
  ok: boolean;
}

/** What a custom theme gets right or wrong, for the editor. */
export function checkTheme(input: ThemeInput): ContrastCheck[] {
  const c = derive(input);
  const row = (label: string, a: string, b: string, min: number): ContrastCheck => {
    const ratio = contrast(a, b);
    return { label, ratio, min, ok: ratio >= min };
  };
  return [
    row("Text on panels", input.text, input.surface, 7),
    row("Text on the page", input.text, input.bg, 7),
    row("Accent on panels", input.accent, input.surface, 3),
    row("Panels stand out from the page", input.surface, input.bg, 1.03),
    row("Button text on the accent", c["on-accent"], c.accent, 4.5),
  ];
}

/** A saved custom theme, defensively parsed (anything malformed is dropped). */
export function parseCustom(raw: unknown): Theme | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Theme>;
  const i = r.input as Partial<ThemeInput> | undefined;
  if (typeof r.id !== "string" || !r.id.startsWith("custom-") || !i) return null;
  if (![i.bg, i.surface, i.text, i.accent, i.select].every(isHex)) return null;
  const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 24) : "My theme";
  return t(r.id, name, "Your theme.", "custom", i as ThemeInput);
}
