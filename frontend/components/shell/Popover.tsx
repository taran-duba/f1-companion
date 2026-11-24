"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * A button with a small panel under it. Closes on Escape (focus returns to the button),
 * on a click outside, and when the panel asks to.
 */
export function Popover({
  label,
  button,
  buttonClass,
  panelClass = "",
  children,
}: {
  /** Accessible name of the button. */
  label: string;
  button: ReactNode;
  buttonClass: string;
  panelClass?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        ref={btn}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={`${buttonClass} ${open ? "bg-raised text-text" : ""}`}
      >
        {button}
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className={`absolute right-0 top-full z-50 mt-1 animate-fade-in rounded-panel border border-line-strong bg-surface p-3 shadow-[0_12px_32px_rgba(0,0,0,0.35)] ${panelClass}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
