import { areaPath, linePath, SPEED_MAX, summarise, visible, type TelSample } from "@/lib/telemetry";

const W = 300;
const H = 100;
const SPEED_TICKS = [300, 200, 100, 0];

function xTicks(windowMs: number): number[] {
  const secs = windowMs / 1000;
  const step = secs / 3;
  return [secs, secs - step, secs - 2 * step, 0].map((s) => Math.round(s));
}

function VGrid({ windowMs }: { windowMs: number }) {
  return (
    <>
      {xTicks(windowMs).map((s) => {
        const x = W - (s / (windowMs / 1000)) * W;
        return <line key={s} x1={x} x2={x} y1={0} y2={H} stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
      })}
    </>
  );
}

function Band({ label, samples, windowMs, ch, colour }: { label: string; samples: TelSample[]; windowMs: number; ch: "throttle" | "brake"; colour: string }) {
  return (
    <>
      <span className="self-center text-micro text-muted">{label}</span>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="block h-7 w-full rounded-chip bg-raised/60">
        <VGrid windowMs={windowMs} />
        <path d={areaPath(samples, ch, windowMs, W, H, 100)} fill={colour} fillOpacity={0.35} />
        <path d={linePath(samples, ch, windowMs, W, H, 100)} fill="none" stroke={colour} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
    </>
  );
}

/**
 * Rolling speed line with throttle and brake bands under it. Hand-rolled SVG,
 * no animation; the x axis is anchored to the newest sample so the chart
 * stops when the feed (or the replay) stops.
 */
export function RollingChart({ samples, windowMs, colour, code }: { samples: TelSample[]; windowMs: number; colour: string; code: string }) {
  const shown = visible(samples, windowMs);
  const summary = summarise(shown, windowMs, code);
  return (
    <figure className="m-0">
      <figcaption className="sr-only">{summary}</figcaption>
      <div className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-2 gap-y-1.5">
        <div className="relative h-36 text-right" aria-hidden="true">
          {SPEED_TICKS.map((v) => (
            <span
              key={v}
              className="num absolute right-0 -translate-y-1/2 text-micro font-normal text-faint"
              style={{ top: `${(1 - v / SPEED_MAX) * 100}%` }}
            >
              {v}
            </span>
          ))}
          <span className="absolute right-0 top-0 -translate-y-1 text-micro font-normal text-faint">km/h</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="block h-36 w-full overflow-hidden">
          {SPEED_TICKS.map((v) => {
            const y = H - (v / SPEED_MAX) * H;
            return <line key={v} x1={0} x2={W} y1={y} y2={y} stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
          })}
          <VGrid windowMs={windowMs} />
          <path
            d={linePath(shown, "speed", windowMs, W, H, SPEED_MAX)}
            fill="none"
            stroke={colour}
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <Band label="Throttle" samples={shown} windowMs={windowMs} ch="throttle" colour="var(--color-ok)" />
        <Band label="Brake" samples={shown} windowMs={windowMs} ch="brake" colour="var(--color-danger)" />

        <span />
        <div aria-hidden="true" className="num relative h-4 text-micro font-normal text-faint">
          {xTicks(windowMs).map((s, i, all) => {
            // Centre each label on its gridline; pin the first and last to the edges.
            const left = `${(1 - s / (windowMs / 1000)) * 100}%`;
            const shift = i === 0 ? "" : i === all.length - 1 ? "-translate-x-full" : "-translate-x-1/2";
            return (
              <span key={s} className={`absolute top-0 whitespace-nowrap ${shift}`} style={{ left }}>
                {s === 0 ? "now" : `−${s} s`}
              </span>
            );
          })}
        </div>
      </div>
    </figure>
  );
}
