"use client";

import { useAccount } from "wagmi";
import { mainnet } from "wagmi/chains";
import { useWagmiConfigContext, isMainnetRpcConfigured } from "../provider/WagmiConfigProvider";

/**
 * Whether ENS resolution can run without leaking traffic to an RPC the user never chose.
 *
 * ENS lives on Ethereum mainnet, so resolution needs a mainnet RPC. The app never
 * falls back to viem's bundled public endpoint; ENS is available only when the
 * connected wallet is on mainnet (its own RPC serves the reads) or the user has
 * explicitly configured a mainnet RPC (env override or network settings).
 */
export function useEnsAvailable(): boolean {
  const { configChains } = useWagmiConfigContext();
  const { chain } = useAccount();
  return chain?.id === mainnet.id || isMainnetRpcConfigured(configChains);
}
