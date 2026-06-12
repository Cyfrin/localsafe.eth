// Safe transaction container — drop-in replacement for protocol-kit's EthSafeTransaction.

import { SafeSignature, buildSignatureBytes } from "./signatures";
import type { SafeTransactionData } from "./types";

/**
 * A SafeTx plus collected owner signatures.
 *
 * The signatures map is keyed by lowercased signer address — UI code relies on
 * `signatures.has(address.toLowerCase())`. Serialized form (localStorage/export):
 * `{ data, signatures: [{signer, data, isContractSignature}] }`.
 */
export class SafeTransaction {
  data: SafeTransactionData;
  signatures: Map<string, SafeSignature>;

  constructor(data: SafeTransactionData) {
    this.data = data;
    this.signatures = new Map();
  }

  getSignature(signer: string): SafeSignature | undefined {
    return this.signatures.get(signer.toLowerCase());
  }

  addSignature(signature: SafeSignature): void {
    this.signatures.set(signature.signer.toLowerCase(), signature);
  }

  /** Signer-sorted concatenated signature bytes for execTransaction. */
  encodedSignatures(): string {
    return buildSignatureBytes(Array.from(this.signatures.values()));
  }
}
