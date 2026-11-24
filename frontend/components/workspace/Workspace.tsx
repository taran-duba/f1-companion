"use client";

/*
 * THESIS: a race is watched through several windows at once, so the home screen is a
 * workspace of tiles you arrange, not a fixed dashboard with a page per topic.
 * OWN-WORLD: Ember carbon (#0e0b0d), amber accent, hairline-framed tiles on a 12-column
 * grid, tabular numerals, one quiet top bar. Chrome recedes; the data is the colour.
 * STORY: pick a layout (Race, Duel, Pit wall, Analysis), follow a driver, pin more drivers
 * to extra tiles, and reshape any of it in Customize. Sources live in one panel.
 * FIRST VIEWPORT: timing tower left (5/12, full height), telemetry over map + race control.
 * FORM: operate-mode workspace (tiling panes), after trading-desk and DAW layouts.
 */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { LoadingState } from "@/components/LoadingState";
import { SessionStrip } from "@/components/shell/SessionStrip";
import { FavouriteStar } from "@/components/FavouriteStar";
import { isFavourite, usePrefs } from "@/lib/prefs";
import { useSelection } from "@/lib/selection";
import { useStream } from "@/lib/store";
import { towerRows } from "@/lib/timing";
import { FitContext } from "@/lib/fit";
import { useUi } from "@/lib/ui";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useWorkspace } from "@/lib/useWorkspace";
import { resolveDriver, WIDGETS, WIDGET_ORDER, type DriverRef } from "@/lib/workspace";
import { Tile } from "./Tile";
import { WidgetBody } from "./WidgetBody";

const BTN =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-chip border border-line-control px-3 text-small font-semibold text-text transition-colors duration-150 hover:bg-raised lg:min-h-9";

/** Rows a layout needs on the 12-column grid: its area, or its tallest tile if that is more. */
function gridRows(tiles: { w: number; h: number }[]): number {
  const area = tiles.reduce((n, t) => n + t.w * t.h, 0);
  return Math.max(Math.ceil(area / 12), ...tiles.map((t) => t.h));
}

