import type { Keyring, KeyringAccount, KeyringRequest, KeyringResponse } from "@metamask/keyring-api";
import { EthAccountType, EthMethod, EthScope, KeyringEvent } from "@metamask/keyring-api";
import { emitSnapKeyringEvent } from "@metamask/keyring-snap-sdk";
import type { Json } from "@metamask/utils";
import { v4 as uuid } from "uuid";

import type { KeyringState, SafeAccountOptions } from "./state";
import { resolveCompanionUrl, saveState } from "./state";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * A keyring that exposes a Safe multisig as a MetaMask account.
 *
 * The keyring holds no private key. Every request is forwarded to the LocalSafe
 * companion app through the asynchronous redirect flow; the companion collects
 * owner signatures, produces the result (an EIP-1271 signature), and resolves
 * the request via {@link SafeKeyring.approveRequest}.
 */
export class SafeKeyring implements Keyring {
  #state: KeyringState;

  constructor(state: KeyringState) {
    this.#state = state;
  }

  async listAccounts(): Promise<KeyringAccount[]> {
    return Object.values(this.#state.accounts);
  }

  async getAccount(id: string): Promise<KeyringAccount | undefined> {
    return this.#state.accounts[id];
  }

  async createAccount(options?: Record<string, Json>): Promise<KeyringAccount> {
    const safe = (options ?? {}) as Partial<SafeAccountOptions> & Record<string, Json>;
    assert(
      typeof safe.safeAddress === "string" && safe.safeAddress.startsWith("0x"),
      "createAccount: a `safeAddress` (0x…) is required",
    );
    assert(
      Array.isArray(safe.owners) && safe.owners.length > 0,
      "createAccount: a non-empty `owners` array is required",
    );
    assert(
      typeof safe.threshold === "number" && safe.threshold > 0,
      "createAccount: a positive `threshold` is required",
    );
    assert(
      Array.isArray(safe.chainIds) && safe.chainIds.length > 0,
      "createAccount: a non-empty `chainIds` array is required",
    );

    const address = safe.safeAddress;
    const existing = Object.values(this.#state.accounts).find(
      (account) => account.address.toLowerCase() === address.toLowerCase(),
    );
    if (existing) {
      return existing;
    }

    const accountOptions: Record<string, Json> = {
      safeAddress: address,
      owners: safe.owners,
      threshold: safe.threshold,
      chainIds: safe.chainIds,
      companionUrl: resolveCompanionUrl(safe.companionUrl),
      exportable: false,
    };
    // Re-emit MetaMask-internal options if the client passed them.
    const metamask = (options as Record<string, unknown> | undefined)?.metamask;
    if (metamask !== undefined) {
      accountOptions.metamask = metamask as Json;
    }

    const account: KeyringAccount = {
      id: uuid(),
      address,
      type: EthAccountType.Eoa,
      // A Safe produces EIP-1271 signatures, so advertise only the signing
      // methods the companion can fulfil. Transaction methods are intentionally
      // omitted: a Safe cannot produce a raw signed transaction.
      methods: [EthMethod.PersonalSign, EthMethod.SignTypedDataV4],
      // EOA-typed accounts must be scoped to `eip155:0` (all EVM chains); the
      // active chain is resolved per request by the companion.
      scopes: [EthScope.Eoa],
      options: accountOptions,
    };

    await emitSnapKeyringEvent(snap, KeyringEvent.AccountCreated, {
      account,
      accountNameSuggestion: "LocalSafe",
    });

    this.#state.accounts[account.id] = account;
    await saveState(this.#state);
    return account;
  }

  async filterAccountChains(id: string, chains: string[]): Promise<string[]> {
    const account = this.#state.accounts[id];
    assert(account, `filterAccountChains: account '${id}' not found`);
    const raw = account.options.chainIds;
    const chainIds = Array.isArray(raw) ? (raw as number[]) : [];
    const supported = new Set(chainIds.map((chainId) => `eip155:${chainId}`));
    return chains.filter((chain) => supported.has(chain));
  }

  async updateAccount(account: KeyringAccount): Promise<void> {
    const current = this.#state.accounts[account.id];
    if (!current) {
      return;
    }
    const updated: KeyringAccount = {
      ...current,
      ...account,
      options: { ...current.options, ...account.options },
    };
    this.#state.accounts[account.id] = updated;
    await saveState(this.#state);
    await emitSnapKeyringEvent(snap, KeyringEvent.AccountUpdated, {
      account: updated,
    });
  }

  async deleteAccount(id: string): Promise<void> {
    if (!this.#state.accounts[id]) {
      return;
    }
    delete this.#state.accounts[id];
    await saveState(this.#state);
    await emitSnapKeyringEvent(snap, KeyringEvent.AccountDeleted, { id });
  }

  async listRequests(): Promise<KeyringRequest[]> {
    return Object.values(this.#state.pendingRequests);
  }

  async getRequest(id: string): Promise<KeyringRequest | undefined> {
    return this.#state.pendingRequests[id];
  }

  async submitRequest(request: KeyringRequest): Promise<KeyringResponse> {
    // A Safe can never sign synchronously: signatures are collected (and the
    // result produced) in the companion app, then returned via approveRequest.
    this.#state.pendingRequests[request.id] = request;
    await saveState(this.#state);

    const account = this.#state.accounts[request.account];
    const address = account?.address ?? "";
    const base = resolveCompanionUrl(account?.options.companionUrl);

    return {
      pending: true,
      redirect: {
        message: "Continue in LocalSafe to finish signing.",
        url: `${base}/#/safe/${address}/snap-request?rid=${request.id}`,
      },
    };
  }

  async approveRequest(id: string, data?: Record<string, Json>): Promise<void> {
    const request = this.#state.pendingRequests[id];
    assert(request, `approveRequest: request '${id}' not found`);
    const result = data?.result ?? null;
    delete this.#state.pendingRequests[id];
    await saveState(this.#state);
    await emitSnapKeyringEvent(snap, KeyringEvent.RequestApproved, {
      id,
      result,
    });
  }

  async rejectRequest(id: string): Promise<void> {
    const request = this.#state.pendingRequests[id];
    assert(request, `rejectRequest: request '${id}' not found`);
    delete this.#state.pendingRequests[id];
    await saveState(this.#state);
    await emitSnapKeyringEvent(snap, KeyringEvent.RequestRejected, { id });
  }
}
