"use client";

import type { ReactNode } from "react";
import { useUi, type SourceTab } from "@/lib/ui";

/** Inline link-style button that opens the source panel (optionally on the F1 TV token field). */
export function OpenSources({ tab = "live", token = false, className = "", children }: { tab?: SourceTab; token?: boolean; className?: string; children: ReactNode }) {
  const { openSources } = useUi();
  return (
    <button
      type="button"
      onClick={() => openSources(tab, { token })}
      className={`inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2 hover:text-text lg:min-h-8 ${className}`}
    >
      {children}
    </button>
  );
}
