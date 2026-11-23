/** Small formatting helpers for the settings page. Pure functions. */

export type SourceChoice = "demo" | "replay" | "live" | "fastf1";

export const SOURCE_LABEL: Record<SourceChoice, string> = {
  demo: "Demo race",
  replay: "Recording",
  live: "Live timing",
  fastf1: "FastF1 session",
};

/** Map the backend's source kind to one of the four choices (null for "none"/unknown). */
export function toChoice(kind: string | undefined | null): SourceChoice | null {
  return kind === "demo" || kind === "replay" || kind === "live" || kind === "fastf1" ? kind : null;
}

/** "1.4 MB", "820 KB", "12 B". */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Parse an ISO string or epoch (s or ms) into epoch ms. */
export function toEpochMs(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** "just now", "4 s ago", "3 min ago", "2 h ago". `now` of 0 means the clock hasn't started. */
export function formatAgo(thenMs: number | null, now: number): string {
  if (thenMs == null || !now) return "—";
  const s = Math.max(0, Math.round((now - thenMs) / 1000));
  if (s < 2) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/** Seconds as "m:ss" or "h:mm:ss". */
export function formatClock(secs: number | null | undefined): string {
  if (secs == null || !Number.isFinite(secs)) return "—";
  const total = Math.max(0, Math.floor(secs));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function formatCount(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-GB");
}

/** Sentence-case word for a backend source state. */
export function stateWord(state: string | undefined): string {
  switch (state) {
    case "idle":
      return "Idle";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "reconnecting":
      return "Reconnecting";
    case "playing":
      return "Playing";
    case "paused":
      return "Paused";
    case "ended":
      return "Ended";
    case "error":
      return "Error";
    default:
      return state ? state.charAt(0).toUpperCase() + state.slice(1) : "—";
  }
}
