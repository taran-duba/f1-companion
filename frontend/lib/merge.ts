/**
 * Deep merge with the live timing feed's rules — mirrors backend/f1live/merge.py.
 *
 * - Objects merge recursively.
 * - An object whose keys are all non-negative integers, merged into an array,
 *   patches/append elements by index ("index-keyed list update").
 * - `_deleted` lists keys (or indices) to remove; `_kf` is ignored.
 * - Anything else replaces the target.
 */

type Json = unknown;
type Obj = Record<string, Json>;

const DELETED = "_deleted";
const KEYFRAME = "_kf";

export function isObj(v: Json): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isIndexKeyed(update: Obj): boolean {
  for (const k of Object.keys(update)) {
    if (k === DELETED || k === KEYFRAME) continue;
    if (!/^\d+$/.test(k)) return false;
  }
  return true;
}

function clone<T>(v: T): T {
  return typeof v === "object" && v !== null ? structuredClone(v) : v;
}

function mergeIntoArray(target: Json[], update: Obj): Json[] {
  const keys = Object.keys(update)
    .filter((k) => k !== DELETED && k !== KEYFRAME)
    .map(Number)
    .sort((a, b) => a - b);
  for (const idx of keys) {
    const value = update[String(idx)];
    if (idx < target.length) {
      target[idx] = merge(target[idx], value);
    } else {
      while (target.length < idx) target.push(null);
      target.push(clone(value));
    }
  }
  const deleted = update[DELETED];
  if (Array.isArray(deleted)) {
    const idxs = deleted
      .map((d) => String(d))
      .filter((d) => /^\d+$/.test(d))
      .map(Number)
      .sort((a, b) => b - a);
    for (const i of idxs) if (i < target.length) target.splice(i, 1);
  }
  return target;
}

/** Merge `update` into `target` (in place for objects/arrays) and return the result. */
export function merge(target: Json, update: Json): Json {
  if (!isObj(update)) return clone(update);
  if (Array.isArray(target)) {
    if (isIndexKeyed(update)) return mergeIntoArray(target, update);
    target = {};
  } else if (!isObj(target)) {
    target = {};
  }
  const t = target as Obj;
  for (const [key, value] of Object.entries(update)) {
    if (key === KEYFRAME) continue;
    if (key === DELETED && Array.isArray(value)) {
      for (const d of value) delete t[String(d)];
      continue;
    }
    if (key in t && isObj(value)) {
      t[key] = merge(t[key], value);
    } else {
      t[key] = clone(value);
    }
  }
  return t;
}

/** List-or-index-keyed-object → array ordered by index (mirrors `as_list`). */
export function asList<T = Json>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (isObj(value)) {
    return Object.keys(value)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => value[k] as T);
  }
  return [];
}
