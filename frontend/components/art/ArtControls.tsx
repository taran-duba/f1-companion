"use client";

import { useEffect, useRef } from "react";
import { buildScene, DENSITY_RANGE, drawLines, readPalette } from "@/lib/art/slipstream";
import { useArt, type ArtMode } from "@/lib/art/useArt";
import { useTheme } from "@/lib/theme/useTheme";

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-chip border border-line-control px-3 text-small font-semibold text-text transition-colors duration-150 hover:bg-raised";
const MODES: { id: ArtMode; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "subtle", label: "Subtle" },
  { id: "bold", label: "Bold" },
];

/** Paint a scene on the theme's page colour (preview and PNG export share this). */
function paint(canvas: HTMLCanvasElement, seed: number, density: number, wander: number, tightness: number, alpha: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const root = document.documentElement;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = getComputedStyle(root).getPropertyValue("--color-bg").trim() || "#0a0b0d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scene = buildScene({ seed, density, wander, tightness }, canvas.width, canvas.height);
  drawLines(ctx, scene, 0, scene.lines.length, alpha, readPalette(root));
}

function Slider({ id, label, min, max, step, value, onChange, hint }: { id: string; label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; hint: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-small font-semibold text-muted">
          {label}
        </label>
        <output htmlFor={id} className="num text-small text-text">
          {step < 1 ? value.toFixed(2) : value}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-describedby={`${id}-hint`}
        className="mt-1 h-6 w-full cursor-pointer accent-accent"
      />
      <p id={`${id}-hint`} className="text-micro text-faint">
        {hint}
      </p>
    </div>
  );
}

/** Pick the background: mode, seed, and the three things the algorithm lets you shape. */
export function ArtControls() {
  const { art, set, reset } = useArt();
  const themeId = useTheme().theme.id;
  const preview = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = preview.current;
    if (!c) return;
    const id = window.setTimeout(() => paint(c, art.seed, art.density, art.wander, art.tightness, 0.9), 60);
    return () => window.clearTimeout(id);
  }, [art.seed, art.density, art.wander, art.tightness, themeId]);

  function download() {
    const c = document.createElement("canvas");
    c.width = 2400;
    c.height = 1350;
    paint(c, art.seed, art.density, art.wander, art.tightness, 1);
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `slipstream-${art.seed}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        <canvas
          ref={preview}
          width={640}
          height={360}
          role="img"
          aria-label={`Preview of Slipstream, seed ${art.seed}`}
          className="aspect-video w-full rounded-chip border border-line"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BTN} aria-label="Previous seed" onClick={() => set({ seed: Math.max(1, art.seed - 1) })}>
            ←
          </button>
          <label className="flex items-center gap-2 text-small font-semibold text-muted">
            Seed
            <input
              type="number"
              min={1}
              value={art.seed}
              onChange={(e) => set({ seed: Math.max(1, Math.trunc(Number(e.target.value)) || 1) })}
              className="num h-11 w-24 rounded-chip border border-line-control bg-raised px-2 text-body text-text"
            />
          </label>
          <button type="button" className={BTN} aria-label="Next seed" onClick={() => set({ seed: art.seed + 1 })}>
            →
          </button>
          <button type="button" className={BTN} onClick={() => set({ seed: 1 + Math.floor(Math.random() * 9999) })}>
            Random
          </button>
        </div>
      </div>

      <div className="grid content-start gap-4">
        <div role="group" aria-label="Background" className="grid grid-cols-3 gap-1 rounded-chip bg-raised/60 p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={art.mode === m.id}
              onClick={() => set({ mode: m.id })}
              className={`min-h-11 rounded-chip text-small font-semibold transition-[background-color,color] duration-200 ${
                art.mode === m.id ? "bg-accent text-on-accent" : "text-muted hover:text-text"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <Slider id="art-density" label="Density" min={DENSITY_RANGE[0]} max={DENSITY_RANGE[1]} step={50} value={art.density} onChange={(density) => set({ density })} hint="How many lines." />
        <Slider id="art-tightness" label="Tightness" min={0} max={1} step={0.05} value={art.tightness} onChange={(tightness) => set({ tightness })} hint="Narrow, hot ribbons along the hidden circuit." />
        <Slider id="art-wander" label="Wander" min={0} max={1} step={0.05} value={art.wander} onChange={(wander) => set({ wander })} hint="How far lines drift once they leave the circuit." />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN} onClick={download}>
            Download PNG
          </button>
          <button type="button" className={BTN} onClick={reset}>
            Reset
          </button>
        </div>
        <p className="text-small text-faint">The same seed always draws the same picture. It draws itself in once when the app opens, then holds still.</p>
      </div>
    </div>
  );
}
