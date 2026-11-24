"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DelayControl } from "@/components/settings/DelayControl";
import { usePrefs } from "@/lib/prefs";
import { useStream } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { Popover } from "./Popover";
import { SourceChip } from "./SourceChip";
import { ThemeMenu } from "./ThemeMenu";

const LINK =
  "flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-body transition-[color,background-color] duration-200 hover:bg-raised/70 hover:text-text lg:min-h-10";

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
    <header className="boot-bar">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-1 px-4 pt-2 lg:px-6">
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
                className={`${LINK} ${on ? "bg-raised/80 font-semibold text-text" : "text-muted"}`}
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
            { href: "/settings", label: "Settings" },
          ].map((p) => {
            const on = pathname.startsWith(p.href);
            return (
              <Link
                key={p.href}
                href={p.href}
                aria-current={on ? "page" : undefined}
                className={`${LINK} ${on ? "bg-raised/80 font-semibold text-text" : "text-muted"}`}
              >
                {p.label}
              </Link>
            );
          })}
        </nav>
        <DelayChip />
        <ThemeMenu />
        <SourceChip />
      </div>
    </header>
  );
}

/** "TV +30 s": shown while the source is live (or a delay is set), opens the delay control. */
function DelayChip() {
  const { status } = useStream();
  const { delaySec } = usePrefs().prefs;
  if (status?.source.kind !== "live") return null;
  return (
    <Popover
      label="TV delay"
      buttonClass={`flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-small font-semibold transition-colors duration-150 hover:bg-raised/70 lg:min-h-10 ${delaySec ? "text-text" : "text-muted"}`}
      panelClass="w-[min(26rem,calc(100vw-1.5rem))]"
      button={
        <>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1.5" y="3" width="13" height="9" rx="1.5" />
            <path d="M5.5 14.5h5" strokeLinecap="round" />
          </svg>
          <span className="num">{delaySec ? `+${delaySec} s` : "Sync"}</span>
        </>
      }
    >
      {() => (
        <div className="grid gap-2">
          <p className="text-small font-semibold text-text">Match your TV</p>
          <DelayControl compact />
        </div>
      )}
    </Popover>
  );
}
