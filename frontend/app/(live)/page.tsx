"use client";

import { useEffect, useRef, useState } from "react";
import { GapChart } from "@/components/charts/GapChart";
import { LoadingState } from "@/components/LoadingState";
import { TrackMap } from "@/components/map/TrackMap";
import { Panel } from "@/components/Panel";
import { RaceControlFeed, RaceControlTicker } from "@/components/RaceControlFeed";
import { SelectedDriverBar } from "@/components/SelectedDriverBar";
import { SessionHeader } from "@/components/SessionHeader";
import { Tabs } from "@/components/Tabs";
import { TelemetryPanel } from "@/components/telemetry/TelemetryPanel";
import { TimingTower } from "@/components/timing/TimingTower";
import { useSelection } from "@/lib/selection";
import { useStream } from "@/lib/store";
import { towerRows } from "@/lib/timing";
import { useMediaQuery } from "@/lib/useMediaQuery";

export default function LivePage() {
  const { state } = useStream();
  const { selected, select } = useSelection();
  const wide = useMediaQuery("(min-width: 1024px)");
  const [tab, setTab] = useState("driver");
  const tabsRef = useRef<HTMLDivElement>(null);

  // Default selection: the leader, once timing arrives.
  useEffect(() => {
    if (!state || selected) return;
    const first = towerRows(state)[0];
    if (first) select(first.num);
  }, [state, selected, select]);

  if (!state) return <LoadingState />;

  const code = state.DriverList?.[selected ?? ""]?.Tla;
  // The ticker and the driver bar switch tabs from elsewhere on the page: move focus to the
  // newly selected tab (after React has rendered it) so keyboard and screen-reader users land
  // where the content now is, instead of on a control that has scrolled out of view.
  const openTab = (id: string) => {
    setTab(id);
    requestAnimationFrame(() => {
      tabsRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
      // JS smooth scrolling ignores the CSS reduced-motion guard, so check it here.
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      tabsRef.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    });
  };

  if (wide) {
    return (
      <>
        <SessionHeader state={state} />
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,1fr)]">
          <section aria-label="Timing tower" className="min-w-0">
            <TimingTower state={state} selected={selected} onSelect={select} />
          </section>
          <div className="flex min-w-0 flex-col gap-4">
            <Panel id="race-control" title="Race control" meta="Newest first">
              <RaceControlFeed state={state} initial={4} maxHeight="22rem" />
            </Panel>
            <Panel id="telemetry" title={code ? `Telemetry: ${code}` : "Telemetry"} meta={<KeyHint />}>
              <TelemetryPanel state={state} selected={selected} compact />
            </Panel>
            <Panel id="map" title="Track map">
              <TrackMap state={state} selected={selected} />
            </Panel>
            <Panel id="gaps" title="Gap to car ahead">
              <GapChart state={state} selected={selected} />
            </Panel>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="pb-20">
      <SessionHeader state={state} />
      <RaceControlTicker state={state} onOpen={() => openTab("control")} />
      <section aria-label="Timing tower" className="min-w-0">
        <TimingTower state={state} selected={selected} onSelect={select} />
      </section>
      <div ref={tabsRef} className="mt-4 scroll-mt-2">
        <Tabs
          label="Live panels"
          sticky
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "driver", label: "Telemetry", content: <TabBody title={code ? `Telemetry: ${code}` : "Telemetry"}><TelemetryPanel state={state} selected={selected} compact /></TabBody> },
            { id: "map", label: "Map", content: <TabBody title="Track map"><TrackMap state={state} selected={selected} /></TabBody> },
            { id: "control", label: "Control", content: <TabBody title="Race control"><RaceControlFeed state={state} maxHeight="60vh" /></TabBody> },
            { id: "gaps", label: "Gaps", content: <TabBody title="Gap to car ahead"><GapChart state={state} selected={selected} /></TabBody> },
          ]}
        />
      </div>
      <SelectedDriverBar state={state} selected={selected} onOpen={() => openTab("driver")} />
    </div>
  );
}

/** Keeps the heading outline intact on phones, where the panel frame is a tab. */
function TabBody({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h2 className="sr-only">{title}</h2>
      {children}
    </>
  );
}

const KBD = "inline-flex h-5 min-w-5 items-center justify-center rounded-[3px] border border-line-control px-1 font-sans text-micro text-muted";

function KeyHint() {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className={KBD}>j</kbd>
      <kbd className={KBD}>k</kbd>
      <span className="ml-0.5">change driver in the tower</span>
    </span>
  );
}
