"use client";

import { useEnsName as useWagmiEnsName } from "wagmi";
import { useEnsAvailable } from "./useEnsAvailable";

/**
 * Hook to resolve an Ethereum address to its ENS name.
 *
 * Resolution only runs when a mainnet RPC is actually available (wallet on mainnet
 * or user-configured RPC) — see useEnsAvailable.
 *
 * @param {string | undefined} address - The Ethereum address to resolve.
 * @returns The ENS name if available, otherwise undefined.
 */
export function useEnsName(address: string | undefined) {
  const ensAvailable = useEnsAvailable();
  // Only enable if address is a valid Ethereum address format
  const isValidAddress = !!address && /^0x[a-fA-F0-9]{40}$/.test(address);

  const { data: ensName } = useWagmiEnsName({
    address: address as `0x${string}` | undefined,
    chainId: 1, // ENS resolution always happens on Ethereum Mainnet
    query: {
      enabled: isValidAddress && ensAvailable,
    },
  });

  return ensName ?? undefined;
}
