"use client";

import { useMemo } from "react";
import { TeamBar } from "@/components/timing/Atoms";
import { usePrefs } from "@/lib/prefs";
import { useStream } from "@/lib/store";
import { driverList, teamColour } from "@/lib/timing";

const CHIP =
  "inline-flex min-h-11 items-center gap-2 rounded-chip border px-3 text-small font-semibold transition-colors duration-150 lg:min-h-9";

/**
 * Star drivers and teams. Favourites are highlighted in the tower, followed by default when
 * a session starts, and are who the "favourites" alerts are about.
 */
export function FavouritesSection() {
  const { state } = useStream();
  const { prefs, toggleDriver, toggleTeam } = usePrefs();
  const teams = useMemo(() => {
    const byTeam = new Map<string, { colour: string; drivers: { code: string; name: string }[] }>();
    for (const d of state ? driverList(state) : []) {
      const team = d.TeamName || "Unknown team";
      const entry = byTeam.get(team) ?? { colour: teamColour(d), drivers: [] };
      entry.drivers.push({ code: (d.Tla ?? d.RacingNumber).toUpperCase(), name: d.FullName ?? d.BroadcastName ?? d.RacingNumber });
      byTeam.set(team, entry);
    }
    return [...byTeam.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [state]);
  const here = new Set(teams.flatMap(([, t]) => t.drivers.map((d) => d.code)));
  const teamNames = new Set(teams.map(([n]) => n));
  const elsewhere = [...prefs.drivers.filter((c) => !here.has(c)), ...prefs.teams.filter((t) => !teamNames.has(t))];

  return (
    <div className="grid gap-4">
      {!teams.length && <p className="text-small text-muted">Drivers appear here once a session is loaded.</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {teams.map(([team, t]) => {
          const teamOn = prefs.teams.includes(team);
          return (
            <li key={team} className="rounded-chip border border-line p-2">
              <button
                type="button"
                aria-pressed={teamOn}
                onClick={() => toggleTeam(team)}
                className={`${CHIP} w-full justify-start border-transparent ${teamOn ? "bg-raised text-text" : "text-muted hover:bg-raised/60 hover:text-text"}`}
              >
                <TeamBar colour={t.colour} className="h-5" />
                <span className="min-w-0 truncate">{team}</span>
                <Star on={teamOn} />
              </button>
              <div className="mt-1 flex flex-wrap gap-1 pl-3">
                {t.drivers.map((d) => {
                  const on = prefs.drivers.includes(d.code);
                  return (
                    <button
                      key={d.code}
                      type="button"
                      aria-pressed={on}
                      title={d.name}
                      onClick={() => toggleDriver(d.code)}
                      className={`${CHIP} ${on ? "border-text text-text" : "border-line-control text-muted hover:text-text"}`}
                    >
                      {d.code}
                      <span className="font-normal">{d.name.split(" ").slice(-1)[0]}</span>
                      <Star on={on} />
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      {elsewhere.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-small text-muted">
          Also starred, not in this session:
          {elsewhere.map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => (prefs.teams.includes(x) ? toggleTeam(x) : toggleDriver(x))}
              className="inline-flex min-h-9 items-center gap-1 rounded-chip border border-line-control px-2 font-semibold text-text hover:bg-raised"
              aria-label={`Remove ${x} from favourites`}
            >
              {x} <span aria-hidden="true">×</span>
            </button>
          ))}
        </p>
      )}
    </div>
  );
}

function Star({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={`ml-auto pl-1 ${on ? "text-text" : "text-faint"}`}>
      {on ? "★" : "☆"}
    </span>
  );
}
