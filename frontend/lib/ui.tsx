"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type SourceTab = "live" | "replay";

interface Ui {
  sourcesOpen: boolean;
  sourceTab: SourceTab;
  /** Set when something asks for the F1 TV token field specifically (e.g. a telemetry tile). */
  wantToken: boolean;
  openSources: (tab?: SourceTab, opts?: { token?: boolean }) => void;
  closeSources: () => void;
  setSourceTab: (tab: SourceTab) => void;
}

const UiContext = createContext<Ui>({
  sourcesOpen: false,
  sourceTab: "live",
  wantToken: false,
  openSources: () => {},
  closeSources: () => {},
  setSourceTab: () => {},
});

/** Which panels are open. The source panel is app-wide: any tile can ask for it. */
export function UiProvider({ children }: { children: ReactNode }) {
  const [sourcesOpen, setOpen] = useState(false);
  const [sourceTab, setSourceTab] = useState<SourceTab>("live");
  const [wantToken, setWantToken] = useState(false);

  const openSources = useCallback((tab?: SourceTab, opts?: { token?: boolean }) => {
    if (tab) setSourceTab(tab);
    setWantToken(!!opts?.token);
    setOpen(true);
  }, []);
  const closeSources = useCallback(() => {
    setOpen(false);
    setWantToken(false);
  }, []);

  const value = useMemo(
    () => ({ sourcesOpen, sourceTab, wantToken, openSources, closeSources, setSourceTab }),
    [sourcesOpen, sourceTab, wantToken, openSources, closeSources],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): Ui {
  return useContext(UiContext);
}
