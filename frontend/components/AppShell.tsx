"use client";

import type { ReactNode } from "react";
import { useStream } from "@/lib/store";
import { trackStatus } from "@/lib/timing";
import { FlagBand } from "./FlagBand";
import { PlaybackDock } from "./shell/PlaybackDock";
import { TopBar } from "./shell/TopBar";
import { SourcePanel } from "./sources/SourcePanel";

/**
 * Frame for every page: flag band, top bar, the page, the playback dock (replays only) and
 * the source panel. Each of those is app-wide, so no page has to know about sources.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { state } = useStream();
  const status = state ? trackStatus(state) : null;
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-chip focus:bg-accent focus:px-3 focus:py-2 focus:font-semibold focus:text-bg"
      >
        Skip to content
      </a>
      <FlagBand tone={status?.tone ?? "unknown"} label={status?.label ?? "Track status unknown"} />
      <TopBar />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1800px] flex-1 px-3 pb-6 outline-none lg:px-4">
        {children}
      </main>
      <PlaybackDock />
      <SourcePanel />
    </div>
  );
}
