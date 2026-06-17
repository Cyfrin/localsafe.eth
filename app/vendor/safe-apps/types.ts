// Vendored Safe Apps protocol (host side) — local replacement for the parent/wallet
// half of @safe-global/safe-apps-sdk's postMessage protocol. localsafe plays the
// "Safe" that an embedded dApp's safe-apps-sdk talks to, so no SDK dependency is
// added here: these types mirror the wire format the dApp's SDK sends/expects.
//
// Wire format (verified against @safe-global/safe-apps-sdk@9.1.0):
//   request  (dApp -> us): { id, method, params, env: { sdkVersion } }
//   response (us -> dApp): { id, success: true, data, version }
//                       |  { id, success: false, error, version }
// The dApp ignores responses whose major `version` is < 1, so every reply carries one.

/** Protocol version we report. Only the major (>= 1) is validated by the dApp's SDK. */
export const SAFE_APPS_PROTOCOL_VERSION = "9.1.0";

/** Safe Apps RPC methods this host implements. Anything else is answered with an error. */
export const SafeAppsMethod = {
  getSafeInfo: "getSafeInfo",
  getEnvironmentInfo: "getEnvironmentInfo",
  getChainInfo: "getChainInfo",
  rpcCall: "rpcCall",
  sendTransactions: "sendTransactions",
  signMessage: "signMessage",
  signTypedMessage: "signTypedMessage",
} as const;
export type SafeAppsMethod = (typeof SafeAppsMethod)[keyof typeof SafeAppsMethod];

/** A request envelope as emitted by the dApp's safe-apps-sdk. */
export interface SafeAppsRequest<P = unknown> {
  id: string;
  method: string;
  params: P;
  env: { sdkVersion: string };
}

export type SafeAppsResponse =
  | { id: string; success: true; data: unknown; version: string }
  | { id: string; success: false; error: string; version: string };

// --- Method payloads / responses (mirrored from the SDK's public types) ---

/** Returned for `getSafeInfo`. `chainId` is a number; `isReadOnly` means "cannot propose". */
export interface SafeInfo {
  safeAddress: string;
  chainId: number;
  threshold: number;
  owners: string[];
  isReadOnly: boolean;
  nonce?: number;
  implementation?: string;
  modules?: string[] | null;
  fallbackHandler?: string | null;
  guard?: string | null;
  version?: string | null;
}

/** Returned for `getChainInfo`. */
export interface ChainInfo {
  chainName: string;
  chainId: string;
  shortName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number; logoUri?: string };
  blockExplorerUriTemplate: { address: string; txHash: string; api: string };
}

/** Returned for `getEnvironmentInfo`. */
export interface EnvironmentInfo {
  origin: string;
}

/** A single transaction in a `sendTransactions` batch (no `operation` — always a Call). */
export interface BaseTransaction {
  to: string;
  value: string;
  data: string;
}

export interface SendTransactionsParams {
  txs: BaseTransaction[];
  params?: { safeTxGas?: number };
}

export interface SendTransactionsResponse {
  safeTxHash: string;
}

export interface RpcCallParams {
  call: string;
  params: unknown[];
}

export interface SignMessageParams {
  message: string;
}

export interface EIP712TypedData {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  message: Record<string, unknown>;
  primaryType?: string;
}

export interface SignTypedMessageParams {
  typedData: EIP712TypedData;
}

/** Off-chain signing response: the SafeMessage hash the dApp polls/looks up. */
export interface OffChainSignMessageResponse {
  messageHash: string;
}

/**
 * Host-side handlers, one per supported method. The dApp browser page supplies these,
 * wiring them to the vendored Safe core (`useSafe`) and the chain RPC. `getSafeInfo`,
 * `getChainInfo`, and `getEnvironmentInfo` are synchronous so the host can answer the
 * dApp connector's tight (~10ms) `getInfo` probe from cached state on iframe load.
 */
export interface SafeAppsHandlers {
  getSafeInfo: () => SafeInfo;
  getChainInfo: () => ChainInfo;
  getEnvironmentInfo: () => EnvironmentInfo;
  rpcCall: (params: RpcCallParams) => Promise<unknown>;
  sendTransactions: (params: SendTransactionsParams) => Promise<SendTransactionsResponse>;
  signMessage: (params: SignMessageParams) => Promise<OffChainSignMessageResponse>;
  signTypedMessage: (params: SignTypedMessageParams) => Promise<OffChainSignMessageResponse>;
}
