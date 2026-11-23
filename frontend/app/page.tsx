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
import type { TimingState } from "@/lib/types";
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

  useDriverKeys(state, selected, select);

  if (!state) return <LoadingState />;

  const code = state.DriverList?.[selected ?? ""]?.Tla;
  const openTab = (id: string) => {
    setTab(id);
    tabsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  if (wide) {
    return (
      <>
        <SessionHeader state={state} />
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(400px,1fr)]">
          <section aria-label="Timing tower" data-tower className="min-w-0">
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
      <section aria-label="Timing tower" data-tower className="min-w-0">
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

function KeyHint() {
  return (
    <span>
      <kbd className="font-sans">j</kbd> <kbd className="font-sans">k</kbd> change driver
    </span>
  );
}

/** j/k (or ↑/↓ with focus in the tower) move the selection through the running order. */
function useDriverKeys(state: TimingState | null, selected: string | null, select: (n: string) => void) {
  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.getAttribute("role") === "slider")) return;
      // Arrows only inside the tower (so they still scroll the page elsewhere); j/k anywhere.
      const inTower = !!t?.closest("[data-tower]");
      const dir = e.key === "j" || (inTower && e.key === "ArrowDown") ? 1 : e.key === "k" || (inTower && e.key === "ArrowUp") ? -1 : 0;
      if (!dir || !state) return;
      const rows = towerRows(state);
      const i = rows.findIndex((r) => r.num === selected);
      const next = rows[Math.min(rows.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))];
      if (next) {
        e.preventDefault();
        select(next.num);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, selected, select]);
}
