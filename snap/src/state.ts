import type { KeyringAccount, KeyringRequest } from "@metamask/keyring-api";
import type { Json } from "@metamask/utils";

/** Default companion the Snap redirects to when an account has no stored one. */
export const DEFAULT_COMPANION_URL = "https://localsafe.cyfrin.io";

/**
 * Origins allowed to act as the companion (mirrors the manifest's
 * `endowment:keyring` allowedOrigins). The redirect target is validated against
 * this list so a request can only ever send the user to a trusted companion.
 */
export const ALLOWED_COMPANION_ORIGINS = [
  "https://localsafe.cyfrin.io",
  "https://localsafe.eth.limo",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:8000",
];

/** Validate a companion URL, returning its origin or the default. */
export function resolveCompanionUrl(url: unknown): string {
  if (typeof url === "string") {
    try {
      const { origin } = new URL(url);
      if (ALLOWED_COMPANION_ORIGINS.includes(origin)) {
        return origin;
      }
    } catch {
      // fall through to default
    }
  }
  return DEFAULT_COMPANION_URL;
}

/** Safe-specific data stored in a keyring account's `options`. */
export type SafeAccountOptions = {
  safeAddress: string;
  owners: string[];
  threshold: number;
  chainIds: number[];
  companionUrl?: string;
};

/** Everything the Snap persists via `snap_manageState`. */
export type KeyringState = {
  accounts: Record<string, KeyringAccount>;
  pendingRequests: Record<string, KeyringRequest>;
};

function emptyState(): KeyringState {
  return { accounts: {}, pendingRequests: {} };
}

export async function loadState(): Promise<KeyringState> {
  const stored = (await snap.request({
    method: "snap_manageState",
    params: { operation: "get" },
  })) as Partial<KeyringState> | null;

  if (!stored) {
    return emptyState();
  }
  return {
    accounts: stored.accounts ?? {},
    pendingRequests: stored.pendingRequests ?? {},
  };
}

export async function saveState(state: KeyringState): Promise<void> {
  await snap.request({
    method: "snap_manageState",
    params: {
      operation: "update",
      newState: state as unknown as Record<string, Json>,
    },
  });
}
