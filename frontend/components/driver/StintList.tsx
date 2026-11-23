import { Chip, TyreBadge, tyreName } from "@/components/timing/Atoms";
import { EmptyState } from "@/components/Panel";
import type { Compound } from "@/lib/timing";
import type { StintView } from "./model";

const FILL: Record<Compound, string> = {
  SOFT: "var(--color-tyre-soft)",
  MEDIUM: "var(--color-tyre-medium)",
  HARD: "var(--color-tyre-hard)",
  INTERMEDIATE: "var(--color-tyre-inter)",
  WET: "var(--color-tyre-wet)",
  UNKNOWN: "var(--color-muted)",
};

const LETTER: Record<Compound, string> = { SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W", UNKNOWN: "?" };

/** One driver's tyre stints: a bar across the race distance plus a list. */
export function StintList({ stints, totalLaps }: { stints: StintView[]; totalLaps: number | null }) {
  if (!stints.length) {
    return <EmptyState>No tyre data yet. Stints appear once the timing feed reports this driver&apos;s tyres.</EmptyState>;
  }
  const driven = stints.reduce((n, s) => n + s.laps, 0);
  const scale = Math.max(driven, totalLaps ?? 0, 1);
  const remaining = Math.max(0, scale - driven);

  return (
    <div>
      <div className="flex h-7 w-full gap-0.5 overflow-hidden rounded-chip" aria-hidden="true">
        {stints.map((s) =>
          s.laps > 0 ? (
            <div
              key={s.index}
              className="flex min-w-0 items-center justify-center text-micro font-bold text-bg"
              style={{ flexGrow: s.laps, flexBasis: 0, background: FILL[s.compound] }}
            >
              {s.laps / scale > 0.06 && LETTER[s.compound]}
            </div>
          ) : null,
        )}
        {remaining > 0 && (
          <div className="rounded-r-chip border border-dashed border-line-control" style={{ flexGrow: remaining, flexBasis: 0 }} />
        )}
      </div>
      {totalLaps ? (
        <div className="mt-1 flex justify-between text-micro font-normal text-faint" aria-hidden="true">
          <span className="num">Lap 1</span>
          <span className="num">Lap {totalLaps}</span>
        </div>
      ) : null}

      <ol className="mt-3 divide-y divide-line">
        {stints.map((s) => (
          <li key={s.index} className="flex items-center gap-3 py-2">
            <TyreBadge compound={s.compound} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold">{tyreName(s.compound)}</span>
                {s.current && <Chip tone="muted">Current</Chip>}
              </p>
              <p className="flex flex-wrap gap-x-3 text-small text-muted">
                <span className="num">Stint {s.index + 1}</span>
                <span className="num">{s.isNew ? "New set" : s.ageAtFit > 0 ? `Used set, ${s.ageAtFit} laps old` : "Used set"}</span>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p>
                <span className="num font-semibold">{s.laps}</span>
                <span className="text-small text-muted"> {s.laps === 1 ? "lap" : "laps"}</span>
              </p>
              <p className="text-small text-muted">
                From lap <span className="num font-semibold text-text">{s.startLap}</span>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
