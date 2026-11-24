"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { WIDGETS, type DriverRef, type Tile as TileData } from "@/lib/workspace";

export interface DriverOption {
  num: string;
  code: string;
  name: string;
}

interface Props {
  tile: TileData;
  index: number;
  count: number;
  edit: boolean;
  focused: boolean;
  /** Code of the driver this tile is about right now ("" when none), for the title. */
  code: string;
  followedCode: string;
  drivers: DriverOption[];
  onDriver: (ref: DriverRef) => void;
  onResize: (axis: "w" | "h", dir: 1 | -1) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  onFocus: () => void;
  onDropTile: (draggedId: string) => void;
  children: ReactNode;
}

const ICON_BTN =
  "grid size-8 shrink-0 place-items-center rounded-chip text-muted transition-colors duration-150 hover:bg-raised hover:text-text disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted";

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={ICON_BTN}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

/** One widget's frame: title, driver picker, and (in edit mode) move, resize and remove. */
export function Tile({ tile, index, count, edit, focused, code, followedCode, drivers, onDriver, onResize, onMove, onRemove, onFocus, onDropTile, children }: Props) {
  const info = WIDGETS[tile.type];
  const [over, setOver] = useState(false);
  const flush = tile.type === "tower";

  return (
    <section
      aria-label={info.title}
      data-tile={tile.type}
      draggable={edit}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", tile.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (!edit) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (edit && id && id !== tile.id) {
          e.preventDefault();
          onDropTile(id);
        }
      }}
      style={{ "--w": tile.w, "--h": tile.h, "--i": index } as CSSProperties}
      className={`tile group/tile flex min-h-0 min-w-0 flex-col rounded-panel border bg-surface/95 transition-colors duration-300 ${focused ? "tile-focus" : ""} ${
        over ? "border-accent" : edit ? "border-dashed border-line-control" : "border-line/70 hover:border-line-strong"
      }`}
    >
      <header className="flex min-h-11 flex-wrap items-center gap-x-1.5 pl-4 pr-2 lg:min-h-9">
        {edit && (
          <span aria-hidden="true" title="Drag to rearrange" className="-ml-1 cursor-grab text-faint active:cursor-grabbing">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              {[3, 7, 11].flatMap((y) => [4.5, 9.5].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.15" />))}
            </svg>
          </span>
        )}
        <h2 className="min-w-0 truncate text-small font-semibold text-muted">{info.title}</h2>

        {info.driver && (
          <label className="relative ml-1 inline-flex min-w-0 items-center">
            <span className="sr-only">Driver for {info.title}</span>
            <select
              value={tile.driver}
              onChange={(e) => onDriver(e.target.value as DriverRef)}
              className="h-7 max-w-[10.5rem] cursor-pointer appearance-none truncate rounded-chip border border-transparent bg-transparent py-0 pl-2 pr-6 text-small font-semibold text-text transition-colors duration-200 hover:border-line-control hover:bg-raised"
            >
              <optgroup label="Relative">
                <option value="follow">{followedCode ? `Followed (${followedCode})` : "Followed driver"}</option>
                <option value="ahead">Car ahead</option>
                <option value="behind">Car behind</option>
                <option value="leader">Leader</option>
              </optgroup>
              <optgroup label="Pinned driver">
                {drivers.map((d) => (
                  <option key={d.num} value={`#${d.num}`}>
                    {d.code} {d.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <svg aria-hidden="true" width="9" height="9" viewBox="0 0 10 10" className="pointer-events-none absolute right-2 text-muted">
              <path d="M1.5 3.5L5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {code && tile.driver !== "follow" && !tile.driver.startsWith("#") && <span className="ml-2 text-small font-semibold text-muted">{code}</span>}
          </label>
        )}

        {/* In edit mode the controls take their own row, so narrow tiles keep a readable title. */}
        <div className={`flex items-center ${edit ? "order-last -ml-2 w-full border-t border-line py-0.5 pl-2" : "ml-auto"}`}>
          {edit ? (
            <>
              <span className="mr-auto text-micro text-faint">
                {tile.w} × {tile.h}
              </span>
              <IconBtn label={`Move ${info.title} earlier`} disabled={index === 0} onClick={() => onMove(index - 1)}>
                <path d="M9 2L4 7l5 5" />
              </IconBtn>
              <IconBtn label={`Move ${info.title} later`} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
                <path d="M5 2l5 5-5 5" />
              </IconBtn>
              <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
              <IconBtn label={`Make ${info.title} narrower`} onClick={() => onResize("w", -1)}>
                <path d="M2 7h10M5 4L2 7l3 3M9 4l3 3-3 3" />
              </IconBtn>
              <IconBtn label={`Make ${info.title} wider`} onClick={() => onResize("w", 1)}>
                <path d="M1 7h12M4 4L1 7l3 3M10 4l3 3-3 3" />
              </IconBtn>
              <IconBtn label={`Make ${info.title} shorter`} onClick={() => onResize("h", -1)}>
                <path d="M7 2v10M4 5l3-3 3 3M4 9l3 3 3-3" />
              </IconBtn>
              <IconBtn label={`Make ${info.title} taller`} onClick={() => onResize("h", 1)}>
                <path d="M7 1v12M4 4l3-3 3 3M4 10l3 3 3-3" />
              </IconBtn>
              <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
              <IconBtn label={`Remove ${info.title}`} onClick={onRemove}>
                <path d="M3 3l8 8M11 3l-8 8" />
              </IconBtn>
            </>
          ) : (
            // Quiet until you reach for the tile (always visible on touch screens).
            <span className="opacity-0 transition-opacity duration-300 group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 [@media(hover:none)]:opacity-100">
              <IconBtn label={focused ? "Back to layout" : `Fill the screen with ${info.title}`} onClick={onFocus}>
                {focused ? <path d="M5 1v4H1M9 1v4h4M5 13V9H1M9 13V9h4" /> : <path d="M1 5V1h4M13 5V1H9M1 9v4h4M13 9v4H9" />}
              </IconBtn>
            </span>
          )}
        </div>
      </header>
      <div className={`min-h-0 flex-1 overflow-auto ${flush ? "px-2 pb-2" : "px-4 pb-4"} ${flush ? "" : "max-h-[34rem] lg:max-h-none"}`}>{children}</div>
    </section>
  );
}
