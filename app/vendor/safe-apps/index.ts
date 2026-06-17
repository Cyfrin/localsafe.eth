// Vendored Safe Apps protocol (host side). localsafe acts as the "Safe" that an embedded
// dApp's @safe-global/safe-apps-sdk talks to over postMessage — no SDK dependency added.

export { createSafeAppsHost, dispatchSafeAppsRequest, isSafeAppsRequest } from "./communicator";
export type { SafeAppsHostOptions } from "./communicator";
export { createSafeAppsHandlers, toChainInfo, READ_ONLY_RPC_CALLS } from "./methods";
export type { ChainLike, SafeAppsMethodContext } from "./methods";
export * from "./types";
