import Link from "next/link";
import { Chip, MarkedTime, TeamBar, TyreBadge, tyreName } from "@/components/timing/Atoms";
import { formatGap, type TowerRow } from "@/lib/timing";

/** Driver summary card for the /driver index; the whole card links to the detail page. */
export function DriverCard({ row }: { row: TowerRow }) {
  const out = row.retired || row.stopped;
  return (
    <Link
      href={`/driver/${encodeURIComponent(row.code)}`}
      className={`flex min-h-11 gap-3 rounded-panel border border-line-strong bg-surface p-3 transition-colors duration-150 hover:bg-raised ${
        out ? "text-muted" : ""
      }`}
    >
      <TeamBar colour={row.teamColour} className="h-auto self-stretch" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <span className="num w-8 text-right text-title font-bold">{out ? "—" : row.position}</span>
          <span className="text-title font-bold tracking-wide">{row.code}</span>
          <span className="ml-auto flex items-center gap-1.5">
            {row.inPit && <Chip tone="warn">In pit</Chip>}
            {row.retired && <Chip tone="danger">Retired</Chip>}
            {row.stopped && !row.retired && <Chip tone="danger">Stopped</Chip>}
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
            <dd className="num text-body font-medium">{formatGap(row.gap)}</dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}
