"use client";

import { useState } from "react";
import { ArtControls } from "@/components/art/ArtControls";
import { Panel } from "@/components/Panel";
import { AlertsSection } from "@/components/settings/AlertsSection";
import { ConnectionSection } from "@/components/settings/ConnectionSection";
import { DelayControl } from "@/components/settings/DelayControl";
import { FavouritesSection } from "@/components/settings/FavouritesSection";
import { PhoneSection } from "@/components/settings/PhoneSection";
import { StatusText } from "@/components/settings/Bits";
import { ThemeEditor } from "@/components/theme/ThemeEditor";
import { ThemeGrid } from "@/components/theme/ThemePicker";
import { useStream } from "@/lib/store";
import { useTheme } from "@/lib/theme/useTheme";
import { useUi } from "@/lib/ui";

const BTN =
  "inline-flex min-h-11 items-center rounded-chip border border-line-control px-4 text-body font-semibold text-text transition-colors duration-150 hover:bg-raised";

/** How the companion looks and behaves for you, then the diagnostics. */
export default function SettingsPage() {
  const snap = useStream();
  const { status } = snap;
  const { openSources } = useUi();
  const { presets, custom } = useTheme();
  const [editing, setEditing] = useState(false);

  return (
    <div className="max-w-[960px] pt-3">
      <h1 className="text-headline font-bold text-text">Settings</h1>
      <p className="mt-1 max-w-[65ch] text-small text-muted">
        Make the companion yours: colours, the drivers you follow, alerts and a delay to match your TV. Everything here is saved in this
        browser.
      </p>

      <div className="mt-6 grid gap-6">
        <Panel id="appearance" title="Theme">
          <div className="grid gap-4">
            <ThemeGrid themes={presets.filter((p) => p.group === "base")} />
            <h3 className="text-small font-semibold text-muted">Inspired by team liveries</h3>
            <ThemeGrid themes={presets.filter((p) => p.group === "team")} />
            {custom.length > 0 && (
              <>
                <h3 className="text-small font-semibold text-muted">Yours</h3>
                <ThemeGrid themes={custom} />
              </>
            )}
            <div className="border-t border-line pt-4">
              {editing ? (
                <>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-title font-bold text-text">Make your own</h3>
                    <button type="button" className={BTN} onClick={() => setEditing(false)}>
                      Close editor
                    </button>
                  </div>
                  <ThemeEditor />
                </>
              ) : (
                <button type="button" className={BTN} onClick={() => setEditing(true)}>
                  Make your own theme
                </button>
              )}
            </div>
          </div>
        </Panel>

        <Panel id="favourites" title="Favourite drivers and teams">
          <FavouritesSection />
        </Panel>

        <Panel id="delay" title="TV delay">
          <DelayControl />
        </Panel>

        <Panel id="alerts" title="Alerts">
          <AlertsSection />
        </Panel>

        <Panel id="background" title="Background art">
          <ArtControls />
        </Panel>

        <section aria-labelledby="status-title" className="grid gap-3">
          <h2 id="status-title" className="mt-2 text-title font-bold text-text">
            Status
          </h2>
          <p className="max-w-[65ch] text-small text-muted">
            Check that everything is connected. To change where timing comes from, or to add your F1 TV token, use the source panel.
          </p>
          <div>
            <button type="button" onClick={() => openSources()} className={BTN}>
              Open sources and F1 TV account
            </button>
          </div>
          {status == null && (
            <p className="text-small" role="status">
              <StatusText tone="warn">Waiting for the backend. The details below fill in once it answers.</StatusText>
            </p>
          )}
          <Panel id="connection" title="Connection">
            <ConnectionSection snap={snap} />
          </Panel>
          <Panel id="phone" title="Open on your phone">
            <PhoneSection />
          </Panel>
        </section>
      </div>
    </div>
  );
}
