// contractNetworks.ts: per-chain Safe contract addresses fed to the vendored Safe core.
//
// Every chain gets the canonical deterministic-deployment addresses by default (they are
// identical on all standard EVM chains, local anvil included), overridable per chain via
// the custom-network form (wagmi chain.contracts). Chains unknown to Safe's registries —
// like battlechain — work the same way: configure where the contracts live, or deploy
// the official ones and use the defaults.

import { getDefaultContractAddresses } from "../vendor/safe";
import type { ContractAddresses, ContractNetworks } from "../vendor/safe";

export type { ContractAddresses, ContractNetworks };

// chain.contracts keys (set by NetworkModal) mapped to ContractAddresses fields
const CHAIN_CONTRACT_OVERRIDES: Array<[string, keyof ContractAddresses]> = [
  ["multiSend", "multiSendAddress"],
  ["multiSendCallOnly", "multiSendCallOnlyAddress"],
  ["safeProxyFactory", "safeProxyFactoryAddress"],
  ["safeSingleton", "safeSingletonAddress"],
  ["fallbackHandler", "fallbackHandlerAddress"],
  ["signMessageLib", "signMessageLibAddress"],
  ["createCall", "createCallAddress"],
  ["simulateTxAccessor", "simulateTxAccessorAddress"],
  ["tokenCallbackHandler", "tokenCallbackHandlerAddress"],
];

export function buildContractNetworks(
  chains: Array<{ id: number; contracts?: Record<string, { address?: string } | undefined> }>,
): ContractNetworks {
  const contractNetworks: ContractNetworks = {};
  for (const chain of chains) {
    const addresses: ContractAddresses = { ...getDefaultContractAddresses(chain.id) };
    for (const [contractKey, field] of CHAIN_CONTRACT_OVERRIDES) {
      const override = chain.contracts?.[contractKey]?.address;
      if (override) {
        addresses[field] = override;
      }
    }
    contractNetworks[chain.id] = addresses;
  }
  return contractNetworks;
}
