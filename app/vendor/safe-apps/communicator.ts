// Host side of the Safe Apps postMessage protocol. Receives requests from an embedded
// dApp's safe-apps-sdk, dispatches them to the supplied handlers, and replies through
// the iframe. Pure dispatch (`dispatchSafeAppsRequest`) is separated from DOM wiring
// (`createSafeAppsHost`) so the protocol can be unit-tested without a browser.

import {
  SAFE_APPS_PROTOCOL_VERSION,
  SafeAppsMethod,
  type RpcCallParams,
  type SafeAppsHandlers,
  type SafeAppsRequest,
  type SafeAppsResponse,
  type SendTransactionsParams,
  type SignMessageParams,
  type SignTypedMessageParams,
} from "./types";

/** Narrow an arbitrary postMessage payload to a well-formed Safe Apps request. */
export function isSafeAppsRequest(data: unknown): data is SafeAppsRequest {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  // `params` is method-specific and omitted entirely for no-arg methods (getSafeInfo,
  // getChainInfo, getEnvironmentInfo), so only id + method identify a request.
  return typeof d.id === "string" && typeof d.method === "string";
}

function ok(id: string, data: unknown): SafeAppsResponse {
  return { id, success: true, data, version: SAFE_APPS_PROTOCOL_VERSION };
}

function fail(id: string, error: string): SafeAppsResponse {
  return { id, success: false, error, version: SAFE_APPS_PROTOCOL_VERSION };
}

/**
 * Route one request to its handler and wrap the outcome in a response envelope.
 * Never rejects: handler errors and unsupported methods become error responses.
 */
export async function dispatchSafeAppsRequest(
  request: SafeAppsRequest,
  handlers: SafeAppsHandlers,
): Promise<SafeAppsResponse> {
  try {
    switch (request.method) {
      case SafeAppsMethod.getSafeInfo:
        return ok(request.id, handlers.getSafeInfo());
      case SafeAppsMethod.getChainInfo:
        return ok(request.id, handlers.getChainInfo());
      case SafeAppsMethod.getEnvironmentInfo:
        return ok(request.id, handlers.getEnvironmentInfo());
      case SafeAppsMethod.rpcCall:
        return ok(request.id, await handlers.rpcCall(request.params as RpcCallParams));
      case SafeAppsMethod.sendTransactions:
        return ok(request.id, await handlers.sendTransactions(request.params as SendTransactionsParams));
      case SafeAppsMethod.signMessage:
        return ok(request.id, await handlers.signMessage(request.params as SignMessageParams));
      case SafeAppsMethod.signTypedMessage:
        return ok(request.id, await handlers.signTypedMessage(request.params as SignTypedMessageParams));
      default:
        return fail(request.id, `Method "${request.method}" is not supported by LocalSafe`);
    }
  } catch (err) {
    return fail(request.id, err instanceof Error ? err.message : String(err));
  }
}

export interface SafeAppsHostOptions {
  /** The iframe hosting the dApp. Only messages from its window are accepted. */
  iframe: HTMLIFrameElement;
  /** The dApp's origin (e.g. "https://app.uniswap.org"). Messages from other origins are ignored. */
  allowedOrigin: string;
  handlers: SafeAppsHandlers;
}

/**
 * Attach a Safe Apps host to an iframe. Returns a cleanup function that detaches the
 * listener. Messages are accepted only when both the source window and the origin match
 * the embedded dApp, so an unrelated frame or tab cannot drive the Safe.
 */
export function createSafeAppsHost({ iframe, allowedOrigin, handlers }: SafeAppsHostOptions): () => void {
  const onMessage = async (event: MessageEvent): Promise<void> => {
    if (event.source !== iframe.contentWindow) return;
    if (event.origin !== allowedOrigin) return;
    if (!isSafeAppsRequest(event.data)) return;

    const response = await dispatchSafeAppsRequest(event.data, handlers);
    (event.source as Window).postMessage(response, event.origin);
  };

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
