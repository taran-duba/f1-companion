/** Small colour helpers for themes: hex parsing, mixing and WCAG contrast. No React here. */

export type Rgb = [number, number, number];

/** "#abc", "#aabbcc" or "aabbcc" → [r, g, b]; null when it isn't a hex colour. */
export function parseHex(hex: string): Rgb | null {
  const s = hex.trim().replace(/^#/, "");
  const full = s.length === 3 ? s.replace(/./g, (c) => c + c) : s;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

export function isHex(hex: unknown): hex is string {
  return typeof hex === "string" && parseHex(hex) != null;
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** `a` moved `t` (0–1) of the way towards `b`, in sRGB. */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a) ?? [0, 0, 0];
  const y = parseHex(b) ?? [0, 0, 0];
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb);
}

/** "r,g,b" for use inside rgba() (the background art). */
export function rgbList(hex: string): string {
  return (parseHex(hex) ?? [255, 255, 255]).join(",");
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function isLight(hex: string): boolean {
  return luminance(hex) > 0.4;
}

/**
 * Move `fg` towards `towards` in small steps until it reaches `ratio` against `bg`
 * (or runs out of room). Keeps the hue of a picked colour while making it readable.
 */
export function ensureContrast(fg: string, bg: string, ratio: number, towards: string): string {
  let c = fg;
  for (let i = 0; i < 20 && contrast(c, bg) < ratio; i++) c = mix(c, towards, 0.12);
  return c;
}
