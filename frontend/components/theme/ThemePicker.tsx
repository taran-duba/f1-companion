"use client";

import { derive, type Theme } from "@/lib/theme/themes";
import { useTheme } from "@/lib/theme/useTheme";

/** A tiny picture of the theme: page, a panel with a tower row, the accent and selection. */
export function ThemeSwatch({ theme, className = "" }: { theme: Theme; className?: string }) {
  const c = derive(theme.input);
  return (
    <span aria-hidden="true" className={`block overflow-hidden rounded-chip border ${className}`} style={{ background: c.bg, borderColor: c.line }}>
      <span className="m-1.5 block rounded-[4px] p-1.5" style={{ background: c.surface }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="flex items-center gap-1 py-[2px]" style={i === 0 ? { boxShadow: `inset 2px 0 0 ${c.select}`, background: c.raised } : undefined}>
            <span className="ml-1 h-1.5 w-[3px] rounded-[1px]" style={{ background: ["#e8402a", "#2f6fe0", "#15b39a"][i] }} />
            <span className="h-1 w-5 rounded-full" style={{ background: c.text, opacity: 0.9 }} />
            <span className="ml-auto mr-1 h-1 w-3 rounded-full" style={{ background: c.muted }} />
          </span>
        ))}
        <span className="mt-1 flex gap-1">
          <span className="h-1.5 w-6 rounded-full" style={{ background: c.accent }} />
          <span className="h-1.5 w-3 rounded-full" style={{ background: c["line-strong"] }} />
        </span>
      </span>
    </span>
  );
}

/** Grid of themes; the active one is marked. */
export function ThemeGrid({ themes, compact = false, onPick }: { themes: Theme[]; compact?: boolean; onPick?: (t: Theme) => void }) {
  const { theme: active, setActive } = useTheme();
  return (
    <ul className={`grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
      {themes.map((t) => {
        const on = t.id === active.id;
        return (
          <li key={t.id}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => {
                setActive(t.id);
                onPick?.(t);
              }}
              title={t.blurb}
              className={`group w-full rounded-panel border p-1.5 text-left transition-colors duration-150 ${
                on ? "border-accent bg-raised" : "border-line hover:border-line-control hover:bg-raised/60"
              }`}
            >
              <ThemeSwatch theme={t} />
              <span className="mt-1.5 flex items-center gap-1 px-0.5 text-small font-semibold text-text">
                <span className="min-w-0 truncate">{t.name}</span>
                {on && (
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" className="ml-auto shrink-0 text-accent">
                    <path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {!compact && <span className="block px-0.5 text-micro text-faint">{t.blurb}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
