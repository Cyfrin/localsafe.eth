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
  safeVersion = "1.4.1"
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
