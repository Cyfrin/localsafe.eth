"use client";

import React, { useEffect, useRef, useState } from "react";

interface OctavCopyJsonButtonProps {
  /** The JSON-serializable payload to copy. Passed verbatim through
   *  `JSON.stringify(payload, null, 2)`. */
  payload: unknown;
  className?: string;
}

/**
 * "Copy JSON" button with a transient "Copied" confirmation. Owns its
 * own copied/timer state because the visual swap is purely local — no
 * other UI cares whether the panel's raw response is on the clipboard.
 *
 * The label sits inside a `role="status"` + `aria-live="polite"` span so
 * screen readers announce the state change without the icon swap getting
 * in the way. Timer is tracked in a ref and cleared on unmount + on a
 * re-click before it fires, so it survives StrictMode and panel
 * remounts (e.g. switching Safes while the pill is up).
 */
export default function OctavCopyJsonButton({ payload, className = "" }: OctavCopyJsonButtonProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write can fail in non-secure contexts; fall through silently
    }
  }

  return (
    <button
      className={`btn btn-outline btn-sm whitespace-nowrap ${className}`.trim()}
      onClick={copy}
      title="Copy raw response"
    >
      {copied ? (
        /* check */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-4 w-4"
        >
          <polyline points="4,11 8,15 16,6" />
        </svg>
      ) : (
        /* clipboard */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-4 w-4"
        >
          <rect x="6" y="3" width="8" height="3" rx="1" />
          <path d="M5 5h10v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5z" />
        </svg>
      )}
      <span role="status" aria-live="polite" aria-atomic="true">
        {copied ? "Copied" : "Copy JSON"}
      </span>
    </button>
  );
}
