"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  activeLayout,
  addLayout,
  addTile,
  defaultWorkspace,
  moveTile,
  parseWorkspace,
  removeOrResetLayout,
  removeTile,
  renameLayout,
  resizeTile,
  setActive,
  STORAGE_KEY,
  updateTile,
  type DriverRef,
  type Layout,
  type WidgetType,
  type Workspace,
} from "./workspace";

interface Ctx {
  layouts: Layout[];
  layout: Layout;
  setActive: (id: string) => void;
  setDriver: (tileId: string, ref: DriverRef) => void;
  resize: (tileId: string, axis: "w" | "h", dir: 1 | -1) => void;
  move: (tileId: string, to: number) => void;
  remove: (tileId: string) => void;
  add: (type: WidgetType) => void;
  addLayout: () => void;
  rename: (id: string, name: string) => void;
  removeOrReset: (id: string) => void;
}

const WorkspaceContext = createContext<Ctx | null>(null);

/** Layouts and tile arrangement, saved in this browser. Shared so the top bar and the grid agree. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [ws, setWs] = useState<Workspace>(defaultWorkspace);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage once
      setWs(parseWorkspace(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
      /* storage unavailable: keep the defaults */
    }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
    } catch {
      /* storage unavailable */
    }
  }, [ws]);

  const value = useMemo<Ctx>(
    () => ({
      layouts: ws.layouts,
      layout: activeLayout(ws),
      setActive: (id) => setWs((w) => setActive(w, id)),
      setDriver: (id, driver) => setWs((w) => updateTile(w, id, { driver })),
      resize: (id, axis, dir) => setWs((w) => resizeTile(w, id, axis, dir)),
      move: (id, to) => setWs((w) => moveTile(w, id, to)),
      remove: (id) => setWs((w) => removeTile(w, id)),
      add: (type) => setWs((w) => addTile(w, type)),
      addLayout: () => setWs((w) => addLayout(w)),
      rename: (id, name) => setWs((w) => renameLayout(w, id, name)),
      removeOrReset: (id) => setWs((w) => removeOrResetLayout(w, id)),
    }),
    [ws],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): Ctx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
