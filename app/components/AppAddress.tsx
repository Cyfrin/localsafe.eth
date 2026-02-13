import React, { useState } from "react";
import { useEnsName } from "@/app/hooks/useEnsName";

interface AppAddressProps {
  address: string;
  className?: string;
  testid?: string;
  truncate?: boolean;
}

/**
 * Component to display a blockchain address with ENS support.
 * When an ENS name is resolved, displays a toggle button to switch
 * between the ENS name and the full address.
 */
export default function AppAddress({ address, className, testid, truncate = true }: AppAddressProps) {
  const ensName = useEnsName(address);
  const [showRaw, setShowRaw] = useState(false);

  const isEnsInput = /^[a-zA-Z0-9-]+\.eth$/.test(address || "");

  // Only show toggle when we have a reverse-resolved ENS name for a 0x address.
  // When the address prop is itself an ENS string, there's no raw address to toggle to.
  const canToggle = !!ensName && !isEnsInput;

  let displayAddress: string;
  if (ensName && !showRaw) {
    displayAddress = ensName;
  } else if (isEnsInput) {
    displayAddress = address;
  } else if (truncate && address && address.length > 12) {
    displayAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  } else {
    displayAddress = address || "";
  }

  return (
    <span
      className={
        "bg-base-200 border-base-300 inline-flex items-center gap-1 rounded border px-2 py-1 font-mono text-base break-all" +
        (className ? " " + className : "")
      }
      data-testid={testid || "app-address"}
      data-address={address}
    >
      {displayAddress}
      {canToggle && (
        <button
          type="button"
          onClick={() => setShowRaw(!showRaw)}
          className="ml-0.5 shrink-0 cursor-pointer opacity-50 hover:opacity-100"
          data-testid="app-address-toggle"
          title={showRaw ? "Show ENS name" : "Show full address"}
        >
          {/* Swap arrows icon (Heroicons ArrowsRightLeft) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-4 w-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
