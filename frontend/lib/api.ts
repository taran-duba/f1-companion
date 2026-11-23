/**
 * Backend address. The browser talks to FastAPI directly (no Next proxy, which
 * can buffer SSE). Default: same host as the page, port 8000 — so opening the
 * dashboard from a phone on the LAN just works.
 */
export function apiBase(): string {
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, "");
  if (typeof window === "undefined") return "http://127.0.0.1:8000";
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(`Can't reach the backend at ${apiBase()}. Is it running?`, 0);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
      else if (Array.isArray(body?.detail)) detail = body.detail.map((d: { msg?: string }) => d.msg).join("; ");
    } catch {
      /* keep statusText */
    }
    throw new ApiError(detail || `Request failed (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
};

export interface SourcesResponse {
  demo: { available: boolean; name: string };
  recordings: { name: string; size: number; modified: number }[];
  fastf1: { installed: boolean; credentials: boolean };
}

export interface TelemetryWindow {
  t: number[];
  speed: number[];
  throttle: number[];
  brake: number[];
  gear: number[];
  rpm: number[];
  drs: number[];
}

export interface LapTrace {
  lap: number;
  ms: number | null;
  points: number[][]; // [dist, speed, throttle, brake, gear, rpm]
}

export interface TracesResponse {
  columns: string[];
  last: LapTrace | null;
  best: LapTrace | null;
}
