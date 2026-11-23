"use client";

import { useCallback, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { ServerStatus } from "@/lib/types";

export const BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-chip border border-line-control px-4 text-body font-semibold text-text transition-colors duration-150 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none";

/** Shared with the Settings source picker so both pages describe the demo the same way. */
export const DEMO_DESCRIPTION = "A made-up race that ships with the app, for trying things out.";

export interface SourceBody {
  kind: "demo" | "replay" | "fastf1";
  file?: string;
  year?: number;
  event?: string;
  session?: string;
  speed?: number;
}

/** POST /api/source with a per-button pending flag and an inline error. */
export function useSourceSwitch() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);

  const run = useCallback(async (key: string, body: SourceBody): Promise<boolean> => {
    setPending(key);
    setError(null);
    try {
      await api.post<ServerStatus>("/api/source", body);
      return true;
    } catch (err) {
      setError({ key, message: err instanceof Error ? err.message : "Request failed" });
      return false;
    } finally {
      setPending(null);
    }
  }, []);

  return { pending, error, run };
}

/** Section of the source picker with an h3 heading and an optional state chip. */
export function SourceSection({
  id,
  title,
  active,
  children,
}: {
  id: string;
  title: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 id={`${id}-title`} className="text-body font-semibold text-text">
          {title}
        </h3>
        {active && <NowPlaying />}
      </div>
      {children}
    </section>
  );
}

export function NowPlaying() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line-control px-2 text-micro font-semibold leading-5 text-text">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-text" />
      {/* Same word as the Settings source picker. */}
      In use
    </span>
  );
}

export function InlineError({ children, title = "Couldn't switch source" }: { children: ReactNode; title?: string }) {
  return (
    <p role="alert" className="mt-2 rounded-chip border border-danger px-3 py-2 text-small text-text">
      <span className="font-semibold text-danger">
        <span aria-hidden="true">✕ </span>
        {title}:
      </span>{" "}
      <span className="break-words">{children}</span>
    </p>
  );
}
