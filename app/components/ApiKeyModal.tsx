"use client";

import React, { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import { useOctavEnabled } from "@/app/utils/octav-enabled";

interface ApiKeyModalProps {
  open: boolean;
  onClose: () => void;
}

const COINGECKO_API_KEY_STORAGE = "coingecko-api-key";
const OCTAV_API_KEY_STORAGE = "octav-api-key";

/**
 * Unified third-party API settings modal — covers every external service
 * the Safe dashboard talks to. Each section persists its own localStorage
 * key independently so providers can be added/removed à la carte without
 * touching the others.
 *
 * Today: CoinGecko (price fallback, optional) + Octav (portfolio
 * enrichment, optional). Add new sections by appending to the body.
 */
export default function ApiKeyModal({ open, onClose }: ApiKeyModalProps) {
  const [coingeckoKey, setCoingeckoKey] = useState("");
  const [octavKey, setOctavKey] = useState("");
  const octavEnabled = useOctavEnabled();
  const [savedFlash, setSavedFlash] = useState(false);

  // The post-save auto-close uses a timer; clear it on unmount (or on a
  // re-open before it fires) so we don't trigger onClose against a stale
  // closure or warn about setState on an unmounted component.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    setCoingeckoKey(localStorage.getItem(COINGECKO_API_KEY_STORAGE) ?? "");
    setOctavKey(localStorage.getItem(OCTAV_API_KEY_STORAGE) ?? "");
    setSavedFlash(false);
  }, [open]);

  function handleSave() {
    const cg = coingeckoKey.trim();
    const oc = octavKey.trim();
    if (cg) localStorage.setItem(COINGECKO_API_KEY_STORAGE, cg);
    else localStorage.removeItem(COINGECKO_API_KEY_STORAGE);
    if (oc) localStorage.setItem(OCTAV_API_KEY_STORAGE, oc);
    else localStorage.removeItem(OCTAV_API_KEY_STORAGE);
    setSavedFlash(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => onClose(), 800);
  }

  function clearCoingecko() {
    localStorage.removeItem(COINGECKO_API_KEY_STORAGE);
    setCoingeckoKey("");
  }

  function clearOctav() {
    localStorage.removeItem(OCTAV_API_KEY_STORAGE);
    setOctavKey("");
  }

  return (
    <Modal open={open} onClose={onClose} showCloseButton={false}>
      <h2 className="mb-4 text-2xl font-bold">API Settings</h2>

      {/* ─── CoinGecko ───────────────────────────────────────────────── */}
      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          {/* Brand-styled section header — green `btn` to match Octav's
           *  red pill, inheriting the brutalist offset shadow from the
           *  `btn` primitive. Links to the CoinGecko API page. */}
          <a
            href="https://www.coingecko.com/en/api"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm border-base-content gap-2 font-bold text-white hover:opacity-90"
            style={{ backgroundColor: "#4BCB02" }}
          >
            <img src="/coingecko-icon.svg" alt="" aria-hidden="true" className="h-4 w-4" />
            CoinGecko
          </a>
          <span className="text-xs opacity-60">Optional · raises price-lookup rate limits</span>
        </div>
        <p className="mb-1 text-sm opacity-70">
          Prices already work via CoinGecko&apos;s public keyless endpoint. Add a Demo-tier key for higher throughput
          when tracking many tokens.
        </p>
        <a
          href="https://www.coingecko.com/en/api/pricing"
          target="_blank"
          rel="noopener noreferrer"
          className="link mb-3 inline-block text-sm font-semibold"
          style={{ color: "#4BCB02" }}
        >
          Get a key
        </a>
        <div className="flex gap-2">
          <input
            type="password"
            className="input input-bordered flex-1 font-mono text-sm"
            placeholder="cg-..."
            value={coingeckoKey}
            onChange={(e) => {
              setCoingeckoKey(e.target.value);
              setSavedFlash(false);
            }}
          />
          <button className="btn btn-ghost btn-sm" onClick={clearCoingecko} disabled={!coingeckoKey}>
            Clear
          </button>
        </div>
      </section>

      {octavEnabled && <div className="divider my-0" />}

      {/* ─── Octav ───────────────────────────────────────────────────── */}
      {octavEnabled && (
        <section className="mt-6 mb-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            {/* Brand-styled section header — uses the same `btn` primitive
             *  the other action buttons use so daisyUI's brutalist offset
             *  shadow applies, matching the Enrich button and the Portfolio
             *  panel's Powered-by chip. Links to the Octav API docs. */}
            <a
              href="https://octav.fi/api"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm border-base-content gap-2 font-bold text-white hover:opacity-90"
              style={{ backgroundColor: "#FF1A45" }}
            >
              <img
                src="/octav-icon.svg"
                alt=""
                aria-hidden="true"
                className="h-4 w-4"
                style={{ filter: "brightness(0) invert(1)" }}
              />
              Octav
            </a>
            <span className="text-xs opacity-60">Required for &quot;Enrich with Octav&quot;</span>
          </div>
          <p className="mb-1 text-sm opacity-70">
            One request pulls every token + DeFi position the Safe holds, with USD values, across 20+ chains.
          </p>
          <a
            href="https://data.octav.fi/"
            target="_blank"
            rel="noopener noreferrer"
            className="link mb-3 inline-block text-sm font-semibold"
            style={{ color: "#FF1A45" }}
          >
            Get a key
          </a>
          <div className="flex gap-2">
            <input
              type="password"
              className="input input-bordered flex-1 font-mono text-sm"
              placeholder="Enter your Octav API key"
              value={octavKey}
              onChange={(e) => {
                setOctavKey(e.target.value);
                setSavedFlash(false);
              }}
            />
            <button className="btn btn-ghost btn-sm" onClick={clearOctav} disabled={!octavKey}>
              Clear
            </button>
          </div>
        </section>
      )}

      {savedFlash && <div className="alert alert-success mb-4 py-2 text-sm">Saved.</div>}

      <div className="flex justify-end gap-2">
        <button className="btn btn-sm" onClick={onClose}>
          Close
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={savedFlash}>
          Save
        </button>
      </div>
    </Modal>
  );
}

/** Defensive trim: password-manager paste often leaves trailing whitespace,
 *  and upstream APIs (Octav, CoinGecko) reject `Bearer xxx\n` with opaque
 *  errors. Returns null for an absent or whitespace-only stored value so
 *  callers' "no key configured" branches still fire correctly. */
function readTrimmedKey(storageKey: string): string | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(storageKey);
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

export function getCoinGeckoApiKey(): string | null {
  return readTrimmedKey(COINGECKO_API_KEY_STORAGE);
}

export function getOctavApiKey(): string | null {
  return readTrimmedKey(OCTAV_API_KEY_STORAGE);
}