export function Workspace() {
  const { state, status } = useStream();
  const { selected, select } = useSelection();
  const ws = useWorkspace();
  const { openSources } = useUi();
  const { prefs } = usePrefs();
  const [edit, setEdit] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Same query as the fit-mode rules in globals.css.
  const fit = useMediaQuery("(min-width: 64rem) and (min-height: 40rem)");

  const rows = useMemo(() => (state ? towerRows(state) : []), [state]);
  const drivers = useMemo(() => rows.map((r) => ({ num: r.num, code: r.code, name: r.name })), [rows]);

  // Fit mode's page-level rules key off this attribute, not :has(.ws-fit): Next keeps the previous
  // route mounted but hidden, so the class would still match on /driver and /settings and lock their scroll.
  const mounted = !!state;
  useEffect(() => {
    if (!mounted) return;
    document.body.dataset.wsFit = "";
    return () => {
      delete document.body.dataset.wsFit;
    };
  }, [mounted]);

  // Default selection: your first favourite in the session, else the leader, once timing arrives.
  useEffect(() => {
    if (!state || selected) return;
    const first = rows.find((r) => isFavourite(prefs, r.code, r.team)) ?? rows[0];
    if (first) select(first.num);
  }, [state, selected, select, rows, prefs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (adding) setAdding(false);
      else if (focusId) setFocusId(null);
      else if (edit) setEdit(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [adding, focusId, edit]);

  if (!state) return <LoadingState />;

  const layout = ws.layout;
  const codeOf = (num: string | null) => rows.find((r) => r.num === num)?.code ?? "";
  const followedCode = codeOf(selected);
  const focused = focusId ? layout.tiles.find((t) => t.id === focusId) : undefined;
  const tiles = focused ? [focused] : layout.tiles;
  const noSource = status?.source.kind === "none";

  return (
    <div className="ws-fit pt-0">
      <SessionStrip
        state={state}
        actions={
          <>
            <label className="flex items-center gap-2 text-small font-semibold text-muted">
              Following
              <select
                value={selected ?? ""}
                onChange={(e) => select(e.target.value || null)}
                disabled={!drivers.length}
                className="h-9 cursor-pointer rounded-chip border border-transparent bg-raised/60 px-2 text-small font-semibold text-text transition-colors duration-200 hover:border-line-control disabled:opacity-60"
              >
                {!selected && <option value="">No driver</option>}
                {drivers.map((d) => (
                  <option key={d.num} value={d.num}>
                    {isFavourite(prefs, d.code) ? "★ " : ""}
                    {d.code} {d.name}
                  </option>
                ))}
              </select>
            </label>
            {followedCode && <FavouriteStar code={followedCode} />}
            <button type="button" className={`${BTN} border-transparent ${edit ? "!border-accent text-accent" : "text-muted hover:text-text"}`} aria-pressed={edit} onClick={() => { setEdit((e) => !e); setFocusId(null); setAdding(false); }}>
              {edit ? "Done" : "Customize"}
            </button>
          </>
        }
      />

      {edit && (
        <div className="relative mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-panel bg-raised/60 px-4 py-2">
          <label className="flex items-center gap-2 text-small font-semibold text-muted">
            Layout name
            <input
              key={layout.id}
              defaultValue={layout.name}
              maxLength={24}
              onBlur={(e) => {
                ws.rename(layout.id, e.target.value);
                e.target.value = e.target.value.trim() || layout.name;
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="h-9 w-40 rounded-chip border border-line-control bg-bg px-2 text-body font-semibold text-text"
            />
          </label>
          <div className="relative">
            <button type="button" className={BTN} aria-expanded={adding} aria-haspopup="true" onClick={() => setAdding((a) => !a)}>
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              Add widget
            </button>
            {adding && (
              <ul className="absolute left-0 top-full z-40 mt-1 grid animate-fade-in max-h-[70dvh] w-[min(24rem,calc(100vw-1.5rem))] gap-px overflow-y-auto rounded-panel border border-line-strong bg-line p-px shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
                {WIDGET_ORDER.map((type) => (
                  <li key={type} className="bg-surface">
                    <button
                      type="button"
                      onClick={() => { ws.add(type); setAdding(false); }}
                      className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left transition-colors duration-150 hover:bg-raised"
                    >
                      <span className="text-body font-semibold text-text">{WIDGETS[type].title}</span>
                      <span className="text-small text-muted">{WIDGETS[type].blurb}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" className={BTN} onClick={() => ws.removeOrReset(layout.id)}>
            {layout.preset ? "Reset this layout" : "Delete this layout"}
          </button>
          <p className="text-small text-faint">Drag tiles by their header, or use the arrows. Changes save on this device.</p>
        </div>
      )}

      {noSource && (
        <div className="mt-3 rounded-panel border border-line-strong bg-surface p-4">
          <h2 className="text-title font-bold">Choose what to watch</h2>
          <p className="mt-1 max-w-[65ch] text-small text-muted">Nothing is feeding the dashboard yet. The demo race works with no setup; live timing needs a running session.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={`${BTN} bg-accent text-on-accent hover:bg-accent/90`} onClick={() => openSources("replay")}>
              Play the demo or a replay
            </button>
            <button type="button" className={BTN} onClick={() => openSources("live")}>
              Use live timing
            </button>
          </div>
        </div>
      )}

      {tiles.length === 0 ? (
        <div className="mt-6 rounded-panel border border-dashed border-line-strong p-8 text-center">
          <p className="text-title font-bold">This layout is empty</p>
          <p className="mt-1 text-small text-muted">Add the widgets you want to watch.</p>
          <button type="button" className={`${BTN} mt-4`} onClick={() => { setEdit(true); setAdding(true); }}>
            Add a widget
          </button>
        </div>
      ) : (
        <FitContext value={fit}>
        <div key={focused ? `focus-${focused.id}` : layout.id} style={{ "--rows": focused ? 1 : gridRows(tiles) } as CSSProperties} className="workspace mt-3 grid grid-cols-1 gap-3 animate-fade-in">
          {tiles.map((t, i) => {
            const num = resolveDriver(t.driver, rows, selected);
            return (
              <Tile
                key={t.id}
                tile={t}
                index={i}
                count={tiles.length}
                edit={edit && !focused}
                focused={!!focused}
                code={codeOf(num)}
                followedCode={followedCode}
                drivers={drivers}
                onDriver={(r: DriverRef) => ws.setDriver(t.id, r)}
                onResize={(axis, dir) => ws.resize(t.id, axis, dir)}
                onMove={(to) => ws.move(t.id, to)}
                onRemove={() => ws.remove(t.id)}
                onFocus={() => setFocusId(focused ? null : t.id)}
                onDropTile={(id) => ws.move(id, i)}
              >
                <WidgetBody tile={t} state={state} num={num} selected={selected} onSelect={select} focused={!!focused} />
              </Tile>
            );
          })}
        </div>
        </FitContext>
      )}
    </div>
  );
}
