import { drsLabel } from "@/lib/timing";
import { gearLabel, RPM_MAX, SPEED_MAX, type TelSample } from "@/lib/telemetry";

function pct(v: number, max: number) {
  return `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
}

/** Thin horizontal bar. Decorative: the number next to it carries the value. */
function Bar({ value, max, tone, className = "h-2" }: { value: number | null; max: number; tone: "ok" | "danger" | "text"; className?: string }) {
  const fill = { ok: "bg-ok", danger: "bg-danger", text: "bg-muted" }[tone];
  return (
    <div aria-hidden="true" className={`relative w-full overflow-hidden rounded-full bg-raised ${className}`}>
      {value != null && <div className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-linear ${fill}`} style={{ width: pct(value, max) }} />}
    </div>
  );
}

function BarRow({ label, value, max, tone, unit }: { label: string; value: number | null; max: number; tone: "ok" | "danger" | "text"; unit: string }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center gap-3">
      <span className="text-small font-semibold text-muted">{label}</span>
      <Bar value={value} max={max} tone={tone} />
      <span className="num text-right text-body font-medium text-text">
        {value == null ? (
          <span className="text-faint">—</span>
        ) : (
          <>
            {unit === "%" ? value : value.toLocaleString("en-GB")}
            <span className="ml-0.5 text-micro text-faint">{unit}</span>
          </>
        )}
      </span>
    </div>
  );
}

export function DrsPill({ drs }: { drs: number | null }) {
  const { label, state } = drsLabel(drs ?? 0);
  const cls =
    state === "open"
      ? "border-ok bg-ok text-bg"
      : state === "eligible"
        ? "border-ok text-ok"
        : "border-line-strong text-faint";
  return (
    <span className={`inline-flex min-h-7 items-center whitespace-nowrap rounded-full border px-2.5 text-micro font-bold ${cls}`}>
      {drs == null ? "DRS —" : label}
    </span>
  );
}

function Dash() {
  return <span className="text-faint">—</span>;
}

/** Pedal readout for the compact strip: label and percentage over a thin bar. */
function PedalCell({ label, value, tone, area }: { label: string; value: number | null; tone: "ok" | "danger"; area: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-end gap-1" style={{ gridArea: area }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-micro text-muted">{label}</span>
        <span className="num text-small font-medium text-text">
          {value == null ? <Dash /> : value}
          <span className="ml-0.5 text-micro text-faint">%</span>
        </span>
      </div>
      <Bar value={value} max={100} tone={tone} className="h-1.5" />
    </div>
  );
}

/**
 * Dense one-row readout for the live dashboard: speed, gear, throttle, brake, RPM, DRS.
 * Wraps the pedal bars onto a second row when the panel is narrower than ~32rem.
 */
export function CompactGauges({ sample }: { sample: TelSample | null }) {
  const s = sample;
  return (
    <div className="@container">
      <div
        className={
          "grid items-end gap-x-4 gap-y-2 " +
          "grid-cols-[auto_auto_minmax(0,1fr)_auto] [grid-template-areas:'speed_gear_rpm_drs'_'thr_thr_brk_brk'] " +
          "@lg:grid-cols-[auto_auto_minmax(5rem,1fr)_minmax(5rem,1fr)_auto_auto] @lg:[grid-template-areas:'speed_gear_thr_brk_rpm_drs']"
        }
      >
        <div style={{ gridArea: "speed" }}>
          <div className="text-micro text-muted">Speed</div>
          <div className="flex items-baseline gap-1">
            <span className="num text-headline font-bold text-text">{s ? s.speed : <Dash />}</span>
            <span className="text-micro text-faint">km/h</span>
          </div>
        </div>
        <div style={{ gridArea: "gear" }}>
          <div className="text-micro text-muted">Gear</div>
          <div className="num text-headline font-bold text-text">{s ? gearLabel(s.gear) : <Dash />}</div>
        </div>
        <PedalCell label="Throttle" value={s?.throttle ?? null} tone="ok" area="thr" />
        <PedalCell label="Brake" value={s?.brake ?? null} tone="danger" area="brk" />
        <div className="justify-self-end text-right @lg:justify-self-start @lg:text-left" style={{ gridArea: "rpm" }}>
          <div className="text-micro text-muted">RPM</div>
          <div className="num text-body font-medium leading-8 text-text">{s ? s.rpm.toLocaleString("en-GB") : <Dash />}</div>
        </div>
        <div className="self-end pb-0.5" style={{ gridArea: "drs" }}>
          <DrsPill drs={s ? s.drs : null} />
        </div>
      </div>
    </div>
  );
}

/** Live readouts for the newest sample: speed, gear, DRS, throttle, brake, RPM. */
export function Gauges({ sample }: { sample: TelSample | null }) {
  const s = sample;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-small font-semibold text-muted">Speed</div>
          <div className="flex items-baseline gap-1.5">
            <span className="num text-headline font-bold text-text">{s ? s.speed : "—"}</span>
            <span className="text-small text-faint">km/h</span>
          </div>
          <Bar value={s?.speed ?? null} max={SPEED_MAX} tone="text" className="mt-2 h-2" />
          <div aria-hidden="true" className="num mt-1 flex justify-between text-micro font-normal text-faint">
            <span>0</span>
            <span>{SPEED_MAX}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="text-small font-semibold text-muted">Gear</div>
          <div className="num flex size-12 items-center justify-center rounded-panel border border-line-strong bg-raised text-headline font-bold text-text">
            {s ? gearLabel(s.gear) : "—"}
          </div>
          <DrsPill drs={s ? s.drs : null} />
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <BarRow label="Throttle" value={s?.throttle ?? null} max={100} tone="ok" unit="%" />
        <BarRow label="Brake" value={s?.brake ?? null} max={100} tone="danger" unit="%" />
        <BarRow label="RPM" value={s?.rpm ?? null} max={RPM_MAX} tone="text" unit="" />
      </div>
    </div>
  );
}
