import Link from "next/link";
import { Chip, MarkedTime, TeamBar, TyreBadge, tyreName } from "@/components/timing/Atoms";
import { formatGap, type TowerRow } from "@/lib/timing";

const href = (row: TowerRow) => `/driver/${encodeURIComponent(row.code)}`;

/** Status chips shared by the card and the compact row. Retired matches the tower's "DNF". */
function StatusChips({ row }: { row: TowerRow }) {
  return (
    <>
      {row.inPit && !row.retired && <Chip tone="warn">In pit</Chip>}
      {row.retired && <Chip tone="danger">DNF</Chip>}
      {row.stopped && !row.retired && <Chip tone="danger">Stopped</Chip>}
    </>
  );
}

/** Retired or stopped cars have no meaningful position or gap. */
const isOut = (row: TowerRow) => row.retired || row.stopped;

/** Driver summary card for the /driver index (≥640px); the whole card links to the detail page. */
export function DriverCard({ row }: { row: TowerRow }) {
  const out = isOut(row);
  return (
    <Link
      href={href(row)}
      className={`flex min-h-11 gap-3 rounded-panel border border-line-strong bg-surface p-3 transition-colors duration-150 hover:bg-raised motion-reduce:transition-none ${
        out ? "text-muted" : ""
      }`}
    >
      <TeamBar colour={row.teamColour} className="h-auto self-stretch" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <span className="num w-8 text-right text-title font-bold">{out ? "—" : row.position}</span>
          <span className="text-title font-bold tracking-wide">{row.code}</span>
          <span className="ml-auto flex items-center gap-1.5">
            <StatusChips row={row} />
            <TyreBadge compound={row.compound} />
            <span className="num min-w-12 text-small text-muted">
              {row.tyreAge != null ? `${row.tyreAge} ${row.tyreAge === 1 ? "lap" : "laps"}` : "—"}
              <span className="sr-only"> on {tyreName(row.compound)}</span>
            </span>
          </span>
        </div>
        <p className="mt-1 truncate font-semibold">{row.name}</p>
        <p className="truncate text-small text-muted">{row.team || "Team unknown"}</p>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-micro text-muted">Last lap</dt>
            <dd className="text-body font-medium">
              {/* No legend on the card: drop colour-only yellow, keep ◆/▲ marks. */}
              <MarkedTime value={row.lastLap.value} mark={row.lastLap.mark === "yellow" ? "none" : row.lastLap.mark} />
            </dd>
          </div>
          <div>
            <dt className="text-micro text-muted">Gap</dt>
            <dd className="num text-body font-medium">{out ? <span className="text-faint">—</span> : formatGap(row.gap)}</dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}

/**
 * One ~56px row per driver for phones (<640px), so 20 drivers fit in about
 * three screens instead of eleven: position, team bar, code, name, tyre, gap.
 */
export function DriverRow({ row }: { row: TowerRow }) {
  const out = isOut(row);
  return (
    <Link
      href={href(row)}
      className={`flex min-h-14 items-center gap-2.5 px-3 py-1.5 transition-colors duration-150 hover:bg-raised motion-reduce:transition-none ${
        out ? "text-muted" : ""
      }`}
    >
      <span className="num w-6 shrink-0 text-right text-title font-bold">{out ? "—" : row.position}</span>
      <TeamBar colour={row.teamColour} className="h-8" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-bold tracking-wide">{row.code}</span>
          <StatusChips row={row} />
        </span>
        <span className="block truncate text-small text-muted">{row.name}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <TyreBadge compound={row.compound} size={22} />
        <span className="num w-5 text-small text-muted">
          {row.tyreAge ?? "—"}
          <span className="sr-only">{row.tyreAge != null ? ` ${row.tyreAge === 1 ? "lap" : "laps"}` : ""} on {tyreName(row.compound)}</span>
        </span>
      </span>
      <span className="num w-[4.5rem] shrink-0 text-right font-medium">
        <span className="sr-only">, gap </span>
        {out ? <span className="text-faint">—</span> : formatGap(row.gap)}
      </span>
    </Link>
  );
}
