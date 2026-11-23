import { currentStint, normaliseCompound, teamColour } from "@/lib/timing";
import type { TimingState } from "@/lib/types";
import { TeamBar, TyreBadge, tyreName } from "../timing/Atoms";

/** Team bar, code, name, position and current tyre for one driver. `compact` fits it on one line. */
export function DriverLine({ state, num, compact = false }: { state: TimingState; num: string; compact?: boolean }) {
  const d = state.DriverList?.[num];
  const line = state.TimingData?.Lines?.[num];
  const stint = currentStint(state, num);
  const compound = normaliseCompound(stint?.Compound);
  const age = typeof stint?.TotalLaps === "number" ? stint.TotalLaps : null;
  // Position can be "" before timing starts; Number("") is 0, so require a positive integer.
  const pos = Number(line?.Position ?? line?.Line);
  const hasPos = Number.isInteger(pos) && pos > 0;
  const name = d?.FullName ?? d?.BroadcastName ?? d?.TeamName ?? "";

  const tyre = (
    <span className="flex items-center gap-1.5">
      {stint ? <TyreBadge compound={compound} size={compact ? 22 : 24} /> : <span className="text-faint">—</span>}
      {age != null && (
        <span className="num text-small text-muted">
          {age}
          <span className="sr-only"> laps on {tyreName(compound)}</span>
          <span aria-hidden="true"> L</span>
        </span>
      )}
    </span>
  );

  if (compact) {
    return (
      <div className="flex min-h-7 items-center gap-2.5">
        <TeamBar colour={teamColour(d)} className="h-6" />
        <span className={`text-body font-semibold text-text ${d?.Tla ? "" : "num"}`}>{d?.Tla ?? num}</span>
        <span className="num text-small text-faint">#{num}</span>
        <span className="min-w-0 flex-1 truncate text-small text-muted">{name}</span>
        <span className="num shrink-0 text-body font-bold text-text">
          {hasPos ? (
            <>
              <span className="sr-only">Position </span>P{pos}
            </>
          ) : (
            <span className="text-faint">—</span>
          )}
        </span>
        <span className="shrink-0">{tyre}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <TeamBar colour={teamColour(d)} className="h-9" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`text-title font-semibold text-text ${d?.Tla ? "" : "num"}`}>{d?.Tla ?? num}</span>
          <span className="num text-small text-faint">#{num}</span>
        </div>
        <div className="truncate text-small text-muted">
          {name}
          {d?.TeamName && name !== d.TeamName && <span className="text-faint">, {d.TeamName}</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="text-micro text-muted">Position</span>
        <span className="num text-title font-bold text-text">{hasPos ? `P${pos}` : <span className="text-faint">—</span>}</span>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="text-micro text-muted">Tyre</span>
        {tyre}
      </div>
    </div>
  );
}
