import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeyringEvent } from "@metamask/keyring-api";

// emitSnapKeyringEvent talks to MetaMask — mock it and assert our payloads.
vi.mock("@metamask/keyring-snap-sdk", () => ({
  emitSnapKeyringEvent: vi.fn().mockResolvedValue(undefined),
}));

import { emitSnapKeyringEvent } from "@metamask/keyring-snap-sdk";
import { SafeKeyring } from "../src/keyring";
import { DEFAULT_COMPANION_URL, resolveCompanionUrl } from "../src/state";
import type { KeyringRequest } from "@metamask/keyring-api";

const emitMock = vi.mocked(emitSnapKeyringEvent);
const SAFE = "0x1111111111111111111111111111111111111111";

const accountOpts = {
  safeAddress: SAFE,
  owners: ["0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333"],
  threshold: 2,
  chainIds: [1],
  companionUrl: "http://localhost:3000",
};

function newKeyring() {
  return new SafeKeyring({ accounts: {}, pendingRequests: {} });
}

function dappRequest(id: string, account: string): KeyringRequest {
  return {
    id,
    account,
    scope: "",
    origin: "https://dapp.example",
    request: { method: "personal_sign", params: ["0xdeadbeef", SAFE] },
  };
}

beforeEach(() => {
  emitMock.mockClear();
  // The keyring persists via the `snap` global; stub it to a no-op.
  vi.stubGlobal("snap", { request: vi.fn().mockResolvedValue(null) });
});

describe("resolveCompanionUrl", () => {
  it("accepts allowlisted origins", () => {
    expect(resolveCompanionUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(resolveCompanionUrl("https://localsafe.cyfrin.io")).toBe("https://localsafe.cyfrin.io");
  });

  it("falls back to the default for non-allowlisted or invalid input", () => {
    expect(resolveCompanionUrl("https://evil.example")).toBe(DEFAULT_COMPANION_URL);
    expect(resolveCompanionUrl("not a url")).toBe(DEFAULT_COMPANION_URL);
    expect(resolveCompanionUrl(undefined)).toBe(DEFAULT_COMPANION_URL);
  });
});

describe("SafeKeyring.createAccount", () => {
  it("builds an EOA account scoped to all EVM chains with signing-only methods", async () => {
    const keyring = newKeyring();
    const account = await keyring.createAccount(accountOpts);

    expect(account.type).toBe("eip155:eoa");
    expect(account.address).toBe(SAFE);
    expect(account.scopes).toEqual(["eip155:0"]);
    expect(account.methods).toEqual(["personal_sign", "eth_signTypedData_v4"]);
    expect(account.options.companionUrl).toBe("http://localhost:3000");
    expect(emitMock).toHaveBeenCalledWith(
      expect.anything(),
      KeyringEvent.AccountCreated,
      expect.objectContaining({ account }),
    );
    expect(await keyring.listAccounts()).toHaveLength(1);
  });

  it("validates a non-allowlisted companion URL down to the default", async () => {
    const keyring = newKeyring();
    const account = await keyring.createAccount({ ...accountOpts, companionUrl: "https://evil.example" });
    expect(account.options.companionUrl).toBe(DEFAULT_COMPANION_URL);
  });

  it("is idempotent per Safe address", async () => {
    const keyring = newKeyring();
    const first = await keyring.createAccount(accountOpts);
    const second = await keyring.createAccount(accountOpts);
    expect(second.id).toBe(first.id);
    expect(await keyring.listAccounts()).toHaveLength(1);
  });

  it("rejects missing Safe fields", async () => {
    const keyring = newKeyring();
    await expect(keyring.createAccount({ safeAddress: SAFE, owners: [], threshold: 1, chainIds: [1] })).rejects.toThrow(
      /owners/,
    );
  });
});

describe("SafeKeyring request lifecycle", () => {
  it("submitRequest is always async and redirects to the account companion", async () => {
    const keyring = newKeyring();
    const account = await keyring.createAccount(accountOpts);
    const response = await keyring.submitRequest(dappRequest("req1", account.id));

    expect(response.pending).toBe(true);
    const redirect = (response as { redirect: { url: string } }).redirect;
    expect(redirect.url).toContain("http://localhost:3000/#/safe/");
    expect(redirect.url).toContain("rid=req1");
    expect(await keyring.listRequests()).toHaveLength(1);
    expect(await keyring.getRequest("req1")).toBeTruthy();
  });

  it("approveRequest emits RequestApproved with the companion result and clears the request", async () => {
    const keyring = newKeyring();
    const account = await keyring.createAccount(accountOpts);
    await keyring.submitRequest(dappRequest("req1", account.id));
    emitMock.mockClear();

    await keyring.approveRequest("req1", { result: "0xSIGNATURE" });

    expect(emitMock).toHaveBeenCalledWith(expect.anything(), KeyringEvent.RequestApproved, {
      id: "req1",
      result: "0xSIGNATURE",
    });
    expect(await keyring.listRequests()).toHaveLength(0);
  });

  it("rejectRequest emits RequestRejected and clears the request", async () => {
    const keyring = newKeyring();
    const account = await keyring.createAccount(accountOpts);
    await keyring.submitRequest(dappRequest("req2", account.id));
    emitMock.mockClear();

    await keyring.rejectRequest("req2");

    expect(emitMock).toHaveBeenCalledWith(expect.anything(), KeyringEvent.RequestRejected, { id: "req2" });
    expect(await keyring.listRequests()).toHaveLength(0);
  });

  it("throws when approving an unknown request", async () => {
    const keyring = newKeyring();
    await expect(keyring.approveRequest("missing", { result: "0x" })).rejects.toThrow(/not found/);
  });
});
