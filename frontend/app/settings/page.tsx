"use client";

import { Panel } from "@/components/Panel";
import { ConnectionSection } from "@/components/settings/ConnectionSection";
import { PhoneSection } from "@/components/settings/PhoneSection";
import { RecorderSection } from "@/components/settings/RecorderSection";
import { SourcePicker } from "@/components/settings/SourcePicker";
import { TokenSection } from "@/components/settings/TokenSection";
import { StatusText, ToneGlyph } from "@/components/settings/Bits";
import { useStream } from "@/lib/store";

export default function SettingsPage() {
  const snap = useStream();
  const { status, state } = snap;
  const telemetryMissing = status?.source.kind === "live" && state?.Feed?.telemetry === false;

  return (
    <div className="max-w-[720px] pt-3">
      <h1 className="text-headline font-bold text-text">Settings and status</h1>
      <p className="mt-1 max-w-[60ch] text-small text-muted">
        Choose where timing comes from and check that everything is connected. Changes apply to every open page.
      </p>

      {status == null && (
        <p className="mt-4 text-small" role="status">
          <StatusText tone="warn">Waiting for the backend. The details below fill in once it answers.</StatusText>
        </p>
      )}

      {telemetryMissing && (
        <aside aria-labelledby="telemetry-why" className="mt-4 rounded-panel border border-warn/60 bg-surface px-4 py-3">
          <h2 id="telemetry-why" className="flex items-center gap-2 text-body font-semibold text-text">
            <span className="text-warn">
              <ToneGlyph tone="warn" />
            </span>
            Why is car telemetry missing?
          </h2>
          <p className="mt-1 text-small text-muted">
            Car telemetry needs an F1 TV token in live mode. Timing still works. Speed, throttle, brake and the track map
            come back once a token is set (see F1 TV token below).
          </p>
        </aside>
      )}

      <div className="mt-6 grid gap-6">
        <Panel id="source" title="Data source">
          <SourcePicker status={status} />
        </Panel>
        <Panel id="connection" title="Connection">
          <ConnectionSection snap={snap} />
        </Panel>
        <Panel id="token" title="F1 TV token">
          <TokenSection status={status} />
        </Panel>
        <Panel id="recorder" title="Recorder">
          <RecorderSection status={status} />
        </Panel>
        <Panel id="phone" title="Open on your phone">
          <PhoneSection />
        </Panel>
      </div>
    </div>
  );
}
