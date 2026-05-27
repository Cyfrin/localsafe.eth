"use client";

import React, { useState, useEffect } from "react";
import Modal from "./Modal";

interface OctavApiKeyModalProps {
  open: boolean;
  onClose: () => void;
}

const OCTAV_API_KEY_STORAGE = "octav-api-key";

/**
 * API-key entry modal for Octav portfolio lookups. Mirrors the existing
 * `ApiKeyModal` (CoinGecko) pattern so users get a consistent flow: open
 * modal → paste key → save → key persists to localStorage.
 *
 * Octav's key authenticates a single Bearer-token API; with the key set,
 * the Tokens section exposes an "Auto-discover via Octav" action that
 * fetches the Safe's full token list + USD values in one request.
 */
export default function OctavApiKeyModal({ open, onClose }: OctavApiKeyModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      const stored = localStorage.getItem(OCTAV_API_KEY_STORAGE);
      if (stored) {
        setApiKey(stored);
        setSaved(true);
      } else {
        setApiKey("");
        setSaved(false);
      }
    }
  }, [open]);

  function handleSave() {
    if (apiKey.trim()) {
      localStorage.setItem(OCTAV_API_KEY_STORAGE, apiKey.trim());
      setSaved(true);
      setTimeout(() => {
        onClose();
      }, 1000);
    }
  }

  function handleClear() {
    localStorage.removeItem(OCTAV_API_KEY_STORAGE);
    setApiKey("");
    setSaved(false);
  }

  return (
    <Modal open={open} onClose={onClose} showCloseButton={false}>
      <h2 className="mb-4 text-2xl font-bold">Octav API Settings</h2>

      <div className="mb-4">
        <p className="mb-2 text-sm">
          Octav can auto-discover every token your Safe holds across 20+ chains in a single request, including USD
          prices and values. Configure your API key here to enable the Auto-discover action in the Tokens section.
        </p>
        <p className="mb-4 text-sm opacity-70">
          Create or manage a key at:{" "}
          <a href="https://data.octav.fi/" target="_blank" rel="noopener noreferrer" className="link link-primary">
            data.octav.fi
          </a>
        </p>
        <div className="alert alert-warning text-sm">
          <span>
            Using Octav reveals the Safe address you query to a remote service. Keep this disabled (no key set) if you
            need fully local operation.
          </span>
        </div>
      </div>

      <div className="mb-4">
        <label className="label">
          <span className="label-text font-semibold">API Key</span>
        </label>
        <input
          type="password"
          className="input input-bordered w-full font-mono text-sm"
          placeholder="Enter your Octav API key"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setSaved(false);
          }}
        />
      </div>

      {saved && <div className="alert alert-success mb-4">API key saved successfully!</div>}

      <div className="flex justify-between gap-2">
        <button className="btn btn-ghost btn-sm" onClick={handleClear} disabled={!apiKey}>
          Clear
        </button>
        <div className="flex gap-2">
          <button className="btn btn-sm" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!apiKey.trim() || saved}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function getOctavApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(OCTAV_API_KEY_STORAGE);
}
