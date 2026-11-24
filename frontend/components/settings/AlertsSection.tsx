"use client";

import { EVENT_KINDS, usePrefs, type NotifyLevel } from "@/lib/prefs";

const LEVELS: { id: NotifyLevel; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "favs", label: "Favourites" },
  { id: "all", label: "Everyone" },
];

/** Which race moments pop up as alerts, and about whom. */
export function AlertsSection() {
  const { prefs, setNotify } = usePrefs();
  return (
    <div className="grid gap-1">
      <p className="mb-2 max-w-[65ch] text-small text-muted">
        Alerts appear in the corner for a few seconds; select one to follow that driver. “Favourites” means your starred drivers and teams,
        plus whoever you are following. With a TV delay set, alerts wait for it too.
      </p>
      <ul className="divide-y divide-line">
        {EVENT_KINDS.map(({ kind, label, hint }) => (
          <li key={kind} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold text-text">{label}</p>
              <p className="text-small text-faint">{hint}</p>
            </div>
            <div role="group" aria-label={label} className="grid grid-cols-3 gap-1 rounded-chip bg-raised/60 p-1">
              {LEVELS.map((l) => {
                const on = prefs.notify[kind] === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setNotify(kind, l.id)}
                    className={`min-h-9 rounded-chip px-3 text-small font-semibold transition-[background-color,color] duration-200 ${
                      on ? "bg-accent text-on-accent" : "text-muted hover:text-text"
                    }`}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
