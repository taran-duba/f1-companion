"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_ART, DENSITY_RANGE, type ArtParams } from "./slipstream";

export type ArtMode = "off" | "subtle" | "bold";

export interface ArtSettings extends ArtParams {
  mode: ArtMode;
}

const KEY = "f1c.art.v1";
export const DEFAULT_SETTINGS: ArtSettings = { ...DEFAULT_ART, mode: "subtle" };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Read saved settings defensively: any bad field falls back to its default. */
export function parseArt(raw: string | null): ArtSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const d = JSON.parse(raw) as Partial<ArtSettings>;
    return {
      seed: Number.isFinite(d.seed) ? Math.trunc(d.seed as number) : DEFAULT_SETTINGS.seed,
      density: clamp(Number(d.density) || DEFAULT_SETTINGS.density, DENSITY_RANGE[0], DENSITY_RANGE[1]),
      wander: clamp(Number.isFinite(d.wander) ? (d.wander as number) : DEFAULT_SETTINGS.wander, 0, 1),
      tightness: clamp(Number.isFinite(d.tightness) ? (d.tightness as number) : DEFAULT_SETTINGS.tightness, 0, 1),
      mode: d.mode === "off" || d.mode === "bold" || d.mode === "subtle" ? d.mode : "subtle",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface Ctx {
  art: ArtSettings;
  set: (patch: Partial<ArtSettings>) => void;
  reset: () => void;
}

const ArtContext = createContext<Ctx>({ art: DEFAULT_SETTINGS, set: () => {}, reset: () => {} });

/** Background art settings, saved in this browser and shared with the Status page controls. */
export function ArtProvider({ children }: { children: ReactNode }) {
  const [art, setArt] = useState<ArtSettings>(DEFAULT_SETTINGS);
  // State, not a ref: see PrefsProvider (StrictMode's second pass must not read back defaults).
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage once
      setArt(parseArt(window.localStorage.getItem(KEY)));
    } catch {
      /* storage unavailable */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(art));
    } catch {
      /* storage unavailable */
    }
  }, [loaded, art]);

  const value = useMemo<Ctx>(
    () => ({ art, set: (p) => setArt((a) => ({ ...a, ...p })), reset: () => setArt(DEFAULT_SETTINGS) }),
    [art],
  );
  return <ArtContext.Provider value={value}>{children}</ArtContext.Provider>;
}

export function useArt(): Ctx {
  return useContext(ArtContext);
}
