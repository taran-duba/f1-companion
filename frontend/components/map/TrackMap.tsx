"use client";

import { useState } from "react";
import { OpenSources } from "../sources/OpenSources";
import { useFit } from "@/lib/fit";
import { useSelection } from "@/lib/selection";
import { useStream } from "@/lib/store";
import { carLabel, carMarkers, mapSummary, mapView, outlinePath, placeLabels } from "@/lib/trackmap";
import type { TimingState } from "@/lib/types";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { EmptyState } from "../Panel";
import { CarDot, CarLabel } from "./CarDot";
import { MapLegend } from "./MapLegend";
import { useBoxSize } from "./useBoxSize";

/** Tallest the map gets; width follows the circuit's aspect ratio. */
const MAX_HEIGHT = 420;

export function TrackMap({ state, selected }: { state: TimingState; selected: string | null }) {
  const { status, generation } = useStream();
  const { select } = useSelection();
  const wide = useMediaQuery("(min-width: 1024px)");
  // null = follow the default for this width (on at desktop, off on phone).
  const [codesChoice, setCodesChoice] = useState<boolean | null>(null);
  const showCodes = codesChoice ?? wide;
  const [boxRef, box] = useBoxSize<HTMLDivElement>();
  const fit = useFit();

  const trackMap = state.Derived?.TrackMap;
  const points = trackMap?.points;
  const closed = !!trackMap?.closed;
  const view = mapView(state);
  // ≤ 600 points (backend downsamples), so rebuilding the path per update is cheap.
  const path = view && points?.length ? outlinePath(view, points, closed) : "";
  const cars = view ? carMarkers(state, view) : [];

  const live = status?.source.kind === "live";
  const noPositionFeed = state.Feed ? !state.Feed.position : !state.Position;
  // A token that is set but whose position feed hasn't started yet falls through to the empty state below.
  if (live && noPositionFeed && !cars.length && status?.source.token_present !== true) {
    return (
      <EmptyState>
        Car telemetry needs an F1 TV token in live mode. Timing still works. The track map is drawn from car
        positions, so it appears once a token is set.{" "}
        <OpenSources token>Add your F1 TV token</OpenSources>.
      </EmptyState>
    );
  }
  if (!view || (!path && !cars.length)) {
    return (
      <EmptyState>
        Track map appears once cars have done a lap. The circuit is traced from car positions, so keep the session
        running (in a replay, press play or seek forward).
      </EmptyState>
    );
  }

  const summary = mapSummary(cars, selected, closed);
  const labels = cars.map((c, i) => {
    const isSel = c.num === selected;
    return {
      num: c.num,
      left: c.left,
      top: c.top,
      label: carLabel(c, isSel, showCodes),
      priority: isSel ? 0 : c.leader ? 1 : 2 + i,
      radius: isSel ? 11 : 7,
    };
  });
  const sides = placeLabels(labels, box.width, box.height);

  return (
    <figure className={`m-0 flex flex-col gap-3 ${fit ? "h-full" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-small text-muted" aria-live="polite">
          {closed ? "Circuit traced from car positions" : "Tracing circuit from car positions"}
        </p>
        <button
          type="button"
          aria-pressed={showCodes}
          onClick={() => setCodesChoice(!showCodes)}
          className="inline-flex min-h-11 items-center gap-2 rounded-chip border border-line-control px-3 text-small font-semibold text-text hover:bg-raised lg:min-h-9"
        >
          <span
            aria-hidden="true"
            className={`flex size-4 items-center justify-center rounded-[3px] border text-micro leading-none ${
              showCodes ? "border-accent bg-accent text-on-accent" : "border-line-control"
            }`}
          >
            {showCodes ? "✓" : ""}
          </span>
          Show codes
        </button>
      </div>

      {/* Fit mode: the circuit takes the height the tile has left, at its own aspect ratio. */}
      <div className={fit ? "min-h-0 flex-1" : ""} style={fit ? { containerType: "size" } : undefined}>
      <div
        ref={boxRef}
        className="relative isolate mx-auto w-full"
        style={
          fit
            ? { aspectRatio: String(view.aspect), width: `min(100cqw, ${(view.aspect * 100).toFixed(2)}cqh)` }
            : { aspectRatio: String(view.aspect), maxWidth: `min(100%, ${Math.round(MAX_HEIGHT * view.aspect)}px)` }
        }
      >
        <svg
          viewBox={`0 0 ${view.width} ${view.height}`}
          className="absolute inset-0 size-full"
          aria-hidden="true"
          focusable="false"
        >
          {path && (
            <>
              <path
                d={path}
                fill="none"
                stroke="var(--color-line-strong)"
                strokeWidth={8}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                // With non-scaling-stroke, browsers apply the dash pattern in screen pixels.
                strokeDasharray={closed ? undefined : "12 8"}
              />
              {closed && (
                <path
                  d={path}
                  fill="none"
                  stroke="var(--color-bg)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </>
          )}
        </svg>
        <ul
          key={generation}
          aria-label="Cars on track, in race order" className="absolute inset-0 m-0 list-none p-0"
          style={{ containerType: "size" }}
        >
          {cars.map((c) => (
            <CarDot key={c.num} car={c} selected={c.num === selected} onSelect={select} />
          ))}
        </ul>
        <div
          key={`labels-${generation}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30"
          style={{ containerType: "size" }}
        >
          {cars.map((c, i) => {
            const side = sides.get(c.num);
            return side && labels[i].label ? (
              <CarLabel key={c.num} car={c} selected={c.num === selected} label={labels[i].label} side={side} />
            ) : null;
          })}
        </div>
      </div>
      </div>

      <figcaption className="flex flex-col gap-2">
        <span className="num text-small text-faint">{summary}</span>
        <MapLegend />
      </figcaption>
    </figure>
  );
}
