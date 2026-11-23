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
      {value != null && <div className={`absolute inset-y-0 left-0 rounded-full ${fill}`} style={{ width: pct(value, max) }} />}
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

/** Live readouts for the newest sample: speed, gear, DRS, throttle, brake, RPM. */
export function Gauges({ sample }: { sample: TelSample | null }) {
  const s = sample;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-small font-semibold text-muted">Speed</div>
          <div className="flex items-baseline gap-1.5">
            <span className="num text-display font-bold text-text">{s ? s.speed : "—"}</span>
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
          <div className="num flex size-16 items-center justify-center rounded-panel border border-line-strong bg-raised text-display font-bold text-text">
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
