"use client";

import { useState, useEffect } from "react";
import { isAddress } from "viem";
import { isOfficialDeployment } from "../vendor/safe";
import type { ContractAddresses } from "../vendor/safe";

function AddressTrustHint({
  field,
  value,
  chainId,
}: {
  field: keyof ContractAddresses;
  value: string;
  chainId?: number | string;
}) {
  if (!value || !isAddress(value)) return null;
  if (isOfficialDeployment(field, value, chainId)) {
    return <p className="mt-1 font-mono text-xs opacity-60">[trusted] known safe deployment</p>;
  }
  return (
    <p className="text-warning mt-1 font-mono text-xs" data-testid={`untrusted-${field}`}>
      [untrusted] not a known safe deployment — verify this contract before signing
    </p>
  );
}

type ConfigureMultiSendModalProps = {
  open: boolean;
  onClose: () => void;
  currentMultiSend?: string;
  currentMultiSendCallOnly?: string;
  onSave: (multiSend?: string, multiSendCallOnly?: string) => void;
  chainId?: number | string;
};

export default function ConfigureMultiSendModal({
  open,
  onClose,
  currentMultiSend,
  currentMultiSendCallOnly,
  onSave,
  chainId,
}: ConfigureMultiSendModalProps) {
  const [multiSendAddress, setMultiSendAddress] = useState(currentMultiSend || "");
  const [multiSendCallOnlyAddress, setMultiSendCallOnlyAddress] = useState(currentMultiSendCallOnly || "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMultiSendAddress(currentMultiSend || "");
      setMultiSendCallOnlyAddress(currentMultiSendCallOnly || "");
      setError(null);
    }
  }, [open, currentMultiSend, currentMultiSendCallOnly]);

  const handleSave = () => {
    setError(null);

    // Validate addresses if provided
    if (multiSendAddress && !isAddress(multiSendAddress)) {
      setError("Invalid MultiSend address");
      return;
    }

    if (multiSendCallOnlyAddress && !isAddress(multiSendCallOnlyAddress)) {
      setError("Invalid MultiSend Call Only address");
      return;
    }

    onSave(multiSendAddress || undefined, multiSendCallOnlyAddress || undefined);
    onClose();
  };

  const handleClear = () => {
    setMultiSendAddress("");
    setMultiSendCallOnlyAddress("");
  };

  if (!open) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Configure MultiSend (Safe Override)</h3>
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
            <p className="font-semibold">Safe-Level Override</p>
            <p>
              These addresses override the network-level configuration for this Safe only. Leave empty to use network
              defaults.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">MultiSend Address (Optional)</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              placeholder="0x... (leave empty for network default)"
              value={multiSendAddress}
              onChange={(e) => setMultiSendAddress(e.target.value)}
            />
            <label className="label">
              <span className="label-text-alt">Used for batching multiple transactions together</span>
            </label>
            <AddressTrustHint field="multiSendAddress" value={multiSendAddress} chainId={chainId} />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">MultiSend Call Only Address (Optional)</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              placeholder="0x... (leave empty for network default)"
              value={multiSendCallOnlyAddress}
              onChange={(e) => setMultiSendCallOnlyAddress(e.target.value)}
            />
            <label className="label">
              <span className="label-text-alt">Used for call-only (no delegatecall) batched transactions</span>
            </label>
            <AddressTrustHint field="multiSendCallOnlyAddress" value={multiSendCallOnlyAddress} chainId={chainId} />
          </div>

          {error && (
            <div className="alert alert-error">
              <span>{error}</span>
            </div>
          )}

          <div className="alert alert-warning">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 shrink-0 stroke-current"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="text-sm">
              <p className="font-semibold">Warning</p>
              <p>
                Only set these if you know what you&apos;re doing. Invalid addresses will prevent transaction batching.
              </p>
            </div>
          </div>
        </div>

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={handleClear}>
            Clear All
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save Configuration
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  );
}
