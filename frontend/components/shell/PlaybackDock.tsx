"use client";

import { isReplayStatus } from "@/components/replay/format";
import { Transport } from "@/components/replay/Transport";
import { useReplay } from "@/components/replay/useReplay";
import { useStream } from "@/lib/store";

/**
 * Playback controls pinned to the bottom of every page while the source is a replay, so you
 * can pause, scrub and change speed without leaving the layout you're watching.
 */
export function PlaybackDock() {
  const { state } = useStream();
  const { source, send, error } = useReplay();
  if (!source || !isReplayStatus(source)) return null;
  return (
    <section
      aria-label="Playback"
      className="sticky bottom-0 z-30 border-t border-line-strong bg-surface/95 px-3 py-2 backdrop-blur pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:px-4"
    >
      <div className="mx-auto max-w-[1800px]">
        <Transport dock source={source} totalLaps={state?.LapCount?.TotalLaps} send={send} error={error} />
      </div>
    </section>
  );
}
