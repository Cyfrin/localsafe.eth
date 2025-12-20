"use client";

import { useEnsAddress as useWagmiEnsAddress } from "wagmi";

/**
 * Hook to resolve an ENS name to its Ethereum address.
 *
 * @param {string | undefined} ensName - The ENS name to resolve (e.g., "vitalik.eth").
 * @returns The Ethereum address if available, otherwise undefined.
 */
export function useEnsAddress(ensName: string | undefined) {
  // Only enable if input looks like an ENS name (contains .eth or similar TLD)
  const isValidEnsName = !!ensName && /^[a-zA-Z0-9-]+\.eth$/.test(ensName);

  const { data: address, isLoading } = useWagmiEnsAddress({
    name: ensName,
    chainId: 1, // ENS resolution always happens on Ethereum Mainnet
    query: {
      enabled: isValidEnsName,
    },
  });

  return {
    address: address ?? undefined,
    isLoading: isValidEnsName && isLoading,
    isEnsName: isValidEnsName,
  };
}
