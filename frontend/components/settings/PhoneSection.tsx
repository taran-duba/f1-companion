"use client";

import { Code, CodeBlock, Lead } from "./Bits";
import { useClientValue } from "./useClientValue";

const readHost = () => window.location.hostname;

/** How to open the dashboard on a phone on the same Wi-Fi. */
export function PhoneSection() {
  const host = useClientValue(readHost);
  const onLan = host != null && host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
  return (
    <div className="grid gap-4">
      <Lead>
        Your phone and computer need to be on the same Wi-Fi. By default both servers only accept connections from this
        computer, so start them listening on the network instead.
      </Lead>
      <ol className="grid list-decimal gap-4 pl-5 text-small text-muted marker:font-semibold marker:text-text">
        <li>
          <span className="text-text">Start the backend on all network interfaces.</span>
          <CodeBlock label="Backend command">{`cd backend
python -m f1live serve \\
  --host 0.0.0.0 --port 8000`}</CodeBlock>
        </li>
        <li>
          <span className="text-text">Start the frontend the same way.</span>
          <CodeBlock label="Frontend command">{`cd frontend
npx next dev -H 0.0.0.0`}</CodeBlock>
        </li>
        <li>
          <span className="text-text">Find this computer&apos;s local IP address.</span> On a Mac,{" "}
          <Code>ipconfig getifaddr en0</Code> prints it (something like <Code>192.168.1.20</Code>).
        </li>
        <li>
          <span className="text-text">
            On the phone, open <Code>{"http://<computer-ip>:3000"}</Code>.
          </span>{" "}
          The dashboard finds the backend on port 8000 of the same address by itself. If the page can&apos;t connect, allow
          incoming connections when your firewall asks.
        </li>
      </ol>
      {onLan && (
        <p className="text-small text-muted">
          You&apos;re already on the network address <Code>{host}</Code>, so this device is set up.
        </p>
      )}
      <p className="max-w-[60ch] text-small text-faint">
        Only do this on a network you trust: the dashboard has no login, so anyone on the same Wi-Fi can open it and switch the
        data source.
      </p>
    </div>
  );
}
