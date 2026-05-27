"use client";

import React, { useState } from "react";
import type { OctavPortfolio, OctavProtocolGroup, OctavPosition, OctavDiscoveredToken } from "@/app/utils/octav";

interface OctavPortfolioPanelProps {
  portfolio: OctavPortfolio;
  currentChainName?: string;
  onDismiss?: () => void;
}

/** Map Octav's `positionType` strings to a short action label that sits next
 *  to a protocol's header — mirrors how DeFi wallets surface in-context
 *  affordances (Withdraw / Claim / Repay) without us implementing the
 *  on-chain action itself. */
function actionsForPositionTypes(types: string[]): string[] {
  const out = new Set<string>();
  for (const t of types) {
    const u = t.toUpperCase();
    if (u.includes("REWARD") || u === "CLAIMABLE_REWARDS" || u.includes("CLAIM")) out.add("Claim");
    else if (u.includes("BORROW") || u === "DEBT") out.add("Repay");
    else if (u.includes("LEND") || u.includes("SUPPLY") || u === "DEPOSIT") out.add("Withdraw");
    else if (u === "LP" || u.includes("LIQUIDITY") || u === "DEX") out.add("Withdraw");
    else if (u.includes("STAKE") || u === "VAULT" || u.includes("FARM")) out.add("Withdraw");
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

function TokenRow({ token }: { token: OctavDiscoveredToken }) {
  return (
    <div className="hover:bg-base-300/40 flex items-center justify-between rounded-lg px-3 py-2 transition-colors">
      <div className="flex min-w-0 items-center gap-3">
        {token.imgSmall ? (
          <img
            src={token.imgSmall}
            alt={token.symbol}
            className="h-7 w-7 rounded-full"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="bg-base-300 flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold opacity-70">
            {token.symbol.slice(0, 3)}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{token.symbol || "?"}</div>
          <div className="truncate font-mono text-xs opacity-60">{formatBalance(token.balance)}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold tabular-nums">
          {token.usdValue !== undefined ? formatUsd(token.usdValue) : "—"}
        </div>
        {token.usdPrice !== undefined && (
          <div className="font-mono text-xs tabular-nums opacity-60">{formatUsd(token.usdPrice)}</div>
        )}
      </div>
    </div>
  );
}

function PositionGroup({ position }: { position: OctavPosition }) {
  const label = position.positionType.replaceAll("_", " ").toLowerCase();
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between px-3">
        <span className="text-xs tracking-wide uppercase opacity-60">{label}</span>
        <span className="font-mono text-xs tabular-nums opacity-60">{formatUsd(position.value)}</span>
      </div>
      <div className="space-y-0.5">
        {position.assets.map((a, i) => (
          <TokenRow key={`${a.address}-${i}`} token={a} />
        ))}
      </div>
    </div>
  );
}

function ProtocolCard({ proto }: { proto: OctavProtocolGroup }) {
  const [open, setOpen] = useState(false);
  const allPositionTypes = proto.chains.flatMap((c) => c.positions.map((p) => p.positionType));
  const actions = actionsForPositionTypes(allPositionTypes);

  return (
    <div className="bg-base-200 rounded-xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-base-300/50 flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors"
      >
        <div className="flex min-w-0 items-center gap-3">
          {proto.imgSmall ? (
            <img
              src={proto.imgSmall}
              alt={proto.name}
              className="h-8 w-8 rounded-full"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="bg-base-300 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold opacity-70">
              {proto.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{proto.name}</span>
              {actions.map((a) => (
                <span key={a} className="badge badge-outline badge-xs">
                  {a}
                </span>
              ))}
            </div>
            <div className="text-xs opacity-60">{proto.key}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tabular-nums">{formatUsd(proto.value)}</span>
          <span className={`text-xs opacity-60 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </div>
      </button>
      {open && (
        <div className="border-base-300 border-t px-2 pb-3">
          {proto.chains.map((chain) =>
            chain.positions.map((p, i) => (
              <PositionGroup key={`${chain.chainKey}-${p.positionType}-${i}`} position={p} />
            )),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Top-level panel that renders the Octav portfolio for the active Safe +
 * chain: cross-chain networth header, per-chain shares, then a list of
 * DeFi protocol positions with collapsible details. Wallet-held tokens
 * are intentionally NOT duplicated here — they live in the Tokens table
 * below this panel so the existing Transfer / refresh flow keeps working.
 */
export default function OctavPortfolioPanel({ portfolio, currentChainName, onDismiss }: OctavPortfolioPanelProps) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="bg-base-100 border-base-300 mb-6 rounded-2xl border p-4">
      {/* Header — networth + chain share row */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-xs tracking-wide uppercase opacity-60">Portfolio via Octav</div>
          <div className="text-3xl font-bold tabular-nums">{formatUsd(portfolio.networth)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost btn-xs" onClick={() => setShowRaw((v) => !v)} title="Show raw JSON">
            {showRaw ? "Hide JSON" : "View JSON"}
          </button>
          {onDismiss && (
            <button className="btn btn-ghost btn-xs btn-circle" onClick={onDismiss} title="Hide panel">
              ✕
            </button>
          )}
        </div>
      </div>

      {portfolio.chainSummary.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {portfolio.chainSummary.map((c) => (
            <div
              key={c.chainKey}
              className={`bg-base-200 flex items-center gap-2 rounded-full px-3 py-1 text-xs ${currentChainName && c.chainName.toLowerCase() === currentChainName.toLowerCase() ? "ring-primary ring-1" : ""}`}
              title={c.chainKey}
            >
              <span className="font-semibold capitalize">{c.chainName}</span>
              <span className="font-mono tabular-nums opacity-70">{formatUsd(c.value)}</span>
              <span className="opacity-50">{(c.share * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}

      {portfolio.protocols.length === 0 ? (
        <div className="bg-base-200 rounded-lg p-6 text-center text-sm opacity-60">
          No DeFi protocol positions on this chain. Wallet token balances appear in the Tokens table below.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="px-1 text-xs font-semibold tracking-wide uppercase opacity-60">
            Protocol positions ({portfolio.protocols.length})
          </div>
          {portfolio.protocols.map((p) => (
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
