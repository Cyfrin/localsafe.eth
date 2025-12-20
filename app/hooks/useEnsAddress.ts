"use client";

import { useEnsName } from "wagmi";

/**
 * Hook to resolve an Ethereum address to its ENS name.
 *
 * @param {string | undefined} address - The Ethereum address to resolve.
 * @returns The ENS name if available, otherwise undefined.
 */
export function useEnsAddress(address: string | undefined) {
  const { data: ensName } = useEnsName({
    address: address as `0x${string}` | undefined,
    chainId: 1, // ENS resolution always happens on Ethereum Mainnet
    query: {
      enabled: !!address,
    },
  });

  return ensName ?? undefined;
}
