"use client";

import { useEffect, useState } from "react";
import { GapChart } from "@/components/charts/GapChart";
import { TrackMap } from "@/components/map/TrackMap";
import { Panel } from "@/components/Panel";
import { RaceControlFeed } from "@/components/RaceControlFeed";
import { SessionHeader } from "@/components/SessionHeader";
import { Tabs } from "@/components/Tabs";
import { TelemetryPanel } from "@/components/telemetry/TelemetryPanel";
import { TimingTower } from "@/components/timing/TimingTower";
import { LoadingState } from "@/components/LoadingState";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useSelection } from "@/lib/selection";
import { useStream } from "@/lib/store";
import { towerRows } from "@/lib/timing";

export default function LivePage() {
  const { state } = useStream();
  const { selected, select } = useSelection();
  const wide = useMediaQuery("(min-width: 1024px)");
  const [tab, setTab] = useState("driver");

  // Default selection: the leader, once timing arrives.
  useEffect(() => {
    if (!state || selected) return;
    const first = towerRows(state)[0];
    if (first) select(first.num);
  }, [state, selected, select]);

  if (!state) return <LoadingState />;

  const code = state.DriverList?.[selected ?? ""]?.Tla;
  const telemetry = <TelemetryPanel state={state} selected={selected} />;
  const map = <TrackMap state={state} selected={selected} />;
  const control = <RaceControlFeed state={state} maxHeight={wide ? "22rem" : "60vh"} />;
  const gaps = <GapChart state={state} selected={selected} />;

  return (
    <>
      <SessionHeader state={state} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] xl:grid-cols-[minmax(0,1.35fr)_minmax(400px,1fr)]">
        <section aria-label="Timing tower" className="min-w-0">
          <TimingTower state={state} selected={selected} onSelect={select} />
        </section>

        {wide ? (
          <div className="flex min-w-0 flex-col gap-6">
            <Panel id="telemetry" title={code ? `Telemetry: ${code}` : "Telemetry"}>
              {telemetry}
            </Panel>
            <Panel id="map" title="Track map">
              {map}
            </Panel>
            <Panel id="race-control" title="Race control">
              {control}
            </Panel>
            <Panel id="gaps" title="Gap to car ahead">
              {gaps}
            </Panel>
          </div>
        ) : (
          <Tabs
            label="Live panels"
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "driver", label: "Telemetry", content: telemetry },
              { id: "map", label: "Map", content: map },
              { id: "control", label: "Control", content: control },
              { id: "gaps", label: "Gaps", content: gaps },
            ]}
          />
        )}
      </div>
    </>
  );
}
