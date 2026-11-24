"use client";

import { memo } from "react";
import { carDescription, type CarMarker, type LabelSide } from "@/lib/trackmap";

/**
 * Cars are zero-size anchors translated in container-query units (the parent is a size
 * container the size of the map), so moving between 2 Hz samples is a cheap transform
 * transition. globals.css zeroes the transition under prefers-reduced-motion. Dots and labels
 * live in separate layers with identical anchors, so every label paints above every dot.
 */
const ANCHOR = "absolute left-0 top-0 size-0 transition-transform duration-[450ms] ease-linear";

function anchorStyle(car: CarMarker): React.CSSProperties {
  return { transform: `translate(${car.left.toFixed(2)}cqw, ${car.top.toFixed(2)}cqh)` };
}

/** Dot diameter in px; also used for label spacing. */
export function dotSize(selected: boolean): number {
  return selected ? 20 : 12;
}

/** One car on the map: a real button (44px tap area on phone) with its team-colour dot. */
export const CarDot = memo(function CarDot({
  car,
  selected,
  onSelect,
}: {
  car: CarMarker;
  selected: boolean;
  onSelect: (num: string) => void;
}) {
  const hollow = car.state !== "running";
  const size = dotSize(selected);
  const description = carDescription(car) + (car.leader ? ", leader" : "") + (selected ? ", selected" : "");

  return (
    <li className={`${ANCHOR} ${selected ? "z-20" : car.leader ? "z-10" : ""}`} style={anchorStyle(car)}>
      <button
        type="button"
        aria-label={description}
        title={description}
        onClick={() => onSelect(car.num)}
        className="absolute left-0 top-0 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full lg:size-8"
      >
        {selected && (
          // The followed driver pulses softly, so it can be found among 20 dots at a glance.
          <span aria-hidden="true" className="absolute size-9 animate-ping rounded-full bg-accent/25 [animation-duration:2.4s] motion-reduce:hidden" />
        )}
        <span
          aria-hidden="true"
          className="relative block rounded-full"
          style={{
            width: size,
            height: size,
            background: hollow ? "var(--color-bg)" : car.colour,
            border: `${hollow ? 2.5 : 2}px solid ${hollow ? car.colour : "var(--color-bg)"}`,
            opacity: hollow && !selected ? 0.6 : 1,
            boxShadow: selected
              ? "0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-select)"
              : hollow
                ? "0 0 0 1.5px var(--color-bg)"
                : undefined,
          }}
        />
      </button>
    </li>
  );
});

/** Visible code label for a car, placed on `side` of its dot (decorative: the button has the name). */
export const CarLabel = memo(function CarLabel({
  car,
  selected,
  label,
  side,
}: {
  car: CarMarker;
  selected: boolean;
  label: string;
  side: LabelSide;
}) {
  const hollow = car.state !== "running";
  return (
    <div className={ANCHOR} style={anchorStyle(car)}>
      <span
        className={`num absolute whitespace-nowrap rounded-chip px-1 text-micro font-semibold ${
          selected ? "bg-select text-bg" : hollow ? "bg-bg/85 text-faint" : "bg-bg/85 text-muted"
        }`}
        style={labelStyle(side, dotSize(selected) / 2 + 3)}
      >
        {label}
      </span>
    </div>
  );
});

/** Position the label beside the zero-size anchor (the dot's centre). */
function labelStyle(side: LabelSide, gap: number): React.CSSProperties {
  switch (side) {
    case "right":
      return { left: gap, top: 0, transform: "translateY(-50%)" };
    case "left":
      return { right: gap, top: 0, transform: "translateY(-50%)" };
    case "above":
      return { left: 0, bottom: gap, transform: "translateX(-50%)" };
    case "below":
      return { left: 0, top: gap, transform: "translateX(-50%)" };
  }
}
