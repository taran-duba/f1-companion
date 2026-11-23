import type { ReactNode } from "react";

/** Bordered secondary panel (the tower itself is not a panel — see DESIGN_PLAN). */
export function Panel({
  title,
  meta,
  children,
  className = "",
  id,
  headingLevel = 2,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  headingLevel?: 2 | 3;
}) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section aria-labelledby={headingId} id={id} className={`rounded-panel border border-line-strong bg-surface ${className}`}>
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-line px-3 py-2 lg:px-4">
        <H id={headingId} className="text-body font-semibold text-text">
          {title}
        </H>
        {meta && <div className="text-small text-faint">{meta}</div>}
      </div>
      <div className="p-3 lg:p-4">{children}</div>
    </section>
  );
}

/** Explanatory empty state: says why it's empty and what to do. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-chip border border-dashed border-line-strong px-4 py-6 text-small text-muted">{children}</div>;
}
