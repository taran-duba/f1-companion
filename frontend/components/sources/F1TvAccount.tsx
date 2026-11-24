"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useUi } from "@/lib/ui";
import type { ServerStatus } from "@/lib/types";
import { ErrorText, StatusText } from "@/components/settings/Bits";

const FIELD = "min-h-11 w-full rounded-chip border border-line-control bg-raised px-3 text-body text-text placeholder:text-faint";
const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-chip border border-line-control px-4 text-body font-semibold text-text transition-colors duration-150 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-60";
const BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-chip bg-accent px-4 text-body font-semibold text-on-accent transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

/**
 * F1 TV sign-in: enter your F1 account email and password once and the backend swaps them for
 * the token and keeps only that (or paste a token yourself). The token never comes back
 * to the browser, and the password is never kept; the panel only learns whether one is set and where it came from.
 */
export function F1TvAccount({ status }: { status: ServerStatus | null }) {
  const { wantToken } = useUi();
  const present = status ? Boolean(status.token_present || status.source.token_present) : null;
  const fromEnv = status?.token_source === "environment";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<"save" | "clear" | "login" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);

  const formOpen = present === false || editing;

  // A telemetry tile sent the user here to add a token: land in the field.
  useEffect(() => {
    if (wantToken && formOpen) emailInput.current?.focus();
  }, [wantToken, formOpen]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) {
      setError("Paste your F1 TV token first.");
      input.current?.focus();
      return;
    }
    setBusy("save");
    setError(null);
    try {
      await api.post("/api/credentials", { token: value });
      setValue("");
      setShow(false);
      setEditing(false);
      setSaved(
        status?.source.kind === "live"
          ? "Token saved. Reconnecting to live timing: car telemetry starts in a few seconds."
          : "Token saved. Car telemetry switches on the next time you use live timing.",
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the token.");
    } finally {
      setBusy(null);
    }
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter the email and password of your F1 account.");
      emailInput.current?.focus();
      return;
    }
    setBusy("login");
    setError(null);
    try {
      await api.post("/api/credentials/login", { email, password });
      setEmail("");
      setPassword("");
      setEditing(false);
      setSaved(
        status?.source.kind === "live"
          ? "Signed in. Reconnecting to live timing: car telemetry starts in a few seconds."
          : "Signed in. Car telemetry switches on the next time you use live timing.",
      );
    } catch (err) {
      setPassword("");
      setError(err instanceof ApiError ? err.message : "Couldn't sign in.");
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    setBusy("clear");
    setError(null);
    try {
      await api.delete("/api/credentials");
      setSaved("Token removed.");
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove the token.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="f1tv-title" className="rounded-panel border border-line-strong bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h3 id="f1tv-title" className="text-body font-semibold text-text">
          F1 TV account
        </h3>
        {present == null ? null : present ? (
          <StatusText tone="ok">Connected</StatusText>
        ) : (
          <StatusText tone="muted">Not connected</StatusText>
        )}
      </div>

      <div className="grid gap-3 px-4 py-3">
        <p className="max-w-[65ch] text-small text-muted">
          {present
            ? "Live car telemetry (speed, throttle, brake, gear) and car positions on the track map are on."
            : "Add your F1 TV token to unlock live car telemetry and positions on the track map. Timing, tyres and race control work without it, and so do replays."}
        </p>

        {present && !formOpen && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-small text-faint">
              {fromEnv ? "Set by the F1TV_TOKEN environment variable." : "Saved on the computer running the backend."}
            </p>
            <button type="button" className={BTN} onClick={() => setEditing(true)}>
              Replace
            </button>
            {!fromEnv && (
              <button type="button" className={BTN} disabled={busy !== null} onClick={clear}>
                {busy === "clear" ? "Removing…" : "Remove"}
              </button>
            )}
          </div>
        )}

        {formOpen && (
          <form onSubmit={signIn} noValidate className="grid gap-2">
            <label htmlFor="f1tv-email" className="text-small font-semibold text-muted">
              F1 account email
            </label>
            <input
              ref={emailInput}
              id="f1tv-email"
              name="f1tv-email"
              type="email"
              autoComplete="username"
              autoCapitalize="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
            />
            <label htmlFor="f1tv-password" className="text-small font-semibold text-muted">
              Password
            </label>
            <input
              id="f1tv-password"
              name="f1tv-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={FIELD}
            />
            <p className="text-small text-faint">
              Sent once to F1&apos;s sign-in service to get your token. Only the token is kept, in{" "}
              <code className="font-mono text-muted">data/credentials.json</code> on the backend machine; your password is not.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={BTN_PRIMARY} disabled={busy !== null}>
                {busy === "login" ? "Signing in…" : "Sign in"}
              </button>
              {editing && (
                <button
                  type="button"
                  className={BTN}
                  onClick={() => {
                    setEditing(false);
                    setEmail("");
                    setPassword("");
                    setValue("");
                    setError(null);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        {formOpen && (
          <details className="group text-small">
            <summary className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent underline-offset-4 hover:underline">
              Or paste a token instead
            </summary>
          <form onSubmit={save} noValidate className="mt-1 grid gap-2">
            <label htmlFor="f1tv-token" className="text-small font-semibold text-muted">
              F1 TV token
            </label>
            <div className="flex gap-2">
              <input
                ref={input}
                id="f1tv-token"
                name="f1tv-token"
                type={show ? "text" : "password"}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "f1tv-error" : "f1tv-help"}
                placeholder="Paste token"
                className={`${FIELD} min-w-0 flex-1 font-mono text-small`}
              />
              <button type="button" className={BTN} aria-pressed={show} onClick={() => setShow((s) => !s)}>
                {show ? "Hide" : "Show"}
              </button>
            </div>
            <p id="f1tv-help" className="text-small text-faint">
              Stored in <code className="font-mono text-muted">data/credentials.json</code> on the backend machine. It is only
              ever sent to F1&apos;s servers.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={BTN_PRIMARY} disabled={busy !== null}>
                {busy === "save" ? "Saving…" : "Save token"}
              </button>
            </div>
          </form>
          </details>
        )}

        <div aria-live="polite" className="text-small">
          {saved && !error && <StatusText tone="ok">{saved}</StatusText>}
        </div>
        {error && (
          <p id="f1tv-error" role="alert" className="text-small">
            <ErrorText>{error}</ErrorText>
          </p>
        )}

        <details className="group text-small">
          <summary className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent underline-offset-4 hover:underline">
            Where do I find a token to paste?
          </summary>
          <ol className="mt-1 ml-5 list-decimal space-y-1 text-muted">
            <li>Sign in at f1tv.formula1.com with your subscription account.</li>
            <li>
              Open your browser&apos;s developer tools and find a request to F1 TV&apos;s API (Network tab).
            </li>
            <li>
              Copy the value after <code className="font-mono text-text">Authorization: Bearer</code>, then paste it above.
            </li>
          </ol>
          <p className="mt-2 text-faint">
            Tokens expire. If car telemetry stops working, sign in again (or paste a fresh token) here: no restart needed.
          </p>
        </details>
      </div>
    </section>
  );
}
