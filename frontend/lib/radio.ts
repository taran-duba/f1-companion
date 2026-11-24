"use client";

import { useSyncExternalStore } from "react";
import { apiBase } from "./api";
import { asList } from "./merge";
import { towerRows } from "./timing";
import type { TeamRadioCapture, TimingState } from "./types";

export interface RadioClip {
  /** Index in the feed's capture list (stable id). */
  i: number;
  num: string;
  code: string;
  name: string;
  teamColour: string;
  utc: string | null;
  path: string;
  text?: string;
}

/** Captures newest first, with the driver they belong to. */
export function radioClips(state: TimingState): RadioClip[] {
  const rows = new Map(towerRows(state).map((r) => [r.num, r]));
  const list = asList<TeamRadioCapture>(state.TeamRadio?.Captures);
  const out: RadioClip[] = [];
  list.forEach((c, i) => {
    if (!c?.Path || !c.RacingNumber) return;
    const r = rows.get(c.RacingNumber);
    out.push({
      i,
      num: c.RacingNumber,
      code: r?.code ?? `#${c.RacingNumber}`,
      name: r?.name ?? "",
      teamColour: r?.teamColour ?? "var(--color-muted)",
      utc: c.Utc ?? null,
      path: c.Path,
      text: c.Text,
    });
  });
  return out.reverse();
}

export function radioUrl(path: string): string {
  return `${apiBase()}/api/radio?path=${encodeURIComponent(path)}`;
}

// One clip at a time, app-wide: a single <audio> element and a tiny store around it.
interface PlayerState {
  path: string | null;
  status: "idle" | "loading" | "playing" | "error";
}

let player: HTMLAudioElement | null = null;
let current: PlayerState = { path: null, status: "idle" };
const listeners = new Set<() => void>();

function setState(s: PlayerState) {
  current = s;
  for (const l of listeners) l();
}

function audio(): HTMLAudioElement {
  if (player) return player;
  player = new Audio();
  player.preload = "auto";
  player.addEventListener("playing", () => setState({ ...current, status: "playing" }));
  player.addEventListener("ended", () => setState({ path: null, status: "idle" }));
  player.addEventListener("pause", () => {
    if (current.status === "playing") setState({ path: null, status: "idle" });
  });
  player.addEventListener("error", () => setState({ ...current, status: "error" }));
  return player;
}

/** Play a clip, or stop it if it is the one playing. */
export function toggleRadio(path: string) {
  const a = audio();
  if (current.path === path && current.status !== "error") {
    a.pause();
    setState({ path: null, status: "idle" });
    return;
  }
  setState({ path, status: "loading" });
  a.src = radioUrl(path);
  a.play().catch(() => setState({ path, status: "error" }));
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const idle: PlayerState = { path: null, status: "idle" };

export function useRadioPlayer(): PlayerState {
  return useSyncExternalStore(subscribe, () => current, () => idle);
}
