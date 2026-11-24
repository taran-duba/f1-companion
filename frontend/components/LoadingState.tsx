"use client";

import Link from "next/link";
import { apiBase } from "@/lib/api";
import { useNow, useStream, useTimingStream } from "@/lib/store";

/** Shown until the first snapshot arrives; explains what to do if it doesn't. */
export function LoadingState() {
  const { connection, attempts, retryAt } = useStream();
  const stream = useTimingStream();
  const now = useNow(1000);
  const failing = connection === "reconnecting" && attempts > 0;
  const secs = retryAt && now ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : null;
  return (
    <div className="mx-auto mt-10 max-w-xl rounded-panel border border-line-strong bg-surface p-6" aria-busy={!failing}>
      {failing ? (
        <>
          <h1 className="text-title font-bold">Can&apos;t reach the backend</h1>
          <p className="mt-2 text-muted">
            The dashboard expects the API at <code className="font-mono text-text">{apiBase()}</code>. Start it with{" "}
            <code className="font-mono text-text">python -m f1live serve</code> from the{" "}
            <code className="font-mono text-text">backend</code> folder. This page reconnects on its own.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => stream?.reconnectNow()}
              className="min-h-11 rounded-chip bg-accent px-4 font-semibold text-on-accent hover:bg-accent/90"
            >
              Retry now
            </button>
            {secs != null && (
              <span className="num text-small text-faint">
                {secs > 0 ? `Next attempt in ${secs} s` : "Trying again…"}
              </span>
            )}
          </div>
          <p className="mt-4 text-small text-faint">
            Opening this from another device? Run the backend with <code className="font-mono">--host 0.0.0.0</code>. See{" "}
            <Link className="underline underline-offset-4 hover:text-text" href="/settings">
              Status
            </Link>
            .
          </p>
        </>
      ) : (
        <>
          <h1 className="text-title font-bold">Connecting to timing</h1>
          <div className="mt-4 space-y-2" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-8 rounded-chip bg-raised" style={{ opacity: 1 - i * 0.13 }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
