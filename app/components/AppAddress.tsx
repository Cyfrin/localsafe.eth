import React from "react";
import { useEnsAddress } from "@/app/hooks/useEnsAddress";

interface AppAddressProps {
  address: string;
  className?: string;
  testid?: string;
}

/**
 * Component to display a blockchain address with ENS support.
 *
 * @param {string} address - The blockchain address to display.
 * @param {string} [className] - Optional additional CSS classes for styling.
 * @param {string} [testid] - Optional test ID for testing purposes.
 * @returns A styled span element containing the blockchain address or ENS name.
 */
export default function AppAddress({ address, className, testid }: AppAddressProps) {
  const ensName = useEnsAddress(address);
  const displayAddress = ensName || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "");

  return (
    <span
      className={
        "bg-base-200 border-base-300 rounded border px-2 py-1 font-mono text-base break-all" +
        (className ? " " + className : "")
      }
      data-testid={testid || "app-address"}
    >
      {displayAddress}
    </span>
  );
}
