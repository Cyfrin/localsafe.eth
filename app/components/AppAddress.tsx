import React from "react";
import { useEnsName } from "@/app/hooks/useEnsName";

interface AppAddressProps {
  address: string;
  className?: string;
  testid?: string;
  truncate?: boolean;
}

/**
 * Component to display a blockchain address with ENS support.
 *
 * @param {string} address - The blockchain address to display.
 * @param {string} [className] - Optional additional CSS classes for styling.
 * @param {string} [testid] - Optional test ID for testing purposes.
 * @param {boolean} [truncate=true] - Whether to truncate the address. Defaults to true.
 * @returns A styled span element containing the blockchain address or ENS name.
 */
export default function AppAddress({ address, className, testid, truncate = true }: AppAddressProps) {
  const ensName = useEnsName(address);

  let displayAddress: string;
  if (ensName) {
    displayAddress = ensName;
  } else if (truncate && address && address.length > 12) {
    displayAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  } else {
    displayAddress = address || "";
  }

  return (
    <span
      className={
        "bg-base-200 border-base-300 rounded border px-2 py-1 font-mono text-base break-all" +
        (className ? " " + className : "")
      }
      data-testid={testid || "app-address"}
      data-address={address}
    >
      {displayAddress}
    </span>
  );
}
