"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Who an alert is about: nobody, your favourites (and the followed driver), or everyone. */
export type NotifyLevel = "off" | "favs" | "all";
export type EventKind = "overtake" | "fastest" | "pit" | "retire" | "flag" | "penalty" | "radio";

export interface Prefs {
  /** Favourite drivers by three-letter code, upper case. */
  drivers: string[];
  /** Favourite teams by name. */
  teams: string[];
  /** The tower's main gap column: to the car ahead, or to the leader. */
  towerGap: "interval" | "leader";
  /** Seconds the live feed is held back to line up with a TV broadcast. */
  delaySec: number;
  notify: Record<EventKind, NotifyLevel>;
}

export const MAX_DELAY_SEC = 300;

export const EVENT_KINDS: { kind: EventKind; label: string; hint: string }[] = [
  { kind: "overtake", label: "Overtakes", hint: "A pass on track, not through the pits." },
  { kind: "pit", label: "Pit stops", hint: "Who pitted and what tyres they took." },
  { kind: "fastest", label: "Fastest lap", hint: "A new fastest lap of the race." },
  { kind: "flag", label: "Flags and safety car", hint: "Safety car, VSC, red flag, track clear, chequered flag." },
  { kind: "penalty", label: "Penalties and investigations", hint: "Stewards' decisions from race control." },
  { kind: "retire", label: "Retirements", hint: "A car stops or retires." },
  { kind: "radio", label: "Team radio", hint: "A new radio clip, with a play button." },
];

export const DEFAULT_PREFS: Prefs = {
  drivers: [],
  teams: [],
  towerGap: "interval",
  delaySec: 0,
  notify: { overtake: "favs", pit: "favs", fastest: "all", flag: "all", penalty: "favs", retire: "all", radio: "favs" },
};

const KEY = "f1c.prefs.v1";
const LEVELS: NotifyLevel[] = ["off", "favs", "all"];

const strings = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim().slice(0, 40)))].slice(0, max) : [];

/** Read saved preferences defensively: any bad field falls back to its default. */
export function parsePrefs(raw: string | null): Prefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const d = JSON.parse(raw) as Partial<Prefs> | null;
    if (!d || typeof d !== "object") return DEFAULT_PREFS;
    const notify = { ...DEFAULT_PREFS.notify };
    for (const { kind } of EVENT_KINDS) {
      const v = (d.notify as Record<string, unknown> | undefined)?.[kind];
      if (LEVELS.includes(v as NotifyLevel)) notify[kind] = v as NotifyLevel;
    }
    const delay = Number(d.delaySec);
    return {
      drivers: strings(d.drivers, 40).map((s) => s.toUpperCase()),
      teams: strings(d.teams, 20),
      towerGap: d.towerGap === "leader" ? "leader" : "interval",
      delaySec: Number.isFinite(delay) ? Math.round(Math.min(MAX_DELAY_SEC, Math.max(0, delay))) : 0,
      notify,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

interface Ctx {
  prefs: Prefs;
  set: (patch: Partial<Prefs>) => void;
  setNotify: (kind: EventKind, level: NotifyLevel) => void;
  toggleDriver: (code: string) => void;
  toggleTeam: (team: string) => void;
}

const PrefsContext = createContext<Ctx>({
  prefs: DEFAULT_PREFS,
  set: () => {},
  setNotify: () => {},
  toggleDriver: () => {},
  toggleTeam: () => {},
});

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Viewer preferences, saved in this browser: favourites, tower, TV delay, alerts. */
export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  // State, not a ref: nothing is written back until a render has the loaded value, or
  // StrictMode's second effect pass would read back the defaults we just saved.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage once
      setPrefs(parsePrefs(window.localStorage.getItem(KEY)));
    } catch {
      /* storage unavailable */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable */
    }
  }, [loaded, prefs]);

  const set = useCallback((patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch })), []);
  const setNotify = useCallback((kind: EventKind, level: NotifyLevel) => setPrefs((p) => ({ ...p, notify: { ...p.notify, [kind]: level } })), []);
  const toggleDriver = useCallback((code: string) => setPrefs((p) => ({ ...p, drivers: toggle(p.drivers, code.toUpperCase()) })), []);
  const toggleTeam = useCallback((team: string) => setPrefs((p) => ({ ...p, teams: toggle(p.teams, team) })), []);

  const value = useMemo(() => ({ prefs, set, setNotify, toggleDriver, toggleTeam }), [prefs, set, setNotify, toggleDriver, toggleTeam]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Ctx {
  return useContext(PrefsContext);
}

/** Is this driver a favourite, directly or through their team? */
export function isFavourite(prefs: Pick<Prefs, "drivers" | "teams">, code: string, team?: string): boolean {
  return prefs.drivers.includes(code.toUpperCase()) || (!!team && prefs.teams.includes(team));
}
