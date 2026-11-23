"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/** The driver (racing number) selected for the telemetry panel and map highlight. */
interface Selection {
  selected: string | null;
  select: (num: string | null) => void;
}

const SelectionContext = createContext<Selection>({ selected: null, select: () => {} });
const KEY = "f1c.selected";

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage once
      if (saved) setSelected(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const select = useCallback((num: string | null) => {
    setSelected(num);
    try {
      if (num) window.localStorage.setItem(KEY, num);
      else window.localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);
  return <SelectionContext.Provider value={{ selected, select }}>{children}</SelectionContext.Provider>;
}

export function useSelection(): Selection {
  return useContext(SelectionContext);
}
