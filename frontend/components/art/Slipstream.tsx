"use client";

import { useEffect, useRef } from "react";
import { buildScene, drawLines, hottest, type Scene } from "@/lib/art/slipstream";
import { useArt } from "@/lib/art/useArt";
import { useStream } from "@/lib/store";
import { trackStatus } from "@/lib/timing";

const DRAW_IN_MS = 2400;
const COMETS = 14;
const TRAIL = 16;
/** Colour of the wash over the whole field while the track is not green. */
const TINT: Record<string, string> = {
  yellow: "255,212,59",
  sc: "255,212,59",
  vsc: "255,212,59",
  red: "255,92,92",
  chequered: "255,244,238",
};

interface Comet {
  line: number;
  u: number;
  speed: number;
}

/**
 * The page background: Slipstream, drawn once per seed and left alone, with a few comets
 * travelling the hottest streamlines. On first load the lines draw themselves in (the
 * start of the entrance choreography); later it just holds. It surges when a lap completes
 * and leans amber or red under flags. Static under reduced motion.
 */
export function Slipstream() {
  const { art } = useArt();
  const { state } = useStream();
  const still = useRef<HTMLCanvasElement>(null);
  const live = useRef<HTMLCanvasElement>(null);
  const surge = useRef(0);
  const lap = state?.LapCount?.CurrentLap ?? null;
  const prevLap = useRef<number | null>(null);
  const tone = state ? trackStatus(state).tone : "unknown";

  // A completed lap sends a surge through the comets.
  useEffect(() => {
    if (lap != null && prevLap.current != null && lap > prevLap.current) surge.current = 1;
    prevLap.current = lap;
  }, [lap]);

  useEffect(() => {
    const bg = still.current;
    const fg = live.current;
    if (!bg || !fg) return;
    const bgCtx = bg.getContext("2d");
    const fgCtx = fg.getContext("2d");
    if (!bgCtx || !fgCtx) return;
    if (art.mode === "off") {
      bgCtx.clearRect(0, 0, bg.width, bg.height);
      fgCtx.clearRect(0, 0, fg.width, fg.height);
      return;
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const alpha = art.mode === "bold" ? 1.4 : 0.85;
    let scene: Scene | null = null;
    let comets: Comet[] = [];
    let drawn = 0;
    let started = 0;
    let animateIn = !reduce && document.documentElement.dataset.booted !== "true";
    let raf = 0;
    let timer = 0;
    let last = 0;
    let dead = false;

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      for (const c of [bg, fg]) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bgCtx.clearRect(0, 0, w, h);
      scene = buildScene(art, w, h);
      const hot = hottest(scene, COMETS);
      comets = hot.map((line, i) => ({ line, u: (i * 0.37) % 1, speed: 0.035 + ((i * 7) % 5) * 0.012 }));
      drawn = 0;
      started = performance.now();
      if (!animateIn) {
        drawLines(bgCtx, scene, 0, scene.lines.length, alpha);
        drawn = scene.lines.length;
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!scene || document.hidden) return;
      // Draw-in: lines appear in the order they were born, easing out.
      if (drawn < scene.lines.length) {
        const p = Math.min(1, (now - started) / DRAW_IN_MS);
        const target = p >= 1 ? scene.lines.length : Math.floor(scene.lines.length * (1 - (1 - p) ** 3));
        if (target > drawn) {
          drawLines(bgCtx, scene, drawn, target, alpha);
          drawn = target;
        }
        if (drawn >= scene.lines.length) animateIn = false;
      }
      if (reduce || now - last < 33) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const w = scene.w;
      const h = scene.h;
      fgCtx.clearRect(0, 0, w, h);
      if (drawn < scene.lines.length) return;
      surge.current = Math.max(0, surge.current - dt * 0.6);
      const boost = 1 + surge.current * 5;
      fgCtx.save();
      fgCtx.globalCompositeOperation = "lighter";
      fgCtx.lineCap = "round";
      for (const c of comets) {
        const ln = scene.lines[c.line];
        const n = ln.pts.length / 2;
        c.u += c.speed * dt * boost;
        if (c.u >= 1) c.u -= 1;
        const head = Math.floor(c.u * (n - 1));
        const fade = Math.sin(Math.PI * c.u);
        for (let k = 0; k < TRAIL; k++) {
          const i1 = head - k;
          if (i1 < 1) break;
          const a = (1 - k / TRAIL) ** 2 * fade * (0.5 + surge.current * 0.5) * alpha;
          fgCtx.strokeStyle = `rgba(255,214,170,${a.toFixed(3)})`;
          fgCtx.lineWidth = ln.width * (2.2 - (k / TRAIL) * 1.4);
          fgCtx.beginPath();
          fgCtx.moveTo(ln.pts[(i1 - 1) * 2], ln.pts[(i1 - 1) * 2 + 1]);
          fgCtx.lineTo(ln.pts[i1 * 2], ln.pts[i1 * 2 + 1]);
          fgCtx.stroke();
        }
      }
      fgCtx.restore();
    };

    build();
    raf = requestAnimationFrame(frame);
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (dead) return;
        animateIn = false;
        build();
      }, 220);
    };
    window.addEventListener("resize", onResize);
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [art]);

  const wash = TINT[tone];
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <canvas ref={still} className="absolute inset-0 size-full" />
      <canvas ref={live} className="absolute inset-0 size-full" />
      {/* Flags tint the whole field; fades in and out slowly. */}
      <div
        className="absolute inset-0 transition-opacity duration-[1400ms]"
        style={{ opacity: wash ? 1 : 0, background: wash ? `radial-gradient(ellipse at 50% 45%, rgba(${wash},0.11), transparent 70%)` : undefined }}
      />
      {/* Calm the top and bottom edges so chrome and the playback bar sit on clean ground. */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,var(--color-bg)_0%,transparent_16%,transparent_78%,var(--color-bg)_100%)]" />
    </div>
  );
}
