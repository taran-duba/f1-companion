"use client";

import { EmptyState } from "@/components/Panel";
import { weather } from "@/lib/timing";
import type { TimingState } from "@/lib/types";

/** Track conditions as plain readouts. */
export function WeatherWidget({ state }: { state: TimingState }) {
  const w = weather(state);
  if (!w.known) return <EmptyState>No weather reading yet.</EmptyState>;
  const items: { label: string; value: string; unit: string }[] = [
    { label: "Air", value: w.air != null ? w.air.toFixed(1) : "—", unit: "°C" },
    { label: "Track", value: w.track != null ? w.track.toFixed(1) : "—", unit: "°C" },
    { label: "Humidity", value: w.humidity != null ? w.humidity.toFixed(0) : "—", unit: "%" },
    { label: "Wind", value: w.wind != null ? w.wind.toFixed(1) : "—", unit: "m/s" },
  ];
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {items.map((i) => (
          <div key={i.label}>
            <dt className="text-small font-semibold text-muted">{i.label}</dt>
            <dd className="num text-headline font-bold leading-none">
              {i.value}
              <span className="ml-1 text-small font-semibold text-muted">{i.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className={`text-body font-semibold ${w.rain ? "text-tyre-wet" : "text-muted"}`}>
        {w.rain ? (
          <>
            <span aria-hidden="true">☂ </span>Rain on track
          </>
        ) : (
          "Dry"
        )}
      </p>
    </div>
  );
}
