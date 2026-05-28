"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { OctavPortfolio, OctavProtocolGroup } from "@/app/utils/octav";
import { formatUsd } from "@/app/utils/format";
import OctavChainFilterBar from "./OctavChainFilterBar";
import OctavCopyJsonButton from "./OctavCopyJsonButton";
import OctavProtocolCard from "./OctavProtocolCard";

interface OctavPortfolioPanelProps {
  portfolio: OctavPortfolio;
  /** Octav chainKey of the wallet's currently-connected chain (lowercase
   *  slug like `"ethereum"`). Used to mark the matching chain box with a
   *  small "connected" dot. Omit when unknown — the dot just won't appear. */
  currentChainKey?: string;
  onDismiss?: () => void;
}

/**
 * DeFi-position panel rendered BELOW the Tokens table. Inherits the
 * page's brutalist/textbook visual language by leaning on the same daisyUI
 * primitives the Tokens section uses (`divider`, `table`, `badge`, plain
 * `h3`) — no custom card chrome or shadow overrides, so the active
 * theme's offset-shadow treatment applies uniformly.
 *
 * This component is the orchestrator: it owns the chain-filter state and
 * derives the filtered protocol list + filtered networth. All rendering
 * is delegated to small, stateless subcomponents (chain filter bar,
 * copy-json button, protocol card).
 */
export default function OctavPortfolioPanel({ portfolio, currentChainKey, onDismiss }: OctavPortfolioPanelProps) {
  const [showRaw, setShowRaw] = useState(false);

  // Chain filter — a Set of active chainKeys. Plain click isolates one chain;
  // ⌘/Ctrl/Shift-click toggles it in/out. Clearing the last one (or clicking
  // the sole active chain) snaps back to "all selected". When every chain is
  // selected we treat it as no filter (show everything).
  const allChainKeys = useMemo(() => portfolio.chainSummary.map((c) => c.chainKey), [portfolio.chainSummary]);
  // chainSummary is sorted by value descending, so its order can flip
  // between refetches as prices shift. Sort before joining so identical
  // chain sets produce identical signatures and the reset effect below
  // doesn't wipe the user's selection on a no-op refresh.
  const chainKeysSig = useMemo(() => [...allChainKeys].sort().join(","), [allChainKeys]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allChainKeys));
  // When a fresh portfolio arrives, prune stale chainKeys from the user's
  // selection rather than nuking it — keeps a meaningful filter alive across
  // refetches. If pruning empties the set we snap back to "all selected".
  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set(allChainKeys);
      const kept = new Set([...prev].filter((k) => valid.has(k)));
      return kept.size === 0 ? valid : kept;
    });
  }, [chainKeysSig, allChainKeys]);

  // "Active" = the selected set, intersected with valid keys, isn't the full
  // chain set. Using set membership (not just `.size`) is the only correct
  // check after a refetch — pre-prune, `selected` may carry stale keys.
  const filterActive = useMemo(() => {
    const valid = new Set(allChainKeys);
    const effective = [...selected].filter((k) => valid.has(k));
    return effective.length > 0 && effective.length < allChainKeys.length;
  }, [selected, allChainKeys]);

  function toggleChain(key: string, additive: boolean) {
    setSelected((prev) => {
      let next: Set<string>;
      if (additive) {
        next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
      } else if (prev.size === 1 && prev.has(key)) {
        // Clicking the already-isolated chain clears the filter (show all).
        next = new Set(allChainKeys);
      } else {
        next = new Set([key]);
      }
      // All chains off → auto-select all again.
      if (next.size === 0) next = new Set(allChainKeys);
      return next;
    });
  }

  // Protocols narrowed to the active chains, with per-protocol chain lists
  // and totals recomputed so the card headers reflect the filter.
  const visibleProtocols = useMemo<OctavProtocolGroup[]>(
    () =>
      portfolio.protocols
        .map((p) => {
          const chains = filterActive ? p.chains.filter((c) => selected.has(c.chainKey)) : p.chains;
          return { ...p, chains, value: chains.reduce((s, c) => s + c.value, 0) };
        })
        .filter((p) => p.chains.length > 0)
        .sort((a, b) => b.value - a.value),
    [portfolio.protocols, selected, filterActive],
  );

  const shownNetworth = useMemo(
    () =>
      filterActive
        ? portfolio.chainSummary.filter((c) => selected.has(c.chainKey)).reduce((s, c) => s + c.value, 0)
        : portfolio.networth,
    [filterActive, portfolio.chainSummary, portfolio.networth, selected],
  );

  return (
    <div className="mt-8">
      <div className="divider" data-testid="octav-portfolio-divider">
        DeFi Positions
      </div>

      {/* Header row — mirrors the Tokens section: title + total on left,
       *  actions on right. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h3 className="text-xl font-bold">Portfolio</h3>
          {/* Brand attribution — Octav red w/ the same brutalist offset
           *  shadow daisyUI's button styles apply, so it sits in-theme. */}
          <a
            href="https://octav.fi"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm border-base-content gap-2 self-center font-semibold text-white hover:opacity-90"
            style={{ backgroundColor: "#FF1A45" }}
            title="Portfolio data powered by Octav"
          >
            <img
              src="/octav-icon.svg"
              alt=""
              aria-hidden="true"
              className="h-4 w-4"
              style={{ filter: "brightness(0) invert(1)" }}
            />
            Powered by Octav
          </a>
          <div>
            <span className="text-sm opacity-60">Total value: </span>
            <span className="text-lg font-semibold">{formatUsd(shownNetworth)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <OctavCopyJsonButton payload={portfolio.raw} />
          <button className="btn btn-outline btn-sm" onClick={() => setShowRaw((v) => !v)} title="Show raw JSON">
            {showRaw ? "Hide JSON" : "View JSON"}
          </button>
          {onDismiss && (
            <button className="btn btn-ghost btn-sm" onClick={onDismiss} title="Hide panel">
              ✕
            </button>
          )}
        </div>
      </div>

      <OctavChainFilterBar
        chainSummary={portfolio.chainSummary}
        selected={selected}
        filterActive={filterActive}
        currentChainKey={currentChainKey}
        onToggleChain={toggleChain}
        onShowAll={() => setSelected(new Set(allChainKeys))}
      />

      {/* DeFi protocol stack — one brutalist drop-shadow card per
       *  protocol, gap'd so the offset shadows breathe. Card chrome only
       *  at this level; positions + assets inside are plain list rows. */}
      {visibleProtocols.length === 0 ? (
        <div className="bg-base-200 rounded-box p-8 text-center text-sm opacity-60">
          {portfolio.protocols.length === 0
            ? "No DeFi protocol positions found. Wallet token balances appear in the Tokens table above."
            : "No DeFi positions on the selected chain(s)."}
        </div>
      ) : (
        <div className="space-y-4">
          {visibleProtocols.map((p) => (
            <OctavProtocolCard key={p.key} proto={p} />
          ))}
        </div>
      )}

      {showRaw && (
        <details open className="bg-base-200 mt-4 rounded-lg p-3">
          <summary className="cursor-pointer text-xs font-semibold tracking-wide uppercase opacity-60">
            Raw Octav response
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto text-xs">{JSON.stringify(portfolio.raw, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
