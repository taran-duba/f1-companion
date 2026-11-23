import { currentStint, normaliseCompound, teamColour } from "@/lib/timing";
import type { TimingState } from "@/lib/types";
import { TeamBar, TyreBadge, tyreName } from "../timing/Atoms";

/** Team bar, code, name, position and current tyre for one driver. */
export function DriverLine({ state, num }: { state: TimingState; num: string }) {
  const d = state.DriverList?.[num];
  const line = state.TimingData?.Lines?.[num];
  const stint = currentStint(state, num);
  const compound = normaliseCompound(stint?.Compound);
  const age = typeof stint?.TotalLaps === "number" ? stint.TotalLaps : null;
  // Position can be "" before timing starts; Number("") is 0, so require a positive integer.
  const pos = Number(line?.Position ?? line?.Line);
  const hasPos = Number.isInteger(pos) && pos > 0;
  const name = d?.FullName ?? d?.BroadcastName ?? d?.TeamName ?? "";

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
        <span className="flex items-center gap-1.5">
          {stint ? <TyreBadge compound={compound} size={24} /> : <span className="text-faint">—</span>}
          {age != null && (
            <span className="num text-small text-muted">
              {age}
              <span className="sr-only"> laps on {tyreName(compound)}</span>
              <span aria-hidden="true"> L</span>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
