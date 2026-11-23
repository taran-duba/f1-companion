"use client";

import Link from "next/link";
import { use, useMemo } from "react";
import { LapTimeChart } from "@/components/charts/LapTimeChart";
import { DriverHeader } from "@/components/driver/DriverHeader";
import { DriverTraces } from "@/components/driver/DriverTraces";
import { fieldBests, stintViews } from "@/components/driver/model";
import { SectorTable } from "@/components/driver/SectorTable";
import { StintList } from "@/components/driver/StintList";
import { LoadingState } from "@/components/LoadingState";
import { Panel } from "@/components/Panel";
import { neutralWindows } from "@/lib/charts";
import { asList } from "@/lib/merge";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useStream } from "@/lib/store";
import { findDriverByCode, lapHistory, stints, towerRows, trackStatus } from "@/lib/timing";
import type { RaceControlMessage } from "@/lib/types";

/** Client body of /driver/[code]; params stay a Promise (Next 16) and are read with use(). */
export function DriverDetail({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = decodeURIComponent(rawCode);
  const { state } = useStream();
  const wide = useMediaQuery("(min-width: 1280px)");

  const rows = useMemo(() => (state ? towerRows(state) : []), [state]);
  const field = useMemo(() => (state ? fieldBests(state) : null), [state]);
  // Safety car / VSC windows: explain the slow and off-scale laps on the lap chart.
  const neutral = useMemo(
    () =>
      state
        ? neutralWindows(
            asList<RaceControlMessage>(state.RaceControlMessages?.Messages).filter(Boolean),
            state.LapCount?.CurrentLap,
          )
        : [],
    [state],
  );

  if (!state) return <LoadingState />;

  const driver = findDriverByCode(state, code);
  const num = driver?.RacingNumber;
  const idx = num ? rows.findIndex((r) => r.num === num) : -1;
  const row = idx >= 0 ? rows[idx] : null;

  if (!driver || !num || !row) {
    return (
      <div className="mx-auto mt-10 max-w-xl rounded-panel border border-line-strong bg-surface p-6">
        <h1 className="text-title font-bold">No driver &ldquo;{code.toUpperCase()}&rdquo; in this session</h1>
        <p className="mt-2 text-muted">
          {driver
            ? "This driver is listed but has no timing yet. Their page fills in once the session starts."
            : "The code may be from another session, or the timing feed hasn't listed this driver yet."}
        </p>
        <Link
          href="/driver"
          className="mt-4 inline-flex min-h-11 items-center rounded-chip border border-line-control px-3 transition-colors duration-150 hover:bg-raised"
        >
          See all drivers
        </Link>
      </div>
    );
  }

  const laps = lapHistory(state, num);
  const stintList = stintViews(stints(state, num));
  // Why this car won't add laps: retired/stopped, or the chequered flag is out.
  const ended = row.retired
    ? "retired"
    : row.stopped
      ? "stopped"
      : trackStatus(state).tone === "chequered"
        ? "finished"
        : null;

  const lapTimes = (
    <Panel id="lap-times" title="Lap times" meta={laps.length ? <span className="num">{laps.length} laps</span> : undefined}>
      <LapTimeChart
        laps={laps}
        colour={row.teamColour}
        label={row.code}
        overallBestMs={field?.ms ?? null}
        neutral={neutral}
      />
    </Panel>
  );
  const stintPanel = (
    <Panel id="stints" title="Tyre stints">
      <StintList stints={stintList} totalLaps={state.LapCount?.TotalLaps ?? null} ended={ended != null} />
    </Panel>
  );
  const traces = (
    <Panel id="traces" title="Telemetry traces" meta="Last lap against best lap">
      <DriverTraces state={state} num={num} fieldMs={field?.ms ?? null} ended={ended} />
    </Panel>
  );
  const table = (
    <Panel id="sectors" title="Sector times" meta="Newest lap first">
      <SectorTable laps={laps} field={field!} stints={stintList} maxHeight={wide ? "calc(100dvh - 12rem)" : "28rem"} />
    </Panel>
  );

  return (
    <div className="pt-2">
      <DriverHeader row={row} prev={rows[idx - 1] ?? null} next={rows[idx + 1] ?? null} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {lapTimes}
          {stintPanel}
          {traces}
        </div>
        <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">{table}</div>
      </div>
    </div>
  );
}
