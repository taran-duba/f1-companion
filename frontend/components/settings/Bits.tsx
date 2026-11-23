import type { ReactNode } from "react";

/** Two-column definition list; stacks label over value only when very narrow. */
export function DetailList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <dl aria-label={label} className="divide-y divide-line border-y border-line">
      {children}
    </dl>
  );
}

export function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(7.5rem,38%)_minmax(0,1fr)] gap-x-3 py-2 md:grid-cols-[12rem_minmax(0,1fr)]">
      <dt className="text-small font-semibold text-muted">{term}</dt>
      <dd className="min-w-0 break-words text-small text-text">{children}</dd>
    </div>
  );
}

/** Em dash for an empty value (never blank). */
export function Empty({ label = "Not available" }: { label?: string }) {
  return (
    <span className="text-faint" aria-label={label}>
      —
    </span>
  );
}

export type Tone = "ok" | "warn" | "danger" | "muted";

/** A word plus a shape, so colour is never the only signal. */
export function StatusText({ tone, children }: { tone: Tone; children: ReactNode }) {
  const color = { ok: "text-ok", warn: "text-warn", danger: "text-danger", muted: "text-muted" }[tone];
  return (
    <span className={`inline-flex items-start gap-1.5 font-semibold ${color}`}>
      <span className="mt-1 shrink-0">
        <ToneGlyph tone={tone} />
      </span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}

export function ToneGlyph({ tone }: { tone: Tone }) {
  if (tone === "ok")
    return (
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
        <path d="M2 6.5l2.5 2.5L10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (tone === "warn")
    return (
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
        <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" />
      </svg>
    );
  if (tone === "danger")
    return (
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
        <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
      <path d="M2.5 6h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Inline code (env vars, paths). */
export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-chip [overflow-wrap:anywhere] bg-raised px-1 py-px font-mono text-[0.8125rem] text-text">{children}</code>;
}

/** A command to copy; wraps instead of scrolling sideways on a phone. */
export function CodeBlock({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <pre
      aria-label={label}
      className="mt-2 whitespace-pre-wrap rounded-chip [overflow-wrap:anywhere] border border-line bg-bg px-3 py-2 font-mono text-[0.8125rem] leading-5 text-text"
    >
      <code>{children}</code>
    </pre>
  );
}

/** Short explanatory paragraph under a section heading. */
export function Lead({ children }: { children: ReactNode }) {
  return <p className="max-w-[60ch] text-small text-muted">{children}</p>;
}
