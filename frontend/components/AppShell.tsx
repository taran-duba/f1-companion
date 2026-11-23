"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useStream } from "@/lib/store";
import { trackStatus } from "@/lib/timing";
import { ConnectionPill } from "./ConnectionPill";
import { FlagBand } from "./FlagBand";

const NAV = [
  { href: "/", label: "Live" },
  { href: "/driver", label: "Driver" },
  { href: "/replay", label: "Replay" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state } = useStream();
  const status = state ? trackStatus(state) : null;
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-chip focus:bg-accent focus:px-3 focus:py-2 focus:font-semibold focus:text-bg"
      >
        Skip to content
      </a>
      <FlagBand tone={status?.tone ?? "unknown"} label={status?.label ?? "Track status unknown"} />
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 lg:px-6">
          <Link href="/" className="mr-auto text-title font-bold tracking-tight text-text">
            F1 Companion
          </Link>
          <div className="order-2 sm:order-3">
            <ConnectionPill />
          </div>
          <nav aria-label="Main" className="order-3 w-full sm:order-2 sm:w-auto">
            <ul className="flex gap-1">
              {NAV.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-11 items-center rounded-chip px-3 text-body transition-colors duration-150 hover:bg-raised ${
                        active ? "font-semibold text-text underline decoration-accent decoration-2 underline-offset-[6px]" : "text-muted"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-10 pt-3 outline-none lg:px-6">
        {children}
      </main>
    </>
  );
}
