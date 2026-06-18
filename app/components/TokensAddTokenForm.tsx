"use client";

import React from "react";
import AddressInput from "./AddressInput";

interface TokensAddTokenFormProps {
  value: string;
  onChange: (v: string) => void;
  onResolvedAddressChange: (addr: string | undefined) => void;
  /** Resolved address (post-ENS lookup). Used to enable/disable Add. */
  resolvedAddress?: string;
  onAdd: () => void;
  onCancel: () => void;
  error: string | null;
}

/**
 * Collapsible "add a single token by address" form. Stateless — the
 * parent owns the input string and the resolved address; this component
 * just renders the input row and raises events.
 */
export default function TokensAddTokenForm({
  value,
  onChange,
  onResolvedAddressChange,
  resolvedAddress,
  onAdd,
  onCancel,
  error,
}: TokensAddTokenFormProps) {
  return (
    <div className="bg-base-200 mb-4 rounded-lg p-4">
      <div className="flex gap-2">
        <AddressInput
          value={value}
          onChange={onChange}
          onResolvedAddressChange={onResolvedAddressChange}
          placeholder="Token contract address (0x... or name.eth)"
          className="flex-1 text-sm"
        />
        <button className="btn btn-primary btn-sm" onClick={onAdd} disabled={!resolvedAddress}>
          Add
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <div className="alert alert-error mt-2 text-sm">{error}</div>}
    </div>
  );
}
