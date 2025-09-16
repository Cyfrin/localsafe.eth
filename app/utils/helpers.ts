// Helper functions for SafeProvider
import { Connector } from "wagmi";
import {
  MinimalEIP1193Provider,
  SafeConfigConnection,
  SafeConfigPrediction,
} from "./types";
import { ContractNetworks } from "./contractNetworks";
import { ADJECTIVES, NOUNS } from "./constants";

/**
 * Get a minimal EIP-1193 provider from a wagmi Connector.
 *
 * @param connector - wagmi Connector instance
 * @returns A minimal EIP-1193 provider or null if connector is undefined
 */
export async function getMinimalEIP1193Provider(
  connector: Connector | undefined,
): Promise<MinimalEIP1193Provider | null> {
  if (!connector) return null;
  const rawProvider = await connector.getProvider();
  const baseProvider = rawProvider as MinimalEIP1193Provider;
  return {
    request: baseProvider.request,
    on: baseProvider.on,
    removeListener: baseProvider.removeListener,
  };
}

/**
 * Create configuration object for Safe SDK and ProtocolKit.
 *
 * @param provider - EIP-1193 provider
 * @param signer - Signer address
 * @param owners - Array of owner addresses
 * @param threshold - Number of required confirmations
 * @param saltNonce - Optional salt nonce for address prediction
 * @returns Configuration object for Safe SDK and ProtocolKit
 */

// Factory for prediction/deployment config
export function createPredictionConfig(
  provider: MinimalEIP1193Provider | string,
  signer: string | undefined,
  owners: Array<`0x${string}`>,
  threshold: number,
  saltNonce?: string,
  contractNetworks?: ContractNetworks,
): SafeConfigPrediction {
  return {
    provider,
    signer,
    predictedSafe: {
      safeAccountConfig: { owners, threshold },
      safeDeploymentConfig: saltNonce?.toString ? { saltNonce } : undefined,
    },
    contractNetworks: contractNetworks,
  };
}

// Factory for connection config
export function createConnectionConfig(
  provider: MinimalEIP1193Provider,
  signer: string | undefined,
  safeAddress: `0x${string}`,
  contractNetworks?: ContractNetworks,
): SafeConfigConnection {
  return {
    provider,
    signer,
    safeAddress,
    contractNetworks: contractNetworks,
  };
}

export function getRandomSafeName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
}

/**
 * Sanitizes user input to prevent XSS attacks by removing HTML tags and dangerous characters.
 *
 * - Removes anything matching <...> (HTML tags) using /<[^>]*>/g
 * - Removes characters: > < ' " ` using /[><'"`]/g
 * - Trims whitespace and limits length to 64 characters
 *
 * @param name - The user input string to sanitize
 * @returns A safe string with tags and dangerous characters removed
 */
export function sanitizeUserInput(name: string): string {
  // Remove HTML tags, quotes, and angle brackets in one step
  const sanitized = name.replace(/<[^>]*>/g, "").replace(/[><'"`]/g, "");
  // Optionally trim and limit length
  return sanitized.trim().slice(0, 64);
}
