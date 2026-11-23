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
      className="boot-dock sticky bottom-3 z-30 mx-3 mb-3 rounded-panel border border-line/70 bg-surface/90 px-4 py-2 backdrop-blur-md pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:mx-6"
    >
      <div className="mx-auto max-w-[1800px]">
        <Transport dock source={source} totalLaps={state?.LapCount?.TotalLaps} send={send} error={error} />
      </div>
    </section>
  );
}
