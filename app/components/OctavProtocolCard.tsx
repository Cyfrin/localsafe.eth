"use client";

import React, { useState } from "react";
import type { OctavProtocolGroup } from "@/app/utils/octav";
import { formatUsd } from "@/app/utils/format";
import { actionsForPositionTypes } from "@/app/utils/octav-actions";
import OctavPositionGroup from "./OctavPositionGroup";

interface OctavProtocolCardProps {
  proto: OctavProtocolGroup;
}

/**
 * One brutalist drop-shadow card per protocol — clickable header, list of
 * positions + assets inside when expanded. Card chrome lives at the
 * protocol level only; nested content is plain list rows so the visual
 * hierarchy stays one-deep.
 *
 * Local `open`/`closed` state is purely presentational (collapse toggle)
 * and doesn't leak upward — the parent panel passes the filtered protocol
 * shape and the card decides how to render it.
 */
export default function OctavProtocolCard({ proto }: OctavProtocolCardProps) {
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
              <OctavPositionGroup
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
