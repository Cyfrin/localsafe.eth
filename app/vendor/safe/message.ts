// Safe message container — drop-in replacement for protocol-kit's EthSafeMessage.

import { SafeSignature, buildSignatureBytes } from "./signatures";
import type { SafeMessageData } from "./types";

/**
 * An off-chain Safe message (EIP-191 string or EIP-712 typed data) plus collected
 * owner signatures, keyed by lowercased signer address. Serialized form:
 * `{ data, signatures: [{signer, data, isContractSignature}] }`.
 */
export class SafeMessage {
  data: SafeMessageData;
  signatures: Map<string, SafeSignature>;

  constructor(data: SafeMessageData) {
    this.data = data;
    this.signatures = new Map();
  }

  getSignature(signer: string): SafeSignature | undefined {
    return this.signatures.get(signer.toLowerCase());
  }

  addSignature(signature: SafeSignature): void {
    this.signatures.set(signature.signer.toLowerCase(), signature);
  }

  /** Signer-sorted concatenated signature bytes for EIP-1271 validation. */
  encodedSignatures(): string {
    return buildSignatureBytes(Array.from(this.signatures.values()));
  }
}
