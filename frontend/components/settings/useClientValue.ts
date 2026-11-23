"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * A value that only exists in the browser (window.location, apiBase()).
 * Returns null during prerender and hydration, so server and client markup match.
 */
export function useClientValue<T>(read: () => T): T | null {
  return useSyncExternalStore<T | null>(noopSubscribe, read, () => null);
}
