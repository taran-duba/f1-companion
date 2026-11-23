import type { ServerStatus } from "@/lib/types";
import { Code, CodeBlock, Detail, DetailList, Empty, Lead, StatusText } from "./Bits";

/** F1 TV token: present or not (the value never leaves the backend). */
export function TokenSection({ status }: { status: ServerStatus | null }) {
  const present = status ? Boolean(status.token_present || status.source.token_present) : null;
  const transport = status?.source.transport ?? status?.transport;
  return (
    <div className="grid gap-4">
      <DetailList>
        <Detail term="Token">
          {present == null ? (
            <Empty label="Unknown until the backend answers" />
          ) : present ? (
            <StatusText tone="ok">Present</StatusText>
          ) : (
            <StatusText tone="muted">Not set</StatusText>
          )}
        </Detail>
        <Detail term="Live transport">
          {transport === "legacy" ? "Legacy" : transport === "core" ? "Core" : transport ? transport : <Empty />}
        </Detail>
      </DetailList>

      <div>
        <h3 className="text-small font-semibold text-text">What it unlocks</h3>
        <Lead>
          In live mode, timing, tyres, race control and weather work without a token. A token adds car telemetry (speed,
          throttle, brake, gear, RPM, DRS) and car positions for the track map. Replays, FastF1 sessions and the demo don&apos;t
          need one.
        </Lead>
      </div>

      <div>
        <h3 className="text-small font-semibold text-text">How to set it</h3>
        <Lead>
          Set <Code>F1TV_TOKEN</Code> in the environment before starting the backend, then restart it. Choose the live
          transport with <Code>F1_TRANSPORT</Code> (<Code>core</Code> by default, or <Code>legacy</Code>).
        </Lead>
        <CodeBlock label="Example command">{`cd backend
export F1TV_TOKEN="<your token>"
export F1_TRANSPORT=core
python -m f1live serve`}</CodeBlock>
        <p className="mt-2 max-w-[60ch] text-small text-faint">
          This app never fetches, stores or shows a token. You copy it yourself from your own F1 TV account, and the backend
          only reports whether one is set. If it expires, set a fresh one and restart the backend.
        </p>
      </div>
    </div>
  );
}
