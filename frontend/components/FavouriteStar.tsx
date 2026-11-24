"use client";

import { usePrefs } from "@/lib/prefs";

/** Star or unstar a driver. Favourites are highlighted, followed first and drive alerts. */
export function FavouriteStar({ code, className = "" }: { code: string; className?: string }) {
  const { prefs, toggleDriver } = usePrefs();
  const on = prefs.drivers.includes(code.toUpperCase());
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${code} from favourites` : `Add ${code} to favourites`}
      title={on ? "Favourite: highlighted in the tower, followed first, alerts on" : "Add to favourites"}
      onClick={() => toggleDriver(code)}
      className={`grid size-11 shrink-0 place-items-center rounded-full text-title leading-none transition-colors duration-150 hover:bg-raised lg:size-9 ${on ? "text-text" : "text-faint hover:text-text"} ${className}`}
    >
      <span aria-hidden="true">{on ? "★" : "☆"}</span>
    </button>
  );
}
