"use client";

import { useEffect, useRef } from "react";
import { useConnectionView, StatusGlyph, TONE_CLASS } from "@/components/ConnectionPill";
import { SourcePicker as ReplayLibrary } from "@/components/replay/SourcePicker";
import { useStream } from "@/lib/store";
import { useUi, type SourceTab } from "@/lib/ui";
import { LiveTab } from "./LiveTab";

const TABS: { id: SourceTab; label: string; hint: string }[] = [
  { id: "live", label: "Live", hint: "Real session, F1 TV sign-in" },
  { id: "replay", label: "Replay", hint: "Demo, recordings, past races" },
];

/**
 * Everything about where data comes from, in one place: pick Live or a Replay, sign in to
 * F1 TV, record. A side sheet rather than a page, so timing keeps running behind it.
 */
export function SourcePanel() {
  const { sourcesOpen, sourceTab, setSourceTab, closeSources, wantToken } = useUi();
  const { status } = useStream();
  const view = useConnectionView();
  const panel = useRef<HTMLElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  // Take focus on open (unless the token field will), give it back on close.
  useEffect(() => {
    if (sourcesOpen) {
      returnTo.current = document.activeElement as HTMLElement | null;
      if (!wantToken) panel.current?.focus();
    } else {
      returnTo.current?.focus?.();
      returnTo.current = null;
    }
  }, [sourcesOpen, wantToken]);

  if (!sourcesOpen) return null;

  const src = status?.source;
  const name = src?.kind === "live" ? "F1 live timing" : src?.name;

  return (
    <>
      {/* Scrim only below lg, where the sheet covers the page; on desktop you keep watching. */}
      <div className="fixed inset-0 z-40 animate-fade-in bg-bg/70 lg:hidden" aria-hidden="true" onClick={closeSources} />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="false"
        aria-labelledby="sources-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            closeSources();
          }
        }}
        className="fixed inset-y-0 right-0 z-50 flex animate-panel-in w-full max-w-[26rem] flex-col border-l border-line-strong bg-bg shadow-[-12px_0_32px_rgba(0,0,0,0.45)] outline-none"
      >
        <header className="flex items-start gap-3 border-b border-line px-4 pb-3 pt-3">
          <div className="min-w-0 flex-1">
            <h2 id="sources-title" className="text-title font-bold">
              Source
            </h2>
            <p className={`mt-1.5 inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-0.5 text-small font-semibold ${TONE_CLASS[view.tone]}`}>
              <StatusGlyph tone={view.tone} pulsing={view.pulsing} replay={view.replay} />
              <span className="truncate">{view.label}</span>
            </p>
            {name && <p className="mt-1 truncate text-small text-muted">{name}</p>}
            {status?.error && <p className="mt-1 text-small text-danger">{status.error}</p>}
          </div>
          <button
            type="button"
            onClick={closeSources}
            aria-label="Close source panel"
            className="grid size-11 shrink-0 place-items-center rounded-chip text-muted transition-colors duration-150 hover:bg-raised hover:text-text"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div role="tablist" aria-label="Kind of source" className="grid grid-cols-2 gap-1 border-b border-line p-2">
          {TABS.map((t) => {
            const on = sourceTab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                id={`src-tab-${t.id}`}
                aria-selected={on}
                aria-controls="src-tabpanel"
                tabIndex={on ? 0 : -1}
                onClick={() => setSourceTab(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    const next = TABS[(TABS.findIndex((x) => x.id === t.id) + 1) % TABS.length].id;
                    setSourceTab(next);
                    document.getElementById(`src-tab-${next}`)?.focus();
                  }
                }}
                className={`flex min-h-11 flex-col items-start justify-center rounded-chip px-3 text-left transition-[background-color,box-shadow] duration-200 ${
                  on ? "bg-raised shadow-[inset_0_-2px_0_var(--color-accent)]" : "hover:bg-raised/60"
                }`}
              >
                <span className={`text-body ${on ? "font-bold text-text" : "font-semibold text-muted"}`}>{t.label}</span>
                <span className="text-micro text-faint">{t.hint}</span>
              </button>
            );
          })}
        </div>

        <div id="src-tabpanel" role="tabpanel" aria-labelledby={`src-tab-${sourceTab}`} className="min-h-0 flex-1 overflow-y-auto p-4">
          {sourceTab === "live" ? <LiveTab status={status} /> : <ReplayLibrary server={status} />}
        </div>
      </aside>
    </>
  );
}
