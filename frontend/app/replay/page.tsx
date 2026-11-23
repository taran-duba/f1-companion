"use client";

import { LoadingState } from "@/components/LoadingState";
import { EmptyState, Panel } from "@/components/Panel";
import { isReplayStatus } from "@/components/replay/format";
import { SourcePicker } from "@/components/replay/SourcePicker";
import { BUTTON } from "@/components/replay/sourceUi";
import { Transport } from "@/components/replay/Transport";
import { useReplay } from "@/components/replay/useReplay";
import { SessionHeader } from "@/components/SessionHeader";
import { TimingTower } from "@/components/timing/TimingTower";
import { useSelection } from "@/lib/selection";
import { useStream } from "@/lib/store";
import type { ServerStatus, SourceStatus } from "@/lib/types";

/** Replay control room: transport, a compact tower to watch seeks land, and the source picker. */
export default function ReplayPage() {
  const { state } = useStream();
  const { selected, select } = useSelection();
  const { source, server, send, error } = useReplay();
  const replaying = isReplayStatus(source);

  return (
    <>
      {state ? <SessionHeader state={state} /> : <h1 className="sr-only">Replay</h1>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel id="playback" title="Playback" meta={replaying ? <span className="break-all">{source?.name}</span> : undefined}>
            {replaying && source ? (
              <Transport source={source} totalLaps={state?.LapCount?.TotalLaps} send={send} error={error} />
            ) : (
              <NoReplay source={source} server={server} />
            )}
          </Panel>

          <section aria-label="Timing tower" className="min-w-0">
            {state ? <TimingTower state={state} selected={selected} onSelect={select} compact /> : <LoadingState />}
          </section>
        </div>

        <Panel id="sources" title="Sources">
          <SourcePicker server={server} />
        </Panel>
      </div>
    </>
  );
}

function NoReplay({ source, server }: { source: SourceStatus | null; server: ServerStatus | null }) {
  const choose = (
    <a href="#sources" className={`${BUTTON} mt-3 w-fit`}>
      Choose a source
    </a>
  );
  if (server?.loading) {
    return <EmptyState>A FastF1 session is loading. Playback controls appear here as soon as it&apos;s ready.</EmptyState>;
  }
  if (source?.kind === "live") {
    return (
      <EmptyState>
        <p>
          The live feed is on, and live timing can&apos;t be paused or rewound. Pick the demo race, a recording or a past session
          to replay instead.
        </p>
        {choose}
      </EmptyState>
    );
  }
  if (!server) {
    return (
      <EmptyState>
        Waiting for the backend to report which source is active. If this doesn&apos;t change, check that the backend is
        running (python -m f1live serve).
      </EmptyState>
    );
  }
  return (
    <EmptyState>
      <p>Nothing is replaying. Pick a source to start: the demo race works without any setup.</p>
      {choose}
    </EmptyState>
  );
}
