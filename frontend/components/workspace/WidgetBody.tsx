"use client";

import { useMemo } from "react";
import { BattleList } from "@/components/charts/BattleList";
import { GapChart } from "@/components/charts/GapChart";
import { LapTimeChart } from "@/components/charts/LapTimeChart";
import { StrategyChart } from "@/components/charts/StrategyChart";
import { fieldBests, stintViews } from "@/components/driver/model";
import { DriverTraces } from "@/components/driver/DriverTraces";
import { SectorTable } from "@/components/driver/SectorTable";
import { TrackMap } from "@/components/map/TrackMap";
import { EmptyState } from "@/components/Panel";
import { RaceControlFeed } from "@/components/RaceControlFeed";
import { TelemetryPanel } from "@/components/telemetry/TelemetryPanel";
import { TimingTower } from "@/components/timing/TimingTower";
import { PitStops } from "@/components/widgets/PitStops";
import { WeatherWidget } from "@/components/widgets/WeatherWidget";
import { neutralWindows } from "@/lib/charts";
import { asList } from "@/lib/merge";
import { lapHistory, stints, towerRows, trackStatus } from "@/lib/timing";
import type { RaceControlMessage, TimingState } from "@/lib/types";
import type { Tile } from "@/lib/workspace";

interface Props {
  tile: Tile;
  state: TimingState;
  /** Racing number the tile is about (already resolved), or null. */
  num: string | null;
  /** Followed driver: what tower clicks change. */
  onSelect: (num: string) => void;
  selected: string | null;
  /** The tile fills the screen: telemetry then also shows the track map. */
  focused?: boolean;
}

/** Draws one widget type from the stream. Every widget shows its own empty state. */
export function WidgetBody({ tile, state, num, onSelect, selected, focused = false }: Props) {
  switch (tile.type) {
    case "tower":
      return <TimingTower state={state} selected={selected} onSelect={onSelect} />;
    case "pits":
      return <PitStops state={state} selected={selected} onSelect={onSelect} />;
    case "strategy":
      return <StrategyChart state={state} selected={selected} onSelect={onSelect} />;
    case "control":
      return <RaceControlFeed state={state} maxHeight="none" />;
    case "weather":
      return <WeatherWidget state={state} />;
    case "battles":
      return <Battles state={state} />;
    default:
      break;
  }

  // Everything below is about one driver.
  if (!num) {
    return (
      <EmptyState>
        {tile.driver === "ahead"
          ? "No car ahead: the followed driver is leading."
          : tile.driver === "behind"
            ? "No car behind: the followed driver is last."
            : "Pick a driver in the timing tower, or choose one in this tile's menu."}
      </EmptyState>
    );
  }
  switch (tile.type) {
    case "telemetry":
      if (focused) {
        // Full screen: the readouts beside the whole field on the circuit, the followed driver picked out.
        return (
          <div className="grid h-full gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
            <div className="min-h-0 min-w-0">
              <TelemetryPanel state={state} selected={num} compact />
            </div>
            <div className="min-h-0 min-w-0">
              <TrackMap state={state} selected={num} />
            </div>
          </div>
        );
      }
      return <TelemetryPanel state={state} selected={num} compact={tile.w < 8} />;
    case "map":
      return <TrackMap state={state} selected={num} />;
    case "gaps":
      return <GapChart state={state} selected={num} />;
    case "traces":
      return <Traces state={state} num={num} />;
    case "laps":
      return <Laps state={state} num={num} />;
    case "sectors":
      return <Sectors state={state} num={num} />;
    default:
      return null;
  }
}

function Battles({ state }: { state: TimingState }) {
  const rows = useMemo(() => towerRows(state), [state]);
  return <BattleList rows={rows} tone={trackStatus(state).tone} />;
}

function Traces({ state, num }: { state: TimingState; num: string }) {
  const field = useMemo(() => fieldBests(state), [state]);
  return <DriverTraces state={state} num={num} fieldMs={field.ms} />;
}

function Laps({ state, num }: { state: TimingState; num: string }) {
  const row = useMemo(() => towerRows(state).find((r) => r.num === num), [state, num]);
  const field = useMemo(() => fieldBests(state), [state]);
  const neutral = useMemo(
    () => neutralWindows(asList<RaceControlMessage>(state.RaceControlMessages?.Messages).filter(Boolean), state.LapCount?.CurrentLap),
    [state],
  );
  return (
    <LapTimeChart
      laps={lapHistory(state, num)}
      colour={row?.teamColour}
      label={row?.code ?? num}
      overallBestMs={field.ms}
      neutral={neutral}
    />
  );
}

function Sectors({ state, num }: { state: TimingState; num: string }) {
  const field = useMemo(() => fieldBests(state), [state]);
  return <SectorTable laps={lapHistory(state, num)} field={field} stints={stintViews(stints(state, num))} maxHeight="none" />;
}
