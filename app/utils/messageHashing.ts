import { ethers } from "ethers";

/**
 * Result of EIP-712 hash calculations
 */
export interface EIP712HashResult {
  domainHash: string;
  messageHash: string;
  eip712Hash: string;
  safeMessage?: string; // The inner message hash (for SafeMessage wrapping)
}

/**
 * Calculate EIP-712 domain hash
 */
export function calculateDomainHash(domain: any): string {
  return ethers.TypedDataEncoder.hashDomain(domain);
}

/**
 * Calculate EIP-712 struct hash
 */
export function calculateStructHash(primaryType: string, types: Record<string, any>, message: any): string {
  return ethers.TypedDataEncoder.hashStruct(primaryType, types, message);
}

/**
 * Calculate full EIP-712 hash
 */
export function calculateEIP712Hash(domain: any, types: Record<string, any>, message: any): string {
  return ethers.TypedDataEncoder.hash(domain, types, message);
}

/**
 * Calculate hashes for a SafeMessage structure
 *
 * @param safeAddress - The Safe contract address
 * @param chainId - The chain ID
 * @param messageContent - The inner message content (already hashed for personal_sign, or EIP-712 hash for typed data)
 * @param safeVersion - The Safe contract version (default: "1.4.1")
 * @returns Object containing domain hash, message hash, and final EIP-712 hash
 */
export function calculateSafeMessageHashes(
  safeAddress: string,
  chainId: number,
  messageContent: string,
  safeVersion = "1.4.1",
): EIP712HashResult {
  // SafeMessage EIP-712 domain
  const includeChainId = safeVersion >= "1.3.0";
  const domain = includeChainId
    ? {
        chainId: chainId,
        verifyingContract: safeAddress,
      }
    : {
        verifyingContract: safeAddress,
      };

  // SafeMessage EIP-712 types
  const types = {
    SafeMessage: [{ name: "message", type: "bytes" }],
  };

  // SafeMessage message structure
  const message = {
    message: messageContent,
  };

  // Calculate the hashes
  const domainHash = calculateDomainHash(domain);
  const messageHash = calculateStructHash("SafeMessage", types, message);
  const eip712Hash = calculateEIP712Hash(domain, types, message);

  return {
    domainHash,
    messageHash,
    eip712Hash,
    safeMessage: messageContent,
  };
}

/**
 * Calculate hash for a personal_sign message
 *
 * @param message - The message to hash (can be hex string or plain string)
 * @returns EIP-191 message hash
 */
export function calculatePersonalSignHash(message: string): string {
  // Decode hex message if it starts with 0x
  let decodedMessage: string;

  if (message.startsWith("0x")) {
    try {
      decodedMessage = ethers.toUtf8String(message);
    } catch {
      // If decoding fails, use the hex string as-is
      decodedMessage = message;
    }
  } else {
    decodedMessage = message;
  }

  // Apply EIP-191 hash
  return ethers.hashMessage(decodedMessage);
}

/**
 * Calculate EIP-712 hash for typed data
 *
 * @param typedData - The EIP-712 typed data object
 * @returns Object containing all relevant hashes
 */
export function calculateTypedDataHash(typedData: {
  domain: any;
  types: Record<string, any>;
  primaryType: string;
  message: any;
}): EIP712HashResult {
  const { domain, types, primaryType, message } = typedData;

  // Remove EIP712Domain from types if present (ethers handles this automatically)
  const typesWithoutDomain = { ...types };
  delete typesWithoutDomain.EIP712Domain;

  const domainHash = calculateDomainHash(domain);
  const messageHash = calculateStructHash(primaryType, typesWithoutDomain, message);
  const eip712Hash = calculateEIP712Hash(domain, typesWithoutDomain, message);

  return {
    domainHash,
    messageHash,
    eip712Hash,
  };
}

/**
 * Validate EIP-712 typed data structure
 *
 * @param typedData - The typed data to validate
 * @returns true if valid, throws error if invalid
 */
export function validateTypedData(typedData: any): boolean {
  if (!typedData.types) {
    throw new Error("Invalid EIP-712 format: missing 'types' field");
  }
  if (!typedData.domain) {
    throw new Error("Invalid EIP-712 format: missing 'domain' field");
  }
  if (!typedData.message) {
    throw new Error("Invalid EIP-712 format: missing 'message' field");
  }
  if (!typedData.primaryType) {
    throw new Error("Invalid EIP-712 format: missing 'primaryType' field");
  }
  return true;
}

/**
 * Calculate inner message hash from message data
 * Handles both string messages (personal_sign) and EIP-712 typed data
 *
 * @param messageData - The message data (string or EIP-712 typed data object)
 * @returns The inner message hash
 */
export function calculateInnerMessageHash(
  messageData: string | { domain: any; types: Record<string, any>; message: any },
): string {
  if (typeof messageData === "string") {
    // For string messages, apply EIP-191 hash
    return ethers.hashMessage(messageData);
  } else {
    // For EIP-712 typed data, use the EIP-712 hash
    const { domain, types, message } = messageData;
    return ethers.TypedDataEncoder.hash(domain, types, message);
  }
}

/**
 * Calculate SafeMessage hashes from raw message data
 * This is a convenience function that combines calculateInnerMessageHash and calculateSafeMessageHashes
 *
 * @param safeAddress - The Safe contract address
 * @param chainId - The chain ID
 * @param messageData - The message data (string or EIP-712 typed data object)
 * @param safeVersion - The Safe contract version (default: "1.4.1")
 * @returns Object containing all SafeMessage hashes including the inner message hash
 */
export function calculateSafeMessageHashesFromData(
  safeAddress: string,
  chainId: number,
  messageData: string | { domain: any; types: Record<string, any>; message: any },
  safeVersion = "1.4.1",
): EIP712HashResult {
  const innerMessageHash = calculateInnerMessageHash(messageData);
  return calculateSafeMessageHashes(safeAddress, chainId, innerMessageHash, safeVersion);
}

/**
 * Calculate EIP-712 hashes for SafeTx structure
 *
 * @param safeAddress - The Safe contract address
 * @param chainId - The chain ID
 * @param safeTx - The Safe transaction data
 * @returns Object containing domain hash, message hash, and final EIP-712 hash
 */
export function calculateSafeTxHashes(
  safeAddress: string,
  chainId: number,
  safeTx: {
    to: string;
    value: bigint | string;
    data: string;
    operation: number;
    safeTxGas: bigint | string;
    baseGas: bigint | string;
    gasPrice: bigint | string;
    gasToken: string;
    refundReceiver: string;
    nonce: bigint | string;
  },
): EIP712HashResult {
  const domain = {
    chainId: chainId,
    verifyingContract: safeAddress,
  };

  const types = {
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
  };

  const message = {
    to: safeTx.to,
    value: safeTx.value,
    data: safeTx.data,
    operation: safeTx.operation,
    safeTxGas: safeTx.safeTxGas,
    baseGas: safeTx.baseGas,
    gasPrice: safeTx.gasPrice,
    gasToken: safeTx.gasToken,
    refundReceiver: safeTx.refundReceiver,
    nonce: safeTx.nonce,
  };

  const domainHash = calculateDomainHash(domain);
  const messageHash = calculateStructHash("SafeTx", types, message);
  const eip712Hash = calculateEIP712Hash(domain, types, message);

  return {
    domainHash,
    messageHash,
    eip712Hash,
  };
}
