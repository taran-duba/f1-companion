"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/useWorkspace";
import { SourceChip } from "./SourceChip";

const LINK =
  "flex min-h-11 items-center whitespace-nowrap rounded-chip px-3 text-body transition-colors duration-150 hover:bg-raised lg:min-h-10";

/**
 * One bar for the whole app: the layouts you switch between (they are the home screen),
 * the two other places, and the source chip on the right.
 */
export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const ws = useWorkspace();
  const onWorkspace = pathname === "/";

  const open = (id: string) => {
    ws.setActive(id);
    if (!onWorkspace) router.push("/");
  };

  return (
    <header className="border-b border-line bg-bg">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-2 px-3 lg:px-4">
        <Link href="/" className="mr-3 flex min-h-11 items-center gap-2 text-body font-bold tracking-tight text-text lg:min-h-10">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" className="text-accent">
            <path d="M2 16V2h14v4H6v2.5h8v4H6V16z" fill="currentColor" />
          </svg>
          <span className="hidden min-[480px]:inline">F1 Companion</span>
        </Link>

        <nav aria-label="Layouts" className="order-3 -mx-3 flex w-[calc(100%+1.5rem)] min-w-0 gap-1 overflow-x-auto px-3 md:order-none md:mx-0 md:w-auto md:flex-1 md:px-0">
          {ws.layouts.map((l) => {
            const on = onWorkspace && l.id === ws.layout.id;
            return (
              <button
                key={l.id}
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => open(l.id)}
                className={`${LINK} ${on ? "font-semibold text-text shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-muted"}`}
              >
                {l.name}
              </button>
            );
          })}
          <button type="button" onClick={() => { ws.addLayout(); if (!onWorkspace) router.push("/"); }} className={`${LINK} text-muted`} aria-label="New layout" title="New layout (a copy of this one)">
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </nav>

        <nav aria-label="Pages" className="ml-auto flex gap-1">
          {[
            { href: "/driver", label: "Drivers" },
            { href: "/settings", label: "Status" },
          ].map((p) => {
            const on = pathname.startsWith(p.href);
            return (
              <Link
                key={p.href}
                href={p.href}
                aria-current={on ? "page" : undefined}
                className={`${LINK} ${on ? "font-semibold text-text shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-muted"}`}
              >
                {p.label}
              </Link>
            );
          })}
        </nav>
        <SourceChip />
      </div>
    </header>
  );
}
