// EIP-712 hashing for SafeTx and SafeMessage — hash-parity with protocol-kit v6.
//
// These hashes are identity keys throughout the app (routes, storage, share links,
// WalletConnect session keys), so parity with what protocol-kit produced is load-bearing.
// Pinned by tests/parity.spec.ts against golden vectors generated from protocol-kit 6.1.0.

import { hashMessage, hashTypedData } from "viem";
import type { TypedDataDomain } from "viem";
import type { EIP712TypedData, SafeMessageData, SafeTransactionData } from "./types";

const EIP712_SAFE_TX_TYPE = {
  SafeTx: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" },
    { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" },
    { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

const EIP712_SAFE_MESSAGE_TYPE = {
  SafeMessage: [{ name: "message", type: "bytes" }],
} as const;

/** Whether a Safe version's EIP-712 domain includes chainId (>= 1.3.0). */
export function safeVersionUsesChainId(safeVersion: string): boolean {
  const [major = 0, minor = 0] = safeVersion.split(".").map((part) => parseInt(part, 10) || 0);
  return major > 1 || (major === 1 && minor >= 3);
}

function safeDomain(safeAddress: string, safeVersion: string, chainId: number | bigint): TypedDataDomain {
  const domain: TypedDataDomain = { verifyingContract: safeAddress as `0x${string}` };
  if (safeVersionUsesChainId(safeVersion)) {
    domain.chainId = Number(chainId);
  }
  return domain;
}

/**
 * The typed-data payload for a SafeTx — used both for local hashing and as the
 * eth_signTypedData_v4 request sent to wallets (bigints serialize to decimal strings).
 */
export function safeTxTypedData(
  safeAddress: string,
  data: SafeTransactionData,
  safeVersion: string,
  chainId: number | bigint,
) {
  return {
    domain: safeDomain(safeAddress, safeVersion, chainId),
    types: EIP712_SAFE_TX_TYPE,
    primaryType: "SafeTx" as const,
    message: {
      to: data.to as `0x${string}`,
      value: BigInt(data.value),
      data: data.data as `0x${string}`,
      operation: data.operation,
      safeTxGas: BigInt(data.safeTxGas),
      baseGas: BigInt(data.baseGas),
      gasPrice: BigInt(data.gasPrice),
      gasToken: data.gasToken as `0x${string}`,
      refundReceiver: data.refundReceiver as `0x${string}`,
      nonce: BigInt(data.nonce),
    },
  };
}

/** The on-chain SafeTx hash that owners sign (matches Safe.getTransactionHash). */
export function calculateSafeTransactionHash(
  safeAddress: string,
  data: SafeTransactionData,
  safeVersion: string,
  chainId: number | bigint,
): `0x${string}` {
  return hashTypedData(safeTxTypedData(safeAddress, data, safeVersion, chainId));
}

/** EIP712Domain must not be passed to viem's hashTypedData types. */
function withoutDomainType(typedData: EIP712TypedData) {
  const types = { ...typedData.types };
  delete types.EIP712Domain;
  return types;
}

function resolvePrimaryType(typedData: EIP712TypedData): string {
  if (typedData.primaryType) return typedData.primaryType;
  // Infer: the struct type not referenced by any other type
  const types = withoutDomainType(typedData);
  const referenced = new Set(
    Object.values(types)
      .flat()
      .map((field) => field.type.replace(/\[\]$/, "")),
  );
  const candidate = Object.keys(types).find((name) => !referenced.has(name));
  if (!candidate) {
    throw new Error("Invalid EIP-712 typed data: cannot determine primaryType");
  }
  return candidate;
}

/**
 * The canonical inner hash of a Safe message: EIP-191 for strings (hex-looking strings
 * are hashed as their literal UTF-8 text, matching protocol-kit), EIP-712 for typed data.
 * This is the value embedded in the SafeMessage struct that owners actually sign.
 */
export function hashSafeMessageData(message: SafeMessageData): `0x${string}` {
  if (typeof message === "string") {
    return hashMessage(message);
  }
  return hashTypedData({
    domain: message.domain as TypedDataDomain,
    types: withoutDomainType(message),
    primaryType: resolvePrimaryType(message),
    message: message.message,
  } as Parameters<typeof hashTypedData>[0]);
}

/** The canonical SafeMessage hash used for on-chain EIP-1271 validation. */
export function calculateSafeMessageHash(
  safeAddress: string,
  message: SafeMessageData,
  safeVersion: string,
  chainId: number | bigint,
): `0x${string}` {
  return hashTypedData({
    domain: safeDomain(safeAddress, safeVersion, chainId),
    types: EIP712_SAFE_MESSAGE_TYPE,
    primaryType: "SafeMessage",
    message: { message: hashSafeMessageData(message) },
  });
}

/**
 * The message identity hash used throughout the app for storage keys, routes, and
 * share links.
 *
 * For string messages this intentionally reproduces a protocol-kit quirk: the RAW
 * message string (not its EIP-191 hash) is fed to viem's hashTypedData as the
 * SafeMessage `bytes` value, inheriting viem's deterministic handling of non-hex
 * strings. Existing stored messages, links, and WalletConnect session keys are keyed
 * by this value, so it must not change (pinned by tests/parity.spec.ts; viem is
 * tilde-pinned in package.json for the same reason).
 *
 * For typed-data messages protocol-kit threw (so no stored data exists) — we use the
 * canonical hash.
 */
export function calculateSafeMessageLookupHash(
  safeAddress: string,
  message: SafeMessageData,
  safeVersion: string,
  chainId: number | bigint,
): `0x${string}` {
  if (typeof message !== "string") {
    return calculateSafeMessageHash(safeAddress, message, safeVersion, chainId);
  }
  return hashTypedData({
    domain: safeDomain(safeAddress, safeVersion, chainId),
    types: EIP712_SAFE_MESSAGE_TYPE,
    primaryType: "SafeMessage",
    message: { message: message as `0x${string}` },
  });
}

/** The typed-data payload wallets are asked to sign for a SafeMessage. */
export function safeMessageTypedData(
  safeAddress: string,
  message: SafeMessageData,
  safeVersion: string,
  chainId: number | bigint,
) {
  return {
    domain: safeDomain(safeAddress, safeVersion, chainId),
    types: EIP712_SAFE_MESSAGE_TYPE,
    primaryType: "SafeMessage" as const,
    message: { message: hashSafeMessageData(message) },
  };
}
