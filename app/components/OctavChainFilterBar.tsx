"use client";

import React from "react";
import type { OctavChainSummary } from "@/app/utils/octav";
import { chainColor } from "@/app/utils/octav";
import { formatUsd, readableText } from "@/app/utils/format";

interface OctavChainFilterBarProps {
  chainSummary: OctavChainSummary[];
  /** Active chainKeys. When equal (as a set) to the full chain list the
   *  bar is rendered as "all on"; otherwise the inactive boxes dim. */
  selected: Set<string>;
  /** True when a filter is actually narrowing the view. Controls whether
   *  the "Show all" reset link renders. */
  filterActive: boolean;
  /** Octav chainKey of the wallet's currently-connected chain. Marks the
   *  matching box with a small "connected" dot. Omit when unknown. */
  currentChainKey?: string;
  /** Called on click. `additive` is true when the user held ⌘/Ctrl/Shift
   *  (multi-select) and false for a plain click (isolate). */
  onToggleChain: (chainKey: string, additive: boolean) => void;
  /** Called when the user clicks the "Show all" reset affordance. */
  onShowAll: () => void;
}

/**
 * Chain filter strip — one clickable, chain-colored, drop-shadow box per
 * chain. Plain click isolates that chain; ⌘/Ctrl/Shift-click toggles it
 * in or out of a multi-chain selection. Active boxes fill with the
 * chain's brand color; inactive boxes mute (opacity 65 — readable, not
 * grayscaled out). The hint row + reset affordance only render when
 * there's more than one chain in the summary.
 *
 * Stateless: the parent owns selection state and the filterActive
 * derivation; this component only renders + raises click events.
 */
export default function OctavChainFilterBar({
  chainSummary,
  selected,
  filterActive,
  currentChainKey,
  onToggleChain,
  onShowAll,
}: OctavChainFilterBarProps) {
  if (chainSummary.length === 0) return null;

  return (
    <>
      <div className="mb-2 flex flex-wrap gap-3">
        {chainSummary.map((c) => {
          const active = selected.has(c.chainKey);
          const color = chainColor(c.chainKey);
          const isCurrent = !!currentChainKey && c.chainKey === currentChainKey;
          // Render a non-zero-but-rounds-to-0 share as "<1%" instead of
          // "0%" — a chain with $20 of $50k is real, not broken.
          const pct = c.share * 100;
          const shareLabel = pct > 0 && pct < 1 ? "<1%" : `${pct.toFixed(0)}%`;
          return (
            <button
              key={c.chainKey}
              type="button"
              onClick={(e) => onToggleChain(c.chainKey, e.metaKey || e.ctrlKey || e.shiftKey)}
              aria-pressed={active}
              data-testid={`octav-chain-${c.chainKey}`}
              title={`${c.chainName}${isCurrent ? " (connected)" : ""} — click to isolate, ⌘/Ctrl/Shift-click to combine`}
              className={`press border-base-content focus-visible:outline-base-content shadow-hard-sm flex items-center gap-2 border-2 px-3 py-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 ${active ? "" : "opacity-65"}`}
              style={active ? { backgroundColor: color, color: readableText(color) } : undefined}
            >
              <span className="font-bold capitalize">{c.chainName}</span>
              <span className="opacity-80">{formatUsd(c.value)}</span>
              <span className="opacity-60">{shareLabel}</span>
              {isCurrent && (
                <span className="opacity-70" aria-hidden="true">
                  ●
                </span>
              )}
            </button>
          );
        })}
      </div>

      {chainSummary.length > 1 && (
        <div className="mb-4 flex items-center gap-2 text-xs opacity-60">
          <span>Click to isolate a chain · ⌘/Ctrl/Shift-click to combine</span>
          {filterActive && (
            <button className="link link-hover font-semibold" onClick={onShowAll}>
              Show all
            </button>
          )}
        </div>
      )}
    </>
  );
}
