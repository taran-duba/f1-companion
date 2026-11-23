import type { Compound, SectorMark } from "@/lib/timing";

const MARK_CLASS: Record<SectorMark, string> = {
  purple: "text-sector-purple font-semibold",
  green: "text-sector-green font-semibold",
  yellow: "text-sector-yellow",
  none: "text-text",
};

const MARK_GLYPH: Record<SectorMark, string> = { purple: "◆", green: "▲", yellow: "", none: "" };
const MARK_LABEL: Record<SectorMark, string> = {
  purple: "fastest overall",
  green: "personal best",
  yellow: "",
  none: "",
};

/** A time coloured by sector convention, with a glyph so colour isn't the only cue. */
export function MarkedTime({ value, mark, sector = false }: { value: string; mark: SectorMark; sector?: boolean }) {
  if (!value) return <span className="text-faint">—</span>;
  const shown = sector ? value : value;
  const label = MARK_LABEL[mark];
  return (
    <span className={`num inline-flex items-center justify-end gap-1 ${MARK_CLASS[mark]}`}>
      {MARK_GLYPH[mark] && (
        <span aria-hidden="true" className="text-[0.7em] leading-none">
          {MARK_GLYPH[mark]}
        </span>
      )}
      <span>{shown}</span>
      {label && <span className="sr-only">({label})</span>}
    </span>
  );
}

const TYRE: Record<Compound, { letter: string; colour: string; name: string }> = {
  SOFT: { letter: "S", colour: "var(--color-tyre-soft)", name: "Soft" },
  MEDIUM: { letter: "M", colour: "var(--color-tyre-medium)", name: "Medium" },
  HARD: { letter: "H", colour: "var(--color-tyre-hard)", name: "Hard" },
  INTERMEDIATE: { letter: "I", colour: "var(--color-tyre-inter)", name: "Intermediate" },
  WET: { letter: "W", colour: "var(--color-tyre-wet)", name: "Wet" },
  UNKNOWN: { letter: "?", colour: "var(--color-muted)", name: "Unknown tyre" },
};

export function tyreName(c: Compound) {
  return TYRE[c].name;
}

export function TyreBadge({ compound, size = 24 }: { compound: Compound; size?: number }) {
  const t = TYRE[compound];
  return (
    <span
      role="img"
      aria-label={t.name}
      title={t.name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none"
      style={{
        width: size,
        height: size,
        border: `2px solid ${t.colour}`,
        color: t.colour,
        fontSize: Math.round(size * 0.52),
      }}
    >
      <span aria-hidden="true">{t.letter}</span>
    </span>
  );
}

export function TeamBar({ colour, className = "h-6" }: { colour: string; className?: string }) {
  return <span aria-hidden="true" className={`inline-block w-1 shrink-0 rounded-sm ${className}`} style={{ background: colour }} />;
}

export function Chip({ tone, children, title }: { tone: "warn" | "danger" | "ok" | "muted"; children: React.ReactNode; title?: string }) {
  const cls = {
    warn: "border-warn text-warn",
    danger: "border-danger text-danger",
    ok: "border-ok text-ok",
    muted: "border-line-control text-muted",
  }[tone];
  return (
    <span title={title} className={`inline-flex items-center rounded-chip border px-1.5 text-micro font-bold leading-5 ${cls}`}>
      {children}
    </span>
  );
}
