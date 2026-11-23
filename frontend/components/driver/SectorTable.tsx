"use client";

import { Chip, MarkedTime, TyreBadge, tyreName } from "@/components/timing/Atoms";
import { EmptyState } from "@/components/Panel";
import { formatMs } from "@/lib/timing";
import type { LapRecord } from "@/lib/types";
import { bestsOf, lapTyre, markFor, type Bests, type StintView, type TimeKey } from "./model";

/**
 * Lap-by-lap sector times, newest first. ▲ green = this driver's best in the
 * column, ◆ purple = best in the whole field. Scrolls vertically only.
 */
export function SectorTable({
  laps,
  field,
  stints = [],
  maxHeight = "28rem",
}: {
  laps: LapRecord[];
  field: Bests;
  stints?: StintView[];
  maxHeight?: string;
}) {
  if (!laps.length) {
    return <EmptyState>No laps completed yet. Sector times appear here as each lap is finished.</EmptyState>;
  }
  const personal = bestsOf(laps);
  const rows = [...laps].sort((a, b) => b.lap - a.lap);
  const cell = (lap: LapRecord, key: TimeKey) => {
    const v = lap[key];
    const value = v != null && v > 0 ? formatMs(v, { sector: key !== "ms" }) : "";
    return <MarkedTime value={value} mark={markFor(v, personal[key], field[key])} />;
  };

  return (
    <div>
      <div
        role="region"
        aria-label="Sector times by lap, newest first"
        tabIndex={0}
        className="overflow-y-auto overflow-x-hidden rounded-chip border border-line"
        style={{ maxHeight }}
      >
        <table className="w-full border-separate border-spacing-0 text-small md:text-body">
          <caption className="sr-only">Sector and lap times for each lap, newest lap first</caption>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="text-small font-semibold text-muted">
              <Th align="left" className="pl-1.5 md:pl-2">Lap</Th>
              <Th>S1</Th>
              <Th>S2</Th>
              <Th>S3</Th>
              <Th>Time</Th>
              <Th align="left" className="pl-1.5 md:pl-2">Tyre</Th>
              <Th className="hidden pr-2 md:table-cell">Pos</Th>
            </tr>
          </thead>
          <tbody className="[&>tr+tr>*]:border-t [&>tr>*]:border-line">
            {rows.map((lap) => {
              const tyre = lapTyre(lap, stints);
              const pit = lap.pitIn || lap.pitOut;
              return (
                <tr key={lap.lap}>
                  <th scope="row" className="py-1.5 pl-1.5 pr-0.5 text-left font-normal md:pl-2 md:pr-1">
                    <span className="flex flex-col items-start gap-0.5 md:flex-row md:items-center md:gap-2">
                      <span className="num font-semibold">{lap.lap}</span>
                      {pit && (
                        <Chip tone="warn" title={lap.pitIn ? "Pit in lap" : "Out lap"}>
                          Pit<span className="sr-only">{lap.pitIn ? " in" : " out"}</span>
                        </Chip>
                      )}
                    </span>
                  </th>
                  <td className="px-0.5 text-right md:px-1">{cell(lap, "s1")}</td>
                  <td className="px-0.5 text-right md:px-1">{cell(lap, "s2")}</td>
                  <td className="px-0.5 text-right md:px-1">{cell(lap, "s3")}</td>
                  <td className="px-0.5 text-right md:px-1">{cell(lap, "ms")}</td>
                  <td className="py-1 pl-1.5 pr-1 md:pl-2">
                    <span className="flex items-center gap-1.5">
                      {tyre.known ? <TyreBadge compound={tyre.compound} size={20} /> : <span className="text-faint">—</span>}
                      {tyre.known && tyre.age != null && (
                        <span className="num hidden text-small text-muted md:inline" aria-label={`${tyreName(tyre.compound)}, ${tyre.age} laps old`}>
                          {tyre.age}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="num hidden pr-2 text-right md:table-cell">{lap.pos ?? <span className="text-faint">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-micro font-normal text-muted">
        <span>
          <span aria-hidden="true" className="text-sector-purple">
            ◆
          </span>{" "}
          Fastest in the field
        </span>
        <span>
          <span aria-hidden="true" className="text-sector-green">
            ▲
          </span>{" "}
          Personal best
        </span>
      </p>
    </div>
  );
}

function Th({ children, className = "", align = "right" }: { children: React.ReactNode; className?: string; align?: "left" | "right" }) {
  return (
    <th scope="col" className={`border-b border-line-strong px-0.5 py-2 md:px-1 font-semibold ${align === "left" ? "text-left" : "text-right"} ${className}`}>
      {children}
    </th>
  );
}
