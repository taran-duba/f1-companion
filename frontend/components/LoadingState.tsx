"use client";

import Link from "next/link";
import { apiBase } from "@/lib/api";
import { useStream } from "@/lib/store";

/** Shown until the first snapshot arrives; explains what to do if it doesn't. */
export function LoadingState() {
  const { connection, attempts } = useStream();
  const failing = connection === "reconnecting" && attempts > 0;
  return (
    <div className="mx-auto mt-10 max-w-xl rounded-panel border border-line-strong bg-surface p-6" aria-busy={!failing}>
      {failing ? (
        <>
          <h1 className="text-title font-bold">Can&apos;t reach the backend</h1>
          <p className="mt-2 text-muted">
            The dashboard expects the API at <code className="font-mono text-text">{apiBase()}</code>. Start it with{" "}
            <code className="font-mono text-text">python -m f1live serve</code> from the <code className="font-mono">backend</code>{" "}
            folder. This page reconnects on its own.
          </p>
          <p className="mt-3 text-small text-faint">
            Opening this from another device? Run the backend with <code className="font-mono">--host 0.0.0.0</code>. See{" "}
            <Link className="underline underline-offset-4" href="/settings">
              Settings
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
