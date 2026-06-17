// Assembles Safe Apps host handlers from a plain context, decoupled from React so the
// mapping logic is unit-testable. The dApp browser page supplies the context, wiring
// `rpcRequest` to the chain's public client and the `propose*` callbacks to the vendored
// Safe core (`useSafe`) behind an explicit user-approval step.

import type {
  BaseTransaction,
  ChainInfo,
  EIP712TypedData,
  OffChainSignMessageResponse,
  RpcCallParams,
  SafeAppsHandlers,
  SafeInfo,
  SendTransactionsResponse,
} from "./types";

/**
 * JSON-RPC methods the dApp may call read-only via `rpcCall`. Writes/signing are NOT
 * here on purpose — they must go through `sendTransactions` / `signMessage` so they hit
 * the Safe multisig flow with user approval, never the connected signer directly.
 */
export const READ_ONLY_RPC_CALLS: ReadonlySet<string> = new Set([
  "eth_call",
  "eth_getBalance",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_getLogs",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getTransactionCount",
  "eth_gasPrice",
  "eth_estimateGas",
  "eth_chainId",
  "eth_blockNumber",
  "eth_feeHistory",
  "eth_maxPriorityFeePerGas",
]);

/** Minimal shape of a chain needed for `getChainInfo`, mapped from the wagmi chain. */
export interface ChainLike {
  id: number;
  name: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  shortName?: string;
  blockExplorerUrl?: string;
  blockExplorerApiUrl?: string;
}

/** Build the Safe Apps `ChainInfo` payload from a chain. */
export function toChainInfo(chain: ChainLike): ChainInfo {
  const explorer = chain.blockExplorerUrl?.replace(/\/$/, "");
  return {
    chainName: chain.name,
    chainId: String(chain.id),
    shortName: chain.shortName ?? String(chain.id),
    nativeCurrency: { ...chain.nativeCurrency },
    blockExplorerUriTemplate: {
      address: explorer ? `${explorer}/address/{{address}}` : "",
      txHash: explorer ? `${explorer}/tx/{{txHash}}` : "",
      api: chain.blockExplorerApiUrl ?? "",
    },
  };
}

/** Everything the host handlers need, supplied by the dApp browser page. */
export interface SafeAppsMethodContext {
  safeInfo: SafeInfo;
  chain: ChainLike;
  /** Origin of the embedded dApp, returned by `getEnvironmentInfo`. */
  appOrigin: string;
  /** Read-only JSON-RPC proxy to the active chain (rejects non-read methods). */
  rpcRequest: (method: string, params: unknown[]) => Promise<unknown>;
  /** Show approval UI, build a SafeTx, save it to the queue, return its `safeTxHash`. */
  proposeTransactions: (txs: BaseTransaction[], safeTxGas?: number) => Promise<SendTransactionsResponse>;
  /** Show approval UI, create a SafeMessage (EIP-191), return its message hash. */
  proposeMessage: (message: string) => Promise<OffChainSignMessageResponse>;
  /** Show approval UI, create a SafeMessage (EIP-712), return its message hash. */
  proposeTypedMessage: (typedData: EIP712TypedData) => Promise<OffChainSignMessageResponse>;
}

/** Construct the full handler set the communicator dispatches to. */
export function createSafeAppsHandlers(ctx: SafeAppsMethodContext): SafeAppsHandlers {
  return {
    getSafeInfo: () => ctx.safeInfo,
    getChainInfo: () => toChainInfo(ctx.chain),
    getEnvironmentInfo: () => ({ origin: ctx.appOrigin }),
    rpcCall: async ({ call, params }: RpcCallParams) => {
      // `safe_setSettings` (off-chain signing toggle) is a Safe-host concern, not a chain
      // call — acknowledge it by echoing the settings back rather than forwarding to RPC.
      if (call === "safe_setSettings") return params[0] ?? {};
      if (!READ_ONLY_RPC_CALLS.has(call)) {
        throw new Error(`rpcCall "${call}" is not allowed; use sendTransactions/signMessage for state changes`);
      }
      return ctx.rpcRequest(call, params);
    },
    sendTransactions: ({ txs, params }) => ctx.proposeTransactions(txs, params?.safeTxGas),
    signMessage: ({ message }) => ctx.proposeMessage(message),
    signTypedMessage: ({ typedData }) => ctx.proposeTypedMessage(typedData),
  };
}
