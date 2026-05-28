/**
 * Octav feature toggle.
 *
 * Stored in localStorage under `octav-enabled`. Default ON — only the explicit
 * string `"false"` disables. A `"octav-enabled-changed"` window event is
 * dispatched on writes so in-tab consumers re-render without waiting for a
 * navigation (the cross-tab `storage` event handles other tabs for free).
 *
 * Toggling off does NOT purge the user's stored Octav API key — re-enabling
 * is a single click and keeps their setup intact.
 */

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "octav-enabled";
const CHANGE_EVENT = "octav-enabled-changed";

export function getOctavEnabled(): boolean {
  if (typeof window === "undefined") return true;
  // Default ON — only an explicit "false" disables.
  return localStorage.getItem(STORAGE_KEY) !== "false";
}

export function setOctavEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onChange = (e?: Event) => {
    // Cross-tab storage events fire on every localStorage write — filter to
    // our key (or to a localStorage.clear(), which sends e.key === null).
    if (e instanceof StorageEvent && e.key !== null && e.key !== STORAGE_KEY) return;
    callback();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Reactive hook — re-renders when the toggle changes in this tab (custom
 *  event) or another tab (storage event). useSyncExternalStore reads
 *  localStorage synchronously on first client render, eliminating the
 *  visible flash of Octav UI for users who have it disabled. The server
 *  snapshot is `true` (build-time default) so static-export HTML matches;
 *  React swaps to the live value after hydration. */
export function useOctavEnabled(): boolean {
  return useSyncExternalStore(subscribe, getOctavEnabled, () => true);
}
