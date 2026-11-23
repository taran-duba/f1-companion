import type { TrackStatusView } from "@/lib/timing";

/**
 * The marshal-panel frame: a full-width band in the track status colour.
 * Patterns distinguish SC (chevrons), VSC (dashes) and chequered without colour;
 * the visible text label lives in the session header, this band carries a
 * screen-reader label only.
 */
const STYLES: Record<TrackStatusView["tone"], React.CSSProperties> = {
  green: { background: "var(--color-flag-green)" },
  yellow: { background: "var(--color-flag-yellow)" },
  sc: {
    background:
      "repeating-linear-gradient(135deg, var(--color-flag-yellow) 0 14px, var(--color-bg) 14px 22px)",
  },
  vsc: {
    background:
      "repeating-linear-gradient(90deg, var(--color-flag-yellow) 0 24px, transparent 24px 34px)",
  },
  red: { background: "var(--color-flag-red)" },
  chequered: {
    background:
      "repeating-conic-gradient(var(--color-text) 0 25%, var(--color-bg) 0 50%) 0 0 / 12px 12px",
  },
  unknown: { background: "var(--color-line-strong)" },
};

export function FlagBand({ tone, label }: { tone: TrackStatusView["tone"]; label: string }) {
  return (
    <div role="img" aria-label={`Track status: ${label}`} className="h-1.5 w-full" style={STYLES[tone]} />
  );
}
