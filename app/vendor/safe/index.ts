// Vendored Safe core — viem-based replacement for @safe-global/protocol-kit and
// @safe-global/safe-deployments, covering exactly the surface this app uses.
// Hash/signature/encoding parity with protocol-kit v6 is pinned by tests/parity.spec.ts.

export { SafeAccount } from "./account";
export type { ConnectedWalletClient } from "./account";
export { SafeTransaction } from "./transaction";
export { SafeMessage } from "./message";
export { SafeSignature } from "./signatures";
export {
  getDefaultContractAddresses,
  getKnownChainSafeVersion,
  isOfficialDeployment,
  getUntrustedContracts,
} from "./deployments";
export { verifyDeployments, SafeDeploymentTrustError } from "./trust";
export type { DeploymentTrustResult, DeploymentTrustStatus } from "./trust";
export type {
  ContractAddresses,
  ContractNetworks,
  EIP712TypedData,
  MetaTransactionInput,
  MinimalEIP1193Provider,
  PredictedSafeConfig,
  SafeAccountConfig,
  SafeAccountInitConfig,
  SafeDeploymentConfig,
  SafeMessageData,
  SafeSignatureData,
  SafeTransactionData,
} from "./types";
