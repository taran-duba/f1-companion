import type { TrackStatusView } from "@/lib/timing";

/**
 * The marshal-panel frame: a full-width band in the track status colour.
 * Quiet (3px) while the track is green so the abnormal states can shout
 * (10px). Patterns distinguish SC (chevrons), VSC (dashes) and chequered
 * without colour; the visible text label lives in the session header.
 */
const STYLES: Record<TrackStatusView["tone"], React.CSSProperties> = {
  green: { background: "var(--color-flag-green)" },
  yellow: { background: "var(--color-flag-yellow)" },
  sc: {
    background: "repeating-linear-gradient(135deg, var(--color-flag-yellow) 0 14px, var(--color-bg) 14px 22px)",
  },
  vsc: {
    background: "repeating-linear-gradient(90deg, var(--color-flag-yellow) 0 24px, transparent 24px 34px)",
  },
  red: { background: "var(--color-flag-red)" },
  chequered: {
    background: "repeating-conic-gradient(var(--color-text) 0 25%, var(--color-bg) 0 50%) 0 0 / 14px 14px",
  },
  unknown: { background: "var(--color-line-strong)" },
};

export function isAbnormal(tone: TrackStatusView["tone"]): boolean {
  return tone !== "green" && tone !== "unknown";
}

export function FlagBand({ tone, label }: { tone: TrackStatusView["tone"]; label: string }) {
  const loud = isAbnormal(tone);
  return (
    <div
      // Re-mount on change so the one-off attention fade replays (off under reduced motion).
      key={tone}
      role="img"
      aria-label={`Track status: ${label}`}
      className={`w-full ${loud ? "h-2.5 animate-flag-in" : "h-[3px]"}`}
      style={STYLES[tone]}
    />
  );
}
