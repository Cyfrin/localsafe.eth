// Safe signature container and encoding — byte-compatible with protocol-kit's
// EthSafeSignature / buildSignatureBytes.

/**
 * A single owner signature over a SafeTx or SafeMessage hash.
 *
 * Serialization contract (localStorage, export files, share links):
 * `{ signer, data, isContractSignature }` — see SafeSignatureData in types.ts.
 */
export class SafeSignature {
  signer: string;
  data: string;
  isContractSignature: boolean;

  constructor(signer: string, signature: string, isContractSignature = false) {
    this.signer = signer;
    this.data = signature;
    this.isContractSignature = isContractSignature;
  }

  /**
   * The 65-byte static portion placed in signature order. For contract (EIP-1271)
   * signatures this is the verifier address + dynamic-part offset + type byte 0x00.
   * Note: the signer address is embedded as-passed (typically checksummed), matching
   * protocol-kit's output byte-for-byte.
   */
  staticPart(dynamicOffset?: string): string {
    if (this.isContractSignature) {
      return `000000000000000000000000${this.signer.slice(2)}${dynamicOffset ?? ""}00`;
    }
    return this.data.slice(2);
  }

  /** Length-prefixed signature bytes appended after all static parts (contract sigs only). */
  dynamicPart(): string {
    if (this.isContractSignature) {
      const dynamicPartLength = (this.data.slice(2).length / 2).toString(16).padStart(64, "0");
      return `${dynamicPartLength}${this.data.slice(2)}`;
    }
    return "";
  }
}

/** Build the pre-validated (approved-hash) signature for an owner executing their own tx. */
export function generatePreValidatedSignature(ownerAddress: string): SafeSignature {
  const signature = `0x000000000000000000000000${ownerAddress.slice(2)}${"0".repeat(64)}01`;
  return new SafeSignature(ownerAddress, signature);
}

/**
 * Concatenate signatures for execTransaction / EIP-1271 validation: sorted ascending by
 * lowercased signer, ECDSA static parts first, contract-signature dynamic parts appended.
 */
export function buildSignatureBytes(signatures: SafeSignature[]): string {
  const SIGNATURE_LENGTH_BYTES = 65;
  const sorted = [...signatures].sort((a, b) => a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()));

  let signatureBytes = "0x";
  let dynamicBytes = "";
  for (const signature of sorted) {
    if (signature.isContractSignature) {
      const dynamicPartPosition = (sorted.length * SIGNATURE_LENGTH_BYTES + dynamicBytes.length / 2)
        .toString(16)
        .padStart(64, "0");
      signatureBytes += signature.staticPart(dynamicPartPosition);
      dynamicBytes += signature.dynamicPart();
    } else {
      signatureBytes += signature.staticPart();
    }
  }
  return signatureBytes + dynamicBytes;
}

/**
 * Normalize the recovery byte of a wallet-produced ECDSA signature: wallets may return
 * v as 0/1 instead of 27/28 for eth_signTypedData.
 */
export function adjustVInSignature(signature: string): string {
  const ETHEREUM_V_VALUES = [0, 1, 27, 28];
  const MIN_VALID_V_VALUE_FOR_SAFE_ECDSA = 27;
  let signatureV = parseInt(signature.slice(-2), 16);
  if (!ETHEREUM_V_VALUES.includes(signatureV)) {
    throw new Error(`Invalid signature: unexpected v value ${signatureV}`);
  }
  if (signatureV < MIN_VALID_V_VALUE_FOR_SAFE_ECDSA) {
    signatureV += MIN_VALID_V_VALUE_FOR_SAFE_ECDSA;
  }
  return signature.slice(0, -2) + signatureV.toString(16);
}
