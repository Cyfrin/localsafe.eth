"use client";

import React from "react";
import type { OctavDiscoveredToken } from "@/app/utils/octav";
import { tokenLogoUrl } from "@/app/utils/token-logos";
import { formatBalance, formatUsd } from "@/app/utils/format";

interface OctavAssetListRowProps {
  token: OctavDiscoveredToken;
  /** Set true when this asset is a claimable reward, not a principal
   *  holding — adds a small "reward" chip and otherwise renders identically. */
  reward?: boolean;
}

/**
 * Plain asset list-row used inside the expanded protocol card. No card
 * chrome — just an icon + name on the left, balance + USD value on the
 * right, so nested assets read as a clean list rather than competing with
 * the outer brutalist box.
 */
export default function OctavAssetListRow({ token, reward = false }: OctavAssetListRowProps) {
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
