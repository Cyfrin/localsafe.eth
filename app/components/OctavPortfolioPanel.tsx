"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { OctavPortfolio, OctavProtocolGroup, OctavPosition, OctavDiscoveredToken } from "@/app/utils/octav";
import { chainColor } from "@/app/utils/octav";
import { tokenLogoUrl } from "@/app/utils/token-logos";

interface OctavPortfolioPanelProps {
  portfolio: OctavPortfolio;
  /** Octav chainKey of the wallet's currently-connected chain (lowercase
   *  slug like `"ethereum"`). Used to mark the matching chain box with a
   *  small "connected" dot. Omit when unknown — the dot just won't appear. */
  currentChainKey?: string;
  onDismiss?: () => void;
}

/** Octav surfaces position state via `positionType` strings — translate the
 *  common ones into the in-context action verbs DeFi wallets use as chips. */
function actionsForPositionTypes(types: string[]): string[] {
  const out = new Set<string>();
  for (const t of types) {
    const u = t.toUpperCase();
    if (u.includes("REWARD") || u === "CLAIMABLE_REWARDS" || u.includes("CLAIM")) out.add("Claim");
    else if (u.includes("BORROW") || u === "DEBT") out.add("Repay");
    else if (u.includes("LEND") || u.includes("SUPPLY") || u === "DEPOSIT") out.add("Withdraw");
    else if (u === "LP" || u.includes("LIQUIDITY") || u === "DEX") out.add("Withdraw");
    else if (u.includes("STAKE") || u === "VAULT" || u.includes("FARM") || u === "YIELD") out.add("Withdraw");
  }
  return Array.from(out);
}

