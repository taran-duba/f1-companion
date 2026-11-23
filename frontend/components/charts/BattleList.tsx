import { useId } from "react";
import type { TowerRow, TrackStatusView } from "@/lib/timing";
import { TeamBar } from "../timing/Atoms";

type Tone = TrackStatusView["tone"];

/** Why there are no battles: neutralised or finished sessions get their own copy. */
const NEUTRAL_COPY: Partial<Record<Tone, string>> = {
  sc: "No battles under the safety car. Cars hold position until it comes in.",
  vsc: "No battles under the virtual safety car. Gaps hold until it ends.",
  red: "No battles under the red flag. The session is stopped.",
  chequered: "The race is over, so there are no battles. Final gaps are in the timing tower.",
};
const NO_BATTLES = "No cars within a second of each other right now. Battles appear here as soon as a gap drops under 1.0 s.";

/** Racing for position: not in the pit lane, on an in or out lap, stopped or retired. */
function racing(r: TowerRow): boolean {
  return !r.inPit && !r.pitOut && !r.retired && !r.stopped;
}

/**
 * Every pair currently within a second of each other (row.battle from towerRows). Under
 * SC, VSC, red flag or after the chequered flag nothing is a battle, and cars in the pit
 * lane (in or out) are never part of one.
 */
export function BattleList({ rows, tone }: { rows: TowerRow[]; tone: Tone }) {
  const titleId = useId();
  const neutral = NEUTRAL_COPY[tone];
  const battles = neutral
    ? []
    : rows
        .map((r, i) => ({ r, ahead: rows[i - 1] }))
        .filter(
          (b): b is { r: TowerRow; ahead: TowerRow } => b.r.battle && !!b.ahead && racing(b.r) && racing(b.ahead),
        );

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h3 id={titleId} className="text-small font-semibold text-muted">
        Battles <span className="font-normal text-faint">(within 1 s of the car ahead)</span>
      </h3>
      {battles.length === 0 ? (
        <p className="rounded-chip border border-dashed border-line-strong px-3 py-3 text-small text-muted">
          {neutral ?? NO_BATTLES}
        </p>
      ) : (
        <ul className="flex flex-col">
          {battles.map(({ r, ahead }) => (
            <li key={r.num} className="flex items-center gap-2 border-b border-line py-1.5 text-body last:border-b-0">
              <span className="num w-8 shrink-0 text-right text-small text-faint">P{r.position}</span>
              <span className="inline-flex items-center gap-1.5">
                <TeamBar colour={r.teamColour} className="h-5" />
                <span className="font-semibold">{r.code}</span>
              </span>
              <span className="num font-medium">{(r.interval.seconds ?? 0).toFixed(3)}</span>
              <span className="text-muted">s behind</span>
              <span className="inline-flex items-center gap-1.5">
                <TeamBar colour={ahead.teamColour} className="h-5" />
                <span className="font-semibold">{ahead.code}</span>
              </span>
              {r.catching && (
                <span className="ml-auto text-small text-muted">
                  <span aria-hidden="true">⇢ </span>closing
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
