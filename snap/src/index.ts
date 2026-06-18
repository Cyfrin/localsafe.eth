import { handleKeyringRequest } from "@metamask/keyring-snap-sdk";
import type { OnKeyringRequestHandler } from "@metamask/snaps-sdk";

import { SafeKeyring } from "./keyring";
import { loadState } from "./state";

let keyringPromise: Promise<SafeKeyring> | undefined;

async function getKeyring(): Promise<SafeKeyring> {
  if (!keyringPromise) {
    keyringPromise = loadState().then((state) => new SafeKeyring(state));
  }
  return keyringPromise;
}

/**
 * Account Management API entry point. MetaMask (and the allowlisted companion,
 * via `wallet_invokeKeyring`) routes keyring_* requests here; the manifest's
 * `endowment:keyring.allowedOrigins` restricts which dapp origins may reach it.
 */
export const onKeyringRequest: OnKeyringRequestHandler = async ({ request }) => {
  const keyring = await getKeyring();
  return (await handleKeyringRequest(keyring, request)) ?? null;
};
