"use client";

import Link from "next/link";
import { ThemeGrid } from "@/components/theme/ThemePicker";
import { useArt, type ArtMode } from "@/lib/art/useArt";
import { useTheme } from "@/lib/theme/useTheme";
import { Popover } from "./Popover";

const MODES: { id: ArtMode; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "subtle", label: "Subtle" },
  { id: "bold", label: "Bold" },
];

/** Top-bar theme switcher: every theme one click away, plus the background art. */
export function ThemeMenu() {
  const { presets, custom } = useTheme();
  const { art, set } = useArt();
  return (
    <Popover
      label="Theme"
      buttonClass="grid size-11 place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-raised/70 hover:text-text lg:size-10"
      panelClass="w-[min(24rem,calc(100vw-1.5rem))]"
      button={
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M9 1.8a7.2 7.2 0 1 0 0 14.4c1 0 1.5-.6 1.5-1.3 0-.9-.8-1.2-.8-2 0-.7.6-1.2 1.4-1.2h1.6a3.5 3.5 0 0 0 3.5-3.5C16.2 4.6 13 1.8 9 1.8z" />
          <circle cx="5.3" cy="8.2" r="1" fill="currentColor" stroke="none" />
          <circle cx="7.6" cy="5" r="1" fill="currentColor" stroke="none" />
          <circle cx="11.4" cy="5.2" r="1" fill="currentColor" stroke="none" />
        </svg>
      }
    >
      {(close) => (
        <div className="grid gap-3">
          <ThemeGrid themes={[...presets, ...custom]} compact />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-small font-semibold text-muted">Background art</span>
            <div role="group" aria-label="Background art" className="ml-auto grid grid-cols-3 gap-1 rounded-chip bg-raised/60 p-1">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={art.mode === m.id}
                  onClick={() => set({ mode: m.id })}
                  className={`min-h-8 rounded-chip px-2.5 text-small font-semibold transition-[background-color,color] duration-200 ${
                    art.mode === m.id ? "bg-accent text-on-accent" : "text-muted hover:text-text"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <Link
            href="/settings#appearance"
            onClick={close}
            className="inline-flex min-h-11 items-center justify-center rounded-chip border border-line-control text-small font-semibold text-text transition-colors duration-150 hover:bg-raised"
          >
            Make your own theme
          </Link>
        </div>
      )}
    </Popover>
  );
}
