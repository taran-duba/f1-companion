import Link from "next/link";
import type { ReactNode } from "react";
import { FavouriteStar } from "@/components/FavouriteStar";
import { Chip, MarkedTime, TeamBar, TyreBadge, tyreName } from "@/components/timing/Atoms";
import type { TowerRow } from "@/lib/timing";
import { GapText } from "./DriverCard";

/** Driver identity, race situation and prev/next navigation by position. */
export function DriverHeader({ row, prev, next }: { row: TowerRow; prev: TowerRow | null; next: TowerRow | null }) {
  const out = row.retired || row.stopped;
  return (
    <header className="mb-6">
      <nav aria-label="Driver navigation" className="mb-3 flex flex-col items-start gap-2 md:flex-row md:items-center">
        <NavLink href="/" className="md:mr-auto">
          <span aria-hidden="true">←</span> Back to live
        </NavLink>
        <div className="flex w-full gap-2 md:w-auto">
          <DriverLink target={prev} dir="prev" />
          <DriverLink target={next} dir="next" />
        </div>
      </nav>

      {/* The team's colour washes in behind the name, like a broadcast driver card. */}
      <div
        className="-mx-1 flex items-stretch gap-3 rounded-panel px-1 py-1"
        style={{ backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${row.teamColour} 22%, transparent), transparent 60%)` }}
      >
        <TeamBar colour={row.teamColour} className="h-auto min-h-16 !w-1.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="num text-headline font-bold">
              {/* The DNF / Stopped chip says why; a screen reader shouldn't announce a bare dash. */}
              {out ? (
                <span aria-hidden="true" className="text-muted">
                  —
                </span>
              ) : (
                <>
                  <span className="sr-only">Position </span>P{row.position}
                </>
              )}
            </span>
            <h1 className="text-headline font-bold tracking-wide">{row.code}</h1>
            <span className="min-w-0 truncate text-title font-semibold">{row.name}</span>
            <FavouriteStar code={row.code} className="-my-2 self-center" />
            {row.fastestLap && <Chip tone="muted" title="Fastest lap of the session">Fastest lap</Chip>}
            {row.inPit && <Chip tone="warn">In pit</Chip>}
            {row.pitOut && !row.inPit && <Chip tone="warn">Out lap</Chip>}
            {/* "DNF" as in the tower, cards and strategy chart; the title spells it out. */}
            {row.retired && (
              <Chip tone="danger" title="Did not finish (retired)">
                DNF
              </Chip>
            )}
            {row.stopped && !row.retired && <Chip tone="danger">Stopped</Chip>}
          </div>
          <p className="text-small text-muted">{row.team || "Team unknown"}</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 xl:flex xl:flex-wrap xl:gap-x-10">
        <Stat label="Tyre">
          <span className="flex flex-wrap items-center gap-x-2">
            <TyreBadge compound={row.compound} />
            <span>{tyreName(row.compound)}</span>
            {row.tyreAge != null && (
              <span className="num whitespace-nowrap text-muted">
                {row.tyreAge} {row.tyreAge === 1 ? "lap" : "laps"}
              </span>
            )}
          </span>
        </Stat>
        {row.grid != null && (
          <Stat label="Started">
            <span className="num">
              P{row.grid}
              {row.gained ? (
                <span className={`ml-2 text-small font-semibold ${row.gained > 0 ? "text-ok" : "text-danger"}`}>
                  {row.gained > 0 ? `▲ ${row.gained} gained` : `▼ ${-row.gained} lost`}
                </span>
              ) : null}
            </span>
          </Stat>
        )}
        <Stat label="Pit stops">
          <span className="num">{row.pits}</span>
        </Stat>
        <Stat label="Gap to leader">
          {/* A retired or stopped car's last gap is stale: show none, as the tower does. */}
          <span className="num">
            <GapText gap={row.gap} out={out} leader={row.position === 1} />
          </span>
        </Stat>
        <Stat label="Interval">
          <span className="num">
            <GapText gap={row.interval} out={out} leader={row.position === 1} />
          </span>
        </Stat>
        <Stat label="Last lap">
          {/* Yellow ("slower than personal best") has no glyph and no legend here, so show it plain. */}
          <MarkedTime value={row.lastLap.value} mark={row.lastLap.mark === "yellow" ? "none" : row.lastLap.mark} />
        </Stat>
        <Stat label="Best lap">
          <MarkedTime value={row.bestLap.value} mark={row.bestLap.mark} />
        </Stat>
      </dl>
    </header>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-small font-semibold text-muted">{label}</dt>
      <dd className="mt-0.5 text-row font-medium">{children}</dd>
    </div>
  );
}

function NavLink({ href, children, className = "", label }: { href: string; children: ReactNode; className?: string; label?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={`inline-flex min-h-11 items-center gap-2 rounded-chip border border-line-control px-3 text-body transition-colors duration-150 hover:bg-raised ${className}`}
    >
      {children}
    </Link>
  );
}

function DriverLink({ target, dir }: { target: TowerRow | null; dir: "prev" | "next" }) {
  const word = dir === "prev" ? "Previous" : "Next";
  // A retired or stopped car has no race position (its own header shows "—"), so don't label it "P20".
  const out = !!target && (target.retired || target.stopped);
  if (!target) {
    return (
      <span className="inline-flex min-h-11 flex-1 items-center justify-center rounded-chip border border-line px-3 text-body text-faint md:flex-none">
        {dir === "prev" ? "First" : "Last"} car
      </span>
    );
  }
  return (
    <NavLink
      href={`/driver/${encodeURIComponent(target.code)}`}
      className={`flex-1 md:flex-none ${dir === "prev" ? "justify-start" : "justify-end"}`}
      label={`${word} driver: ${out ? "" : `P${target.position} `}${target.code}, ${target.name}${
        out ? (target.retired ? ", retired" : ", stopped") : ""
      }`}
    >
      {dir === "prev" && <span aria-hidden="true">←</span>}
      <span className="num text-muted">{out ? "—" : `P${target.position}`}</span>
      <span className="font-semibold">{target.code}</span>
      {dir === "next" && <span aria-hidden="true">→</span>}
    </NavLink>
  );
}
