"use client";

import { useEffect, useId, useState } from "react";
import { isHex } from "@/lib/theme/color";
import { checkTheme, type Theme, type ThemeInput } from "@/lib/theme/themes";
import { useTheme } from "@/lib/theme/useTheme";

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-chip border border-line-control px-4 text-small font-semibold text-text transition-colors duration-150 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50";

const FIELDS: { key: keyof ThemeInput; label: string; hint: string }[] = [
  { key: "bg", label: "Page", hint: "Behind everything." },
  { key: "surface", label: "Panels", hint: "Tiles, the tower, cards." },
  { key: "text", label: "Text", hint: "Names and every number." },
  { key: "accent", label: "Accent", hint: "Buttons, links, focus." },
  { key: "select", label: "Selection", hint: "The driver you follow." },
];

function ColourField({ field, value, onChange }: { field: (typeof FIELDS)[number]; value: string; onChange: (v: string) => void }) {
  const id = useId();
  const [text, setText] = useState(value);
  // Follow outside changes (another preset picked as the starting point).
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3">
      <input
        id={`${id}-pick`}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${field.label} colour`}
        className="row-span-2 size-11 cursor-pointer rounded-chip border border-line-control bg-transparent p-0.5"
      />
      <label htmlFor={`${id}-hex`} className="text-small font-semibold text-text">
        {field.label} <span className="font-normal text-faint">· {field.hint}</span>
      </label>
      <input
        id={`${id}-hex`}
        value={text}
        spellCheck={false}
        maxLength={7}
        onChange={(e) => {
          setText(e.target.value);
          const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
          if (isHex(v) && v.length === 7) onChange(v.toLowerCase());
        }}
        className="num h-8 w-28 rounded-chip border border-line-control bg-bg px-2 text-small text-text"
      />
    </div>
  );
}

/**
 * Make your own theme: pick five colours, see them on the whole app while you edit, and
 * save. Everything else (hairlines, muted text, status colours) is derived to stay readable.
 */
export function ThemeEditor() {
  const { theme, presets, custom, saveCustom, deleteCustom, preview } = useTheme();
  const [draft, setDraft] = useState<ThemeInput>(theme.input);
  const [name, setName] = useState(theme.group === "custom" ? theme.name : `My ${theme.name}`);
  const [live, setLive] = useState(true);
  const editing = theme.group === "custom" ? theme : null;
  // Picking another theme elsewhere (the grid above) restarts the editor from it.
  const [seenId, setSeenId] = useState(theme.id);
  if (theme.id !== seenId) {
    setSeenId(theme.id);
    setDraft(theme.input);
    setName(theme.group === "custom" ? theme.name : `My ${theme.name}`);
  }

  // Preview on the whole app while the editor is open; restore on the way out.
  useEffect(() => {
    preview(live ? draft : null);
  }, [draft, live, preview]);
  useEffect(() => () => preview(null), [preview]);

  const checks = checkTheme(draft);
  const failing = checks.filter((c) => !c.ok);
  const startFrom = (t: Theme) => {
    setDraft(t.input);
    setName(t.group === "custom" ? t.name : `My ${t.name}`);
  };
  const save = (asNew: boolean) => {
    const id = !asNew && editing ? editing.id : `custom-${Date.now().toString(36)}`;
    saveCustom({ id, name: name.trim().slice(0, 24) || "My theme", blurb: "Your theme.", group: "custom", input: draft });
  };

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        <label className="flex flex-wrap items-center gap-2 text-small font-semibold text-muted">
          Start from
          <select
            value=""
            onChange={(e) => {
              const t = [...presets, ...custom].find((x) => x.id === e.target.value);
              if (t) startFrom(t);
            }}
            className="h-9 cursor-pointer rounded-chip border border-line-control bg-raised px-2 text-small font-semibold text-text"
          >
            <option value="">Choose a theme…</option>
            {[...presets, ...custom].map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {FIELDS.map((f) => (
          <ColourField key={f.key} field={f} value={draft[f.key]} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
        ))}
      </div>

      <div className="grid content-start gap-4">
        <label className="grid gap-1 text-small font-semibold text-muted">
          Name
          <input
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-chip border border-line-control bg-bg px-3 text-body font-semibold text-text"
          />
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-small text-text">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="size-4 accent-accent" />
          Preview on the whole app while editing
        </label>

        <div>
          <h3 className="text-small font-semibold text-muted">Readability</h3>
          <ul className="mt-1 grid gap-1 text-small">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center gap-2">
                <span aria-hidden="true" className={c.ok ? "text-ok" : "text-warn"}>
                  {c.ok ? "✓" : "!"}
                </span>
                <span className="text-text">{c.label}</span>
                <span className="num ml-auto text-faint">
                  {c.ratio.toFixed(1)}:1 <span className="sr-only">{c.ok ? "passes" : `below ${c.min}:1`}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-micro text-faint">
            {failing.length
              ? "Some colours are hard to tell apart. You can still save; muted text, lines and the accent are nudged to stay legible."
              : "Every check passes. Tyre, sector and flag colours keep their usual meaning in every theme."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${BTN} border-accent bg-accent text-on-accent hover:bg-accent/90`} onClick={() => save(false)}>
            {editing ? `Save “${editing.name}”` : "Save theme"}
          </button>
          {editing && (
            <button type="button" className={BTN} onClick={() => save(true)}>
              Save as new
            </button>
          )}
          <button type="button" className={BTN} onClick={() => startFrom(theme)}>
            Undo changes
          </button>
          {editing && (
            <button type="button" className={`${BTN} text-danger`} onClick={() => deleteCustom(editing.id)}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
