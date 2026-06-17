// Unit tests for the vendored Safe Apps host protocol (app/vendor/safe-apps).
// Pure dispatch + handler mapping only — no browser/anvil needed. Run as part of the
// Playwright suite (the runner is Node), mirroring tests/parity.spec.ts.

import { test, expect } from "@playwright/test";
import { dispatchSafeAppsRequest, isSafeAppsRequest } from "../app/vendor/safe-apps/communicator";
import { createSafeAppsHandlers, toChainInfo, READ_ONLY_RPC_CALLS } from "../app/vendor/safe-apps/methods";
import type { SafeAppsMethodContext, SafeAppsRequest, SafeAppsResponse, SafeInfo } from "../app/vendor/safe-apps/types";

const SAFE_INFO: SafeInfo = {
  safeAddress: "0x1111111111111111111111111111111111111111",
  chainId: 31337,
  threshold: 2,
  owners: ["0xaaaa", "0xbbbb"],
  isReadOnly: false,
};

function makeCtx(overrides: Partial<SafeAppsMethodContext> = {}): SafeAppsMethodContext {
  return {
    safeInfo: SAFE_INFO,
    chain: {
      id: 31337,
      name: "Anvil",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      blockExplorerUrl: "https://etherscan.io",
    },
    appOrigin: "https://app.example.eth",
    rpcRequest: async (method, params) => ({ method, params }),
    proposeTransactions: async () => ({ safeTxHash: "0xhash" }),
    proposeMessage: async () => ({ messageHash: "0xmsg" }),
    proposeTypedMessage: async () => ({ messageHash: "0xtyped" }),
    ...overrides,
  };
}

function req(method: string, params: unknown = undefined): SafeAppsRequest {
  return { id: "1", method, params, env: { sdkVersion: "9.1.0" } };
}

function asError(res: SafeAppsResponse): string {
  if (res.success) throw new Error("expected an error response");
  return res.error;
}

test.describe("Safe Apps host protocol", () => {
  test("isSafeAppsRequest accepts well-formed requests (incl. no-arg methods) and rejects junk", () => {
    expect(isSafeAppsRequest(req("getSafeInfo"))).toBe(true);
    // no-arg methods omit `params` entirely — still a valid request
    expect(isSafeAppsRequest({ id: "9", method: "getSafeInfo", env: { sdkVersion: "9.1.0" } })).toBe(true);
    expect(isSafeAppsRequest({ method: "getSafeInfo" })).toBe(false); // missing id
    expect(isSafeAppsRequest(null)).toBe(false);
    expect(isSafeAppsRequest("getSafeInfo")).toBe(false);
  });

  test("info methods return host data and always carry a version", async () => {
    const handlers = createSafeAppsHandlers(makeCtx());

    const info = await dispatchSafeAppsRequest(req("getSafeInfo"), handlers);
    expect(info.success).toBe(true);
    expect(info.version).toBe("9.1.0");
    if (info.success) expect(info.data).toMatchObject({ safeAddress: SAFE_INFO.safeAddress, chainId: 31337 });

    const env = await dispatchSafeAppsRequest(req("getEnvironmentInfo"), handlers);
    if (env.success) expect(env.data).toEqual({ origin: "https://app.example.eth" });

    const chain = await dispatchSafeAppsRequest(req("getChainInfo"), handlers);
    if (chain.success) expect(chain.data).toMatchObject({ chainId: "31337", chainName: "Anvil" });
  });

  test("sendTransactions resolves to the proposed safeTxHash", async () => {
    let received: unknown;
    const handlers = createSafeAppsHandlers(
      makeCtx({
        proposeTransactions: async (txs) => {
          received = txs;
          return { safeTxHash: "0xdeadbeef" };
        },
      }),
    );
    const res = await dispatchSafeAppsRequest(
      req("sendTransactions", { txs: [{ to: "0x2", value: "1", data: "0x" }] }),
      handlers,
    );
    expect(res).toEqual({ id: "1", success: true, version: "9.1.0", data: { safeTxHash: "0xdeadbeef" } });
    expect(received).toEqual([{ to: "0x2", value: "1", data: "0x" }]);
  });

  test("signMessage / signTypedMessage return a messageHash", async () => {
    const handlers = createSafeAppsHandlers(makeCtx());
    const msg = await dispatchSafeAppsRequest(req("signMessage", { message: "hello" }), handlers);
    if (msg.success) expect(msg.data).toEqual({ messageHash: "0xmsg" });
    const typed = await dispatchSafeAppsRequest(
      req("signTypedMessage", { typedData: { domain: {}, types: {}, message: {} } }),
      handlers,
    );
    if (typed.success) expect(typed.data).toEqual({ messageHash: "0xtyped" });
  });

  test("rpcCall forwards read methods but blocks state-changing ones", async () => {
    const seen: string[] = [];
    const handlers = createSafeAppsHandlers(
      makeCtx({
        rpcRequest: async (method) => {
          seen.push(method);
          return "0x1";
        },
      }),
    );

    const read = await dispatchSafeAppsRequest(req("rpcCall", { call: "eth_call", params: [] }), handlers);
    expect(read.success).toBe(true);
    expect(seen).toContain("eth_call");

    const write = await dispatchSafeAppsRequest(req("rpcCall", { call: "eth_sendTransaction", params: [] }), handlers);
    expect(asError(write)).toContain("not allowed");
    expect(seen).not.toContain("eth_sendTransaction");
  });

  test("safe_setSettings is acknowledged locally, never forwarded to the chain", async () => {
    let forwarded = false;
    const handlers = createSafeAppsHandlers(
      makeCtx({
        rpcRequest: async () => {
          forwarded = true;
          return null;
        },
      }),
    );
    const res = await dispatchSafeAppsRequest(
      req("rpcCall", { call: "safe_setSettings", params: [{ offChainSigning: true }] }),
      handlers,
    );
    if (res.success) expect(res.data).toEqual({ offChainSigning: true });
    expect(forwarded).toBe(false);
  });

  test("unsupported methods and handler errors become error responses, not throws", async () => {
    const unsupported = await dispatchSafeAppsRequest(req("getSafeBalances"), createSafeAppsHandlers(makeCtx()));
    expect(asError(unsupported)).toContain("not supported");

    const throwing = createSafeAppsHandlers(
      makeCtx({
        proposeTransactions: async () => {
          throw new Error("User rejected the request");
        },
      }),
    );
    const rejected = await dispatchSafeAppsRequest(req("sendTransactions", { txs: [] }), throwing);
    expect(asError(rejected)).toBe("User rejected the request");
  });

  test("toChainInfo builds block-explorer templates and stringifies chainId", () => {
    const info = toChainInfo({
      id: 1,
      name: "Ethereum",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      blockExplorerUrl: "https://etherscan.io/",
    });
    expect(info.chainId).toBe("1");
    expect(info.blockExplorerUriTemplate.address).toBe("https://etherscan.io/address/{{address}}");
    expect(info.blockExplorerUriTemplate.txHash).toBe("https://etherscan.io/tx/{{txHash}}");
  });

  test("read-only allow-list includes reads and excludes writes", () => {
    expect(READ_ONLY_RPC_CALLS.has("eth_call")).toBe(true);
    expect(READ_ONLY_RPC_CALLS.has("eth_getBalance")).toBe(true);
    expect(READ_ONLY_RPC_CALLS.has("eth_sendTransaction")).toBe(false);
    expect(READ_ONLY_RPC_CALLS.has("personal_sign")).toBe(false);
  });
});
