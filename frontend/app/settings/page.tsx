"use client";

import { ArtControls } from "@/components/art/ArtControls";
import { Panel } from "@/components/Panel";
import { ConnectionSection } from "@/components/settings/ConnectionSection";
import { PhoneSection } from "@/components/settings/PhoneSection";
import { StatusText } from "@/components/settings/Bits";
import { useStream } from "@/lib/store";
import { useUi } from "@/lib/ui";

/** Diagnostics: is the backend reachable, what is it doing, how to open this from a phone. */
export default function StatusPage() {
  const snap = useStream();
  const { status } = snap;
  const { openSources } = useUi();

  return (
    <div className="max-w-[860px] pt-3">
      <h1 className="text-headline font-bold text-text">Status</h1>
      <p className="mt-1 max-w-[65ch] text-small text-muted">
        Check that everything is connected. To change where timing comes from, or to add your F1 TV token, use the source
        panel.
      </p>
      <button
        type="button"
        onClick={() => openSources()}
        className="mt-3 inline-flex min-h-11 items-center rounded-chip border border-line-control px-4 text-body font-semibold text-text transition-colors duration-150 hover:bg-raised"
      >
        Open sources and F1 TV account
      </button>

      {status == null && (
        <p className="mt-4 text-small" role="status">
          <StatusText tone="warn">Waiting for the backend. The details below fill in once it answers.</StatusText>
        </p>
      )}

      <div className="mt-6 grid gap-6">
        <Panel id="connection" title="Connection">
          <ConnectionSection snap={snap} />
        </Panel>
        <Panel id="background" title="Background art">
          <ArtControls />
        </Panel>
        <Panel id="phone" title="Open on your phone">
          <PhoneSection />
        </Panel>
      </div>
    </div>
  );
}
