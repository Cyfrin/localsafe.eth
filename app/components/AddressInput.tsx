"use client";

import { useEnsAddress } from "@/app/hooks/useEnsAddress";
import { useEffect, useRef } from "react";

interface AddressInputProps {
  /** The raw user input (may be ENS name or 0x address) */
  value: string;
  /** Called on every keystroke with the raw input string */
  onChange: (rawInput: string) => void;
  /** Called when the resolved address changes */
  onResolvedAddressChange?: (resolvedAddress: string | undefined) => void;
  /** Input placeholder text */
  placeholder?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Additional CSS classes for the input element */
  className?: string;
  /** data-testid for the input element */
  testId?: string;
  /** Whether the input is required */
  required?: boolean;
}

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export default function AddressInput({
  value,
  onChange,
  onResolvedAddressChange,
  placeholder = "0x... or name.eth",
  disabled = false,
  className = "",
  testId,
  required = false,
}: AddressInputProps) {
  const { address: resolvedAddress, isLoading: isResolvingEns, isEnsName } = useEnsAddress(value);

  // Compute the effective address
  const effectiveAddress = isEnsName ? resolvedAddress : ADDRESS_PATTERN.test(value) ? value : undefined;

  // Use a ref for the callback to avoid re-triggering the effect on callback identity changes
  const onResolvedRef = useRef(onResolvedAddressChange);
  onResolvedRef.current = onResolvedAddressChange;

  useEffect(() => {
    onResolvedRef.current?.(effectiveAddress);
  }, [effectiveAddress]);

  return (
    <div className={`min-w-0 ${className}`}>
      <input
        type="text"
        className="input input-bordered w-full font-mono"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        disabled={disabled}
        required={required}
        data-testid={testId}
      />
      {isEnsName && (
        <label className="label">
          {isResolvingEns ? (
            <span className="label-text-alt flex items-center gap-2">
              <span className="loading loading-spinner loading-xs"></span>
              Resolving ENS name...
            </span>
          ) : resolvedAddress ? (
            <span className="label-text-alt text-success">
              Resolved: {resolvedAddress.slice(0, 6)}...{resolvedAddress.slice(-4)}
            </span>
          ) : (
            <span className="label-text-alt text-error">Could not resolve ENS name</span>
          )}
        </label>
      )}
    </div>
  );
}
