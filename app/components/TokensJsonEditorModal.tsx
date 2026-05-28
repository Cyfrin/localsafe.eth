"use client";

import React from "react";

interface TokensJsonEditorModalProps {
  open: boolean;
  value: string;
  onChange: (v: string) => void;
  /** Validation error to surface above the action row. The parent owns
   *  parsing/validation; this modal just displays whatever string is set. */
  error: string | null;
  onSave: () => void;
  onClose: () => void;
}

/**
 * Modal for editing the tracked-token list as raw JSON. Useful for bulk
 * edits, paste-from-clipboard imports, and tweaking custom names.
 * Stateless — the parent owns the editor value and the validation error.
 */
export default function TokensJsonEditorModal({
  open,
  value,
  onChange,
  error,
  onSave,
  onClose,
}: TokensJsonEditorModalProps) {
  if (!open) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Edit Token List (JSON)</h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="alert alert-info mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            className="h-6 w-6 shrink-0 stroke-current"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
          <div className="text-sm">
            <p className="font-semibold">Token List Format</p>
            <p>
              Each token must have: address (string), symbol (string), decimals (number), and optionally name (string)
            </p>
          </div>
        </div>

        <textarea
          className="textarea textarea-bordered w-full font-mono text-sm"
          rows={20}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder='[\n  {\n    "address": "0x...",\n    "symbol": "USDT",\n    "decimals": 6,\n    "name": "Tether USD"\n  }\n]'
        />

        {error && (
          <div className="alert alert-error mt-2">
            <span>{error}</span>
          </div>
        )}

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onSave}>
            Save Changes
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  );
}
