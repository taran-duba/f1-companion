"use client";

import { useId, useRef, type ReactNode } from "react";

export interface TabDef {
  id: string;
  label: string;
  content: ReactNode;
}

/** Accessible segmented tabs (arrow keys move between tabs). */
export function Tabs({ tabs, active, onChange, label, sticky = false }: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  label: string;
  sticky?: boolean;
}) {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  function onKey(e: React.KeyboardEvent, idx: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(tabs[next].id);
      refs.current[tabs[next].id]?.focus();
    }
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className={`grid gap-1 rounded-panel border border-line-strong bg-surface p-1 ${sticky ? "sticky top-0 z-20" : ""}`}
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((t, i) => {
          const selected = t.id === current.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              role="tab"
              type="button"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`min-h-11 rounded-chip px-2 text-small transition-colors duration-150 ${
                selected ? "bg-raised font-bold text-text shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-muted hover:bg-raised/60"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel-${current.id}`} aria-labelledby={`${base}-tab-${current.id}`} className="mt-3">
        {current.content}
      </div>
    </div>
  );
}
