"use client";

import React from "react";
import { tokenLogoUrl } from "@/app/utils/token-logos";

/**
 * The on-screen shape of a single token row — kept structurally
 * compatible with the parent's `TokenBalance` type so this component
 * doesn't need to re-import that interface.
 */
export interface TokensTableRow {
  address: string;
  symbol: string;
  decimals: number;
  name?: string;
  balance: string;
  usdPrice?: number;
  usdValue?: number;
}

interface TokensTableProps {
  balances: TokensTableRow[];
  loading: boolean;
  /** Used to size the loading/empty states correctly when there are no
   *  balances yet but the user has added (or imported) tokens. */
  hasTokens: boolean;
  onTransfer: (row: TokensTableRow) => void;
  onRemove: (address: string) => void;
}

/**
 * Balances table — header + rows for each tracked token, with Transfer
 * (visible on row hover) and Remove actions. Renders loading and
 * empty-state placeholders that match the parent's layout so the
 * surrounding divider + section spacing doesn't reflow.
 *
 * Stateless: the parent owns the data; this component just renders.
 */
export default function TokensTable({ balances, loading, hasTokens, onTransfer, onRemove }: TokensTableProps) {
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <div className="p-8 text-center">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      </div>
    );
  }

  if (balances.length === 0 && !hasTokens) {
    return (
      <div className="overflow-x-auto">
        <div className="bg-base-200 rounded-box p-8 text-center text-gray-400">
          No tokens added. Click &quot;+ Add Token&quot; to track token balances.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Price</th>
            <th>Balance</th>
            <th>Value</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {balances.map((token) => (
            <tr key={token.address} className="group hover:bg-base-200">
              <td>
                <div className="flex items-center gap-3">
                  {/* Token logo via logo.octav.fi — keyless, CORS-enabled,
                   *  CDN-cached. onError hides broken icons so the row
                   *  doesn't show a busted-image placeholder when a
                   *  logo isn't indexed yet. */}
                  <img
                    src={tokenLogoUrl(token.address)}
                    alt=""
                    aria-hidden="true"
                    className="h-7 w-7 rounded-full"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div>
                    <div className="font-semibold">{token.symbol}</div>
                    <div className="text-xs opacity-60">{token.name}</div>
                  </div>
                </div>
              </td>
              <td className="font-mono text-sm">
                {token.usdPrice
                  ? `$${token.usdPrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : "-"}
              </td>
              <td className="font-mono text-sm">
                {parseFloat(token.balance).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 4,
                })}{" "}
                {token.symbol}
              </td>
              <td className="font-mono text-sm font-semibold">
                {token.usdValue
                  ? `$${token.usdValue.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : "-"}
              </td>
              <td>
                <div className="flex gap-1">
                  <button
                    className="btn btn-primary btn-xs opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => onTransfer(token)}
                  >
                    Transfer
                  </button>
                  <button className="btn btn-ghost btn-xs" onClick={() => onRemove(token.address)} title="Remove token">
                    ✕
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
