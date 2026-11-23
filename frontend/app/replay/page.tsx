"use client";

import { EmptyState, Panel } from "@/components/Panel";
import { isReplayStatus } from "@/components/replay/format";
import { SourcePicker } from "@/components/replay/SourcePicker";
import { Transport } from "@/components/replay/Transport";
import { useReplay } from "@/components/replay/useReplay";
import { SessionHeader } from "@/components/SessionHeader";
import { TimingTower } from "@/components/timing/TimingTower";
import { useSelection } from "@/lib/selection";
import { useStream } from "@/lib/store";
import type { ServerStatus, SourceStatus } from "@/lib/types";

/**
 * Replay control room: transport, the source picker, and a compact tower to
 * watch seeks land.
 *
 * Visual order on every width is transport → sources → session header + tower;
 * from xl the sources sit left and the header + tower right. The session header
 * stays first in the DOM because it holds the page's h1; it has nothing
 * focusable, so moving it visually doesn't change the tab order.
 */
export default function ReplayPage() {
  const { state } = useStream();
  const { selected, select } = useSelection();
  const { source, server, send, error } = useReplay();
  const replaying = isReplayStatus(source);

  // Grid rows from xl: [transport] then [sources | header] [sources | tower].
  // The last row is 1fr so a tall source list doesn't push the tower away from the header.
  const place = replaying
    ? {
        grid: "xl:grid-rows-[auto_auto_1fr]",
        header: "xl:row-start-2",
        sources: "xl:row-start-2 xl:row-span-2",
        tower: "xl:row-start-3",
      }
    : {
        grid: "xl:grid-rows-[auto_1fr]",
        header: "xl:row-start-1",
        sources: "xl:row-start-1 xl:row-span-2",
        tower: "xl:row-start-2",
      };

  return (
    <div className={`grid grid-cols-1 gap-6 pt-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] ${place.grid}`}>
      <div className={`order-3 w-full max-w-xl min-w-0 xl:order-none xl:col-start-2 xl:max-w-none ${place.header}`}>
        {state ? <SessionHeader state={state} bleed={false} /> : <h1 className="text-title font-bold">Replay</h1>}
      </div>

      {replaying && source && (
        <Panel
          id="playback"
          title="Playback"
          meta={<span className="break-all">{source.name}</span>}
          className="order-1 min-w-0 xl:order-none xl:col-span-2 xl:row-start-1"
        >
          <Transport source={source} totalLaps={state?.LapCount?.TotalLaps} send={send} error={error} />
        </Panel>
      )}

      <Panel id="sources" title="Sources" className={`order-2 min-w-0 self-start xl:order-none xl:col-start-1 ${place.sources}`}>
        {!replaying && <NoReplay source={source} server={server} />}
        <SourcePicker server={server} />
      </Panel>

      {/* max-w-xl (header above too, so the two line up): the compact tower has five columns, and a full-width table spreads them too far apart to scan. */}
      <section
        aria-label="Timing tower"
        className={`order-4 w-full max-w-xl min-w-0 self-start xl:order-none xl:col-start-2 xl:max-w-none ${place.tower}`}
      >
        {state ? (
          <TimingTower state={state} selected={selected} onSelect={select} compact />
        ) : (
          <p className="text-small text-muted" aria-busy="true">
            Connecting to timing…
          </p>
        )}
      </section>
    </div>
  );
}

/** Why there's no transport, shown above the source list. */
function NoReplay({ source, server }: { source: SourceStatus | null; server: ServerStatus | null }) {
  let text: string;
  if (server?.loading) text = "A FastF1 session is loading. Playback controls appear above as soon as it's ready.";
  else if (source?.kind === "live")
    text = "The live feed is on, and live timing can't be paused or rewound. Pick a source below to replay instead.";
  else if (!server)
    text =
      "Waiting for the backend to report which source is active. If this doesn't change, check that the backend is running (python -m f1live serve).";
  else text = "Nothing is replaying. Pick a source below to start: the demo race works without any setup.";
  return (
    <div className="mb-4">
      <EmptyState>
        <p className="max-w-[65ch]">{text}</p>
      </EmptyState>
    </div>
  );
}