function formatUsd(v: number): string {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatBalance(b: string): string {
  const n = Number.parseFloat(b);
  if (!Number.isFinite(n)) return b;
  if (n === 0) return "0";
  if (n < 0.0001) return n.toExponential(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/** Picks black or white text for legibility on a given hex background. */
function readableText(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return "#000000";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#000000" : "#FFFFFF";
}

/** Plain asset list-row used inside the expanded protocol card. No card
 *  chrome — just an icon + name on the left, balance + USD value on the
 *  right, so nested assets read as a clean list rather than competing with
 *  the outer brutalist box. Reward flag adds a small "reward" chip. */
function AssetListRow({ token, reward = false }: { token: OctavDiscoveredToken; reward?: boolean }) {
  const logoSrc = token.imgSmall || tokenLogoUrl(token.address);
  return (
    <div className="border-base-content/15 flex items-center justify-between gap-3 border-t px-3 py-2 first:border-t-0">
      <div className="flex min-w-0 items-center gap-3">
        <img
          src={logoSrc}
          alt=""
          aria-hidden="true"
          className="h-6 w-6 shrink-0 rounded-full"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">{token.symbol || "?"}</span>
            {reward && <span className="badge badge-outline badge-xs">reward</span>}
          </div>
          <div className="font-mono text-xs opacity-60">
            {formatBalance(token.balance)} {token.symbol}
            {token.usdPrice !== undefined ? ` · ${formatUsd(token.usdPrice)}` : ""}
          </div>
        </div>
      </div>
      <div className="font-mono text-sm font-semibold tabular-nums">
        {token.usdValue !== undefined ? formatUsd(token.usdValue) : "—"}
      </div>
    </div>
  );
}

/** Shortens an EVM address for inline display (0x1234…abcd). */
function shortAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Sub-section inside an expanded protocol card — one row group per
 *  concrete position (Beefy vault, Pendle LP, IPOR vault…). Uses plain
 *  divs (no card chrome) so nested assets read as a list rather than
 *  competing with the outer brutalist box. */
function PositionGroup({ position }: { position: OctavPosition }) {
  const typeLabel = position.positionType.replaceAll("_", " ").toLowerCase();
  const ref = position.poolAddress || position.vaultAddress;
  return (
    <div className="border-base-content/15 border-t first:border-t-0">
      <div className="bg-base-200/40 flex items-center justify-between gap-3 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{position.name}</span>
          <span className="badge badge-outline badge-xs uppercase">{typeLabel}</span>
          {ref && <span className="font-mono text-[10px] opacity-50">{shortAddr(ref)}</span>}
          {position.siteUrl && (
            <a
              href={position.siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="link link-hover text-[11px] opacity-70"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Open ${position.name} site (external)`}
            >
              open <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
        <span className="font-mono text-sm font-semibold tabular-nums">{formatUsd(position.value)}</span>
      </div>
      <div>
        {position.assets.map((a, i) => (
          <AssetListRow key={`a-${a.address}-${i}`} token={a} />
        ))}
        {position.rewardAssets.map((a, i) => (
          <AssetListRow key={`r-${a.address}-${i}`} token={a} reward />
        ))}
      </div>
    </div>
  );
}

/** One brutalist drop-shadow card per protocol — clickable header, list
 *  of positions + assets inside when expanded. Card chrome lives at the
 *  protocol level only; nested content is plain list rows so the visual
 *  hierarchy stays one-deep. */
function ProtocolCard({ proto }: { proto: OctavProtocolGroup }) {
  const [open, setOpen] = useState(false);
  const allPositionTypes = proto.chains.flatMap((c) => c.positions.map((p) => p.positionType));
  const actions = actionsForPositionTypes(allPositionTypes);
  const positionCount = proto.chains.reduce((s, c) => s + c.positions.length, 0);

  return (
    <div className="surface-raised" data-testid={`octav-protocol-${proto.key}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-base-200/40 flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors"
        aria-expanded={open}
      >
        <div className="flex min-w-0 items-center gap-3">
          {proto.imgSmall ? (
            // Decorative — the protocol name appears as text right after, so
            // alt="" + aria-hidden prevents the SR from announcing it twice.
            <img
              src={proto.imgSmall}
              alt=""
              aria-hidden="true"
              className="h-9 w-9 shrink-0 rounded-full"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div
              aria-hidden="true"
              className="bg-base-200 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold opacity-70"
            >
              {proto.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-bold">{proto.name}</span>
              {actions.map((a) => (
                <span key={a} className="badge badge-outline badge-xs">
                  {a}
                </span>
              ))}
            </div>
            <div className="font-mono text-[11px] opacity-60">
              {positionCount} {positionCount === 1 ? "position" : "positions"} · {proto.key}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-sm font-bold tabular-nums">{formatUsd(proto.value)}</span>
          <span className={`text-xs opacity-60 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </div>
      </button>
      {open && (
        <div className="border-base-content/30 border-t">
          {proto.chains.flatMap((chain) =>
            chain.positions.map((p, pi) => (
              <PositionGroup
                key={`${chain.chainKey}-${p.poolAddress ?? p.vaultAddress ?? `${p.positionType}-${p.name}-${pi}`}`}
                position={p}
              />
            )),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * DeFi-position panel rendered BELOW the Tokens table. Inherits the
 * page's brutalist/textbook visual language by leaning on the same daisyUI
 * primitives the Tokens section uses (`divider`, `table`, `badge`, plain
 * `h3`) — no custom card chrome or shadow overrides, so the active theme's
 * offset-shadow treatment applies uniformly.
 */
export default function OctavPortfolioPanel({ portfolio, currentChainKey, onDismiss }: OctavPortfolioPanelProps) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  // Chain filter — a Set of active chainKeys. Plain click isolates one chain;
  // ⌘/Ctrl-click toggles it in/out. Clearing the last one (or clicking the
  // sole active chain) snaps back to "all selected". When every chain is
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

  // Tracked so we can clear it on unmount (or on a re-click before it fires)
  // — without this, switching Safes while the "Copied" pill is up triggers
  // the React "setState on unmounted component" warning in StrictMode.
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(portfolio.raw, null, 2));
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write can fail in non-secure contexts; fall through silently
    }
  }

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
          <button className="btn btn-outline btn-sm whitespace-nowrap" onClick={copyJson} title="Copy raw response">
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
            {/* Single label span owns the SR announcement: aria-live polite
             *  speaks the new text after the copy completes, aria-atomic
             *  keeps the whole label coherent rather than reading the diff. */}
            <span role="status" aria-live="polite" aria-atomic="true">
              {copied ? "Copied" : "Copy JSON"}
            </span>
          </button>
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

      {/* Chain filter — one clickable, chain-colored, drop-shadow box per
       *  chain. Plain click isolates that chain; ⌘/Ctrl-click toggles it in
       *  or out of a multi-chain selection. An active box is filled with the
       *  chain's brand color; inactive boxes mute (gray + dimmed). */}
      {portfolio.chainSummary.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-3">
          {portfolio.chainSummary.map((c) => {
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
                onClick={(e) => toggleChain(c.chainKey, e.metaKey || e.ctrlKey || e.shiftKey)}
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
      )}

      {/* Filter hint + reset affordance */}
      {portfolio.chainSummary.length > 1 && (
        <div className="mb-4 flex items-center gap-2 text-xs opacity-60">
          <span>Click to isolate a chain · ⌘/Ctrl/Shift-click to combine</span>
          {filterActive && (
            <button className="link link-hover font-semibold" onClick={() => setSelected(new Set(allChainKeys))}>
              Show all
            </button>
          )}
        </div>
      )}

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
            <ProtocolCard key={p.key} proto={p} />
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
