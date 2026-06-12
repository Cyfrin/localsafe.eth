// Vendored Safe types — local replacement for @safe-global/protocol-kit type surface.

export const OperationType = {
  Call: 0,
  DelegateCall: 1,
} as const;
export type OperationType = (typeof OperationType)[keyof typeof OperationType];

/**
 * The full SafeTx payload that gets EIP-712 hashed and signed.
 * Field types mirror what protocol-kit emitted so persisted/exchanged JSON stays compatible:
 * value/gas fields are decimal strings, nonce is a number.
 */
export interface SafeTransactionData {
  to: string;
  value: string;
  data: string;
  operation: number;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: string;
  refundReceiver: string;
  nonce: number;
}

/** Input shape for building transactions (pre-standardization). */
export interface MetaTransactionInput {
  to: string;
  value: string;
  data: string;
  operation?: number;
}

/** Wire format for signatures in localStorage, export files, and share links. */
export interface SafeSignatureData {
  signer: string;
  data: string;
  isContractSignature?: boolean;
}

/** EIP-712 typed data as received from WalletConnect or stored for Safe messages. */
export interface EIP712TypedData {
  types: Record<string, Array<{ name: string; type: string }>>;
  domain: Record<string, unknown>;
  primaryType?: string;
  message: Record<string, unknown>;
}

export type SafeMessageData = string | EIP712TypedData;

/** Per-chain Safe contract addresses. All optional; defaults come from the vendored registry. */
export type ContractAddresses = {
  safeSingletonAddress?: string;
  safeProxyFactoryAddress?: string;
  fallbackHandlerAddress?: string;
  multiSendAddress?: string;
  multiSendCallOnlyAddress?: string;
  signMessageLibAddress?: string;
  createCallAddress?: string;
  simulateTxAccessorAddress?: string;
  tokenCallbackHandlerAddress?: string;
};

export type ContractNetworks = {
  [chainId: string]: ContractAddresses;
};

export interface SafeAccountConfig {
  owners: string[];
  threshold: number;
  fallbackHandler?: string;
  to?: string;
  data?: string;
  paymentToken?: string;
  payment?: number;
  paymentReceiver?: string;
}

export interface SafeDeploymentConfig {
  saltNonce?: string;
  safeVersion?: string;
}

export interface PredictedSafeConfig {
  safeAccountConfig: SafeAccountConfig;
  safeDeploymentConfig?: SafeDeploymentConfig;
}

/** Minimal EIP-1193 provider (what wagmi connectors hand us). */
export type MinimalEIP1193Provider = {
  request: (args: unknown) => Promise<unknown>;
  on?: (...args: unknown[]) => void;
  removeListener?: (...args: unknown[]) => void;
};

export interface SafeAccountInitConfig {
  /** EIP-1193 provider, or a bare RPC URL for read-only/prediction use. */
  provider: MinimalEIP1193Provider | string;
  /** Connected signer address (undefined for read-only). */
  signer?: string;
  /** Address of a deployed Safe. Mutually exclusive with predictedSafe. */
  safeAddress?: `0x${string}`;
  /** Counterfactual Safe configuration. Mutually exclusive with safeAddress. */
  predictedSafe?: PredictedSafeConfig;
  /** Per-chain contract address overrides, merged over the vendored canonical defaults. */
  contractNetworks?: ContractNetworks;
  /**
   * User-confirmed deployment set for this chain. Consulted by the deployment-trust
   * gate when a contract is neither a known deployment nor bytecode-verified.
   */
  confirmedDeployments?: ContractAddresses;
}
