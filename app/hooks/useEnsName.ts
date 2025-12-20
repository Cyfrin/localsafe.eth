"use client";

import { useEnsName as useWagmiEnsName } from "wagmi";

/**
 * Hook to resolve an Ethereum address to its ENS name.
 *
 * @param {string | undefined} address - The Ethereum address to resolve.
 * @returns The ENS name if available, otherwise undefined.
 */
export function useEnsName(address: string | undefined) {
  // Only enable if address is a valid Ethereum address format
  const isValidAddress = !!address && /^0x[a-fA-F0-9]{40}$/.test(address);

  const { data: ensName } = useWagmiEnsName({
    address: address as `0x${string}` | undefined,
    chainId: 1, // ENS resolution always happens on Ethereum Mainnet
    query: {
      enabled: isValidAddress,
    },
  });

  return ensName ?? undefined;
}
