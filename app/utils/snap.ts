// Zero-dependency MetaMask Snap (Keyring API) RPC helpers for the companion.
//
// All calls go through the injected MetaMask provider via `wallet_invokeSnap`,
// so the companion takes on no `@metamask/*` dependency. The Snap's manifest
// `allowedOrigins` restricts which origins may call these methods.

/** The LocalSafe Snap id. Dev serves from localhost; prod points at npm. */
export const SNAP_ID = process.env.NEXT_PUBLIC_SNAP_ID ?? "local:http://localhost:8088";

/**
 * A `local:` snap id is a dev build that only MetaMask Flask will install. When
 * the snap is published (`npm:…`) regular MetaMask can install it, so the Flask
 * requirement no longer applies.
 */
export const SNAP_IS_LOCAL = SNAP_ID.startsWith("local:");

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

/**
 * True when the injected provider is MetaMask Flask (the developer build).
 * Flask reports a `web3_clientVersion` containing "flask". Returns false when no
 * provider is injected or the call fails, so callers treat "unknown" as "not
 * Flask" and fall back to the manual override.
 */
export async function isFlaskInstalled(): Promise<boolean> {
  try {
    const provider = (globalThis as { ethereum?: Eip1193Provider }).ethereum;
    if (!provider) return false;
    const version = await provider.request({ method: "web3_clientVersion" });
    return typeof version === "string" && version.toLowerCase().includes("flask");
  } catch {
    return false;
  }
}

function getProvider(): Eip1193Provider {
  const provider = (globalThis as { ethereum?: Eip1193Provider }).ethereum;
  if (!provider) {
    throw new Error("MetaMask not found. Install MetaMask Flask to use the LocalSafe snap.");
  }
  return provider;
}

/** Install/connect the LocalSafe Snap (prompts the user in MetaMask). */
export async function connectSnap(): Promise<void> {
  await getProvider().request({
    method: "wallet_requestSnaps",
    params: { [SNAP_ID]: {} },
  });
}

/** Returns the installed Snap record, or undefined if it isn't installed. */
export async function getInstalledSnap(): Promise<unknown> {
  const snaps = (await getProvider().request({ method: "wallet_getSnaps" })) as Record<string, unknown> | undefined;
  return snaps?.[SNAP_ID];
}

async function invokeKeyring<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
  // Dapp -> keyring calls use `wallet_invokeKeyring`, which MetaMask routes to
  // the snap's onKeyringRequest (gated by the manifest's allowedOrigins).
  // `wallet_invokeSnap` would instead hit onRpcRequest.
  return (await getProvider().request({
    method: "wallet_invokeKeyring",
    params: { snapId: SNAP_ID, request: params ? { method, params } : { method } },
  })) as T;
}

/** Register a Safe as a MetaMask account via the Snap's keyring. */
export async function createSafeKeyringAccount(options: {
  safeAddress: string;
  owners: string[];
  threshold: number;
  chainIds: number[];
  companionUrl: string;
}): Promise<unknown> {
  return invokeKeyring("keyring_createAccount", { options });
}

export async function listKeyringAccounts(): Promise<unknown[]> {
  return invokeKeyring<unknown[]>("keyring_listAccounts");
}

/** True if any keyring account matches `safeAddress` (case-insensitive). Snap errors -> false. */
export async function isSafeInKeyring(safeAddress: string): Promise<boolean> {
  try {
    const accounts = await listKeyringAccounts();
    const target = safeAddress.toLowerCase();
    return accounts.some(
      (a) =>
        typeof (a as { address?: unknown }).address === "string" &&
        (a as { address: string }).address.toLowerCase() === target,
    );
  } catch {
    return false;
  }
}

/**
 * Detects MetaMask's "internal account" guards that fire once the Safe is
 * registered as a snap account, because MetaMask then treats the Safe as one of
 * the user's own accounts. Two variants:
 *  - execTransaction: "External transactions to internal accounts cannot include data"
 *  - signing:         "External signature requests cannot use internal accounts as the verifying contract"
 * Both block the owner from acting on the Safe from that same MetaMask.
 */
export function isSnapInternalAccountError(err: unknown): boolean {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && cur; depth++) {
    if (cur instanceof Error) parts.push(cur.message);
    const o = cur as { details?: unknown; shortMessage?: unknown; cause?: unknown };
    if (typeof o.details === "string") parts.push(o.details);
    if (typeof o.shortMessage === "string") parts.push(o.shortMessage);
    cur = o.cause;
  }
  const text = parts.join(" ").toLowerCase();
  return (
    text.includes("internal account") && (text.includes("cannot include data") || text.includes("verifying contract"))
  );
}

/** Remove this Safe from MetaMask (keyring_deleteAccount). Returns true if it was registered. */
export async function removeSafeFromKeyring(safeAddress: string): Promise<boolean> {
  const accounts = await listKeyringAccounts();
  const target = safeAddress.toLowerCase();
  const match = accounts.find(
    (a) =>
      typeof (a as { address?: unknown }).address === "string" &&
      (a as { address: string }).address.toLowerCase() === target,
  ) as { id?: unknown } | undefined;
  if (!match || typeof match.id !== "string") return false;
  await invokeKeyring("keyring_deleteAccount", { id: match.id });
  return true;
}

/** A pending dapp request the Snap stashed before redirecting to the companion. */
export type KeyringDappRequest = {
  id: string;
  scope: string;
  account: string;
  origin: string;
  request: { method: string; params?: unknown };
};

export async function getKeyringRequest(id: string): Promise<KeyringDappRequest> {
  return invokeKeyring<KeyringDappRequest>("keyring_getRequest", { id });
}

/** Resolve the dapp's original request with a result (an EIP-1271 signature). */
export async function approveKeyringRequest(id: string, result: unknown): Promise<void> {
  await invokeKeyring("keyring_approveRequest", { id, data: { result } });
}

export async function rejectKeyringRequest(id: string): Promise<void> {
  await invokeKeyring("keyring_rejectRequest", { id });
}
