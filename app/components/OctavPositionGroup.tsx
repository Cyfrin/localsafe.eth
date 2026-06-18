"use client";

import React from "react";
import type { OctavPosition } from "@/app/utils/octav";
import { formatUsd, shortAddr } from "@/app/utils/format";
import OctavAssetListRow from "./OctavAssetListRow";

interface OctavPositionGroupProps {
  position: OctavPosition;
}

/**
 * Sub-section inside an expanded protocol card — one row group per
 * concrete position (Beefy vault, Pendle LP, IPOR vault…). Uses plain
 * divs (no card chrome) so nested assets read as a list rather than
 * competing with the outer brutalist box.
 */
export default function OctavPositionGroup({ position }: OctavPositionGroupProps) {
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
          <OctavAssetListRow key={`a-${a.address}-${i}`} token={a} />
        ))}
        {position.rewardAssets.map((a, i) => (
          <OctavAssetListRow key={`r-${a.address}-${i}`} token={a} reward />
        ))}
      </div>
    </div>
  );
}
