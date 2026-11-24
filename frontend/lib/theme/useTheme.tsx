"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_THEME_ID, isDarkTheme, parseCustom, PRESETS, themeVars, type Theme, type ThemeInput } from "./themes";

export const THEME_KEY = "f1c.theme.v1";

interface Saved {
  active: string;
  custom: Theme[];
  /** Resolved variables, so the pre-paint script can apply them without the theme code. */
  vars?: Record<string, string>;
  dark?: boolean;
}

/**
 * Runs in <head> before the first paint: applies the saved variables so a custom theme
 * doesn't flash the default one. Keep it tiny and dependency free.
 */
export const THEME_BOOT_SCRIPT = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_KEY)})||"null");if(s&&s.vars){var r=document.documentElement;for(var k in s.vars){if(/^--[a-z0-9-]+$/.test(k))r.style.setProperty(k,String(s.vars[k]))}r.style.colorScheme=s.dark?"dark":"light";r.dataset.theme=s.dark?"dark":"light"}}catch(e){}`;

function load(): Saved {
  try {
    const raw = JSON.parse(window.localStorage.getItem(THEME_KEY) ?? "null") as Partial<Saved> | null;
    const custom = Array.isArray(raw?.custom) ? raw.custom.map(parseCustom).filter((x): x is Theme => !!x).slice(0, 12) : [];
    return { active: typeof raw?.active === "string" ? raw.active : DEFAULT_THEME_ID, custom };
  } catch {
    return { active: DEFAULT_THEME_ID, custom: [] };
  }
}

function apply(input: ThemeInput) {
  const root = document.documentElement;
  const vars = themeVars(input);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  const dark = isDarkTheme(input);
  root.style.colorScheme = dark ? "dark" : "light";
  root.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", input.bg);
  return { vars, dark };
}

interface Ctx {
  theme: Theme;
  presets: Theme[];
  custom: Theme[];
  setActive: (id: string) => void;
  /** Add or replace a custom theme and switch to it. */
  saveCustom: (theme: Theme) => void;
  deleteCustom: (id: string) => void;
  /** Show colours without saving them (the editor's live preview); null restores the theme. */
  preview: (input: ThemeInput | null) => void;
}

const fallback = PRESETS.find((p) => p.id === DEFAULT_THEME_ID) ?? PRESETS[0];

const ThemeContext = createContext<Ctx>({
  theme: fallback,
  presets: PRESETS,
  custom: [],
  setActive: () => {},
  saveCustom: () => {},
  deleteCustom: () => {},
  preview: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Saved>({ active: DEFAULT_THEME_ID, custom: [] });
  const [draft, setDraft] = useState<ThemeInput | null>(null);
  // State, not a ref: nothing may be written back until a render has the loaded value, or
  // StrictMode's second effect pass would read back the defaults we just saved.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage once
    setSaved(load());
    setLoaded(true);
  }, []);

  const theme = useMemo(
    () => [...PRESETS, ...saved.custom].find((x) => x.id === saved.active) ?? fallback,
    [saved],
  );

  // Apply the draft while editing, else the active theme; persist the resolved variables.
  // A layout effect, so the variables are in place before any child's effect reads them
  // (the background art paints from them).
  useLayoutEffect(() => {
    if (!loaded) return;
    const { vars, dark } = apply(draft ?? theme.input);
    if (draft) return;
    try {
      window.localStorage.setItem(THEME_KEY, JSON.stringify({ active: theme.id, custom: saved.custom, vars, dark } satisfies Saved));
    } catch {
      /* storage unavailable */
    }
  }, [loaded, theme, draft, saved.custom]);

  const setActive = useCallback((id: string) => setSaved((s) => ({ ...s, active: id })), []);
  const saveCustom = useCallback((th: Theme) => {
    setSaved((s) => {
      const custom = s.custom.some((c) => c.id === th.id) ? s.custom.map((c) => (c.id === th.id ? th : c)) : [...s.custom, th];
      return { active: th.id, custom };
    });
  }, []);
  const deleteCustom = useCallback((id: string) => {
    setSaved((s) => ({ active: s.active === id ? DEFAULT_THEME_ID : s.active, custom: s.custom.filter((c) => c.id !== id) }));
  }, []);

  const value = useMemo<Ctx>(
    () => ({ theme, presets: PRESETS, custom: saved.custom, setActive, saveCustom, deleteCustom, preview: setDraft }),
    [theme, saved.custom, setActive, saveCustom, deleteCustom],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  return useContext(ThemeContext);
}
