"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { mainnet } from "wagmi/chains";
import Modal from "./Modal";
import { useWagmiConfigContext, isMainnetRpcConfigured } from "../provider/WagmiConfigProvider";

// viem's bundled default; setting the field back to this turns ENS off (the app never
// sends traffic to an RPC the user didn't explicitly choose)
const VIEM_MAINNET_DEFAULT_RPC = mainnet.rpcUrls.default.http[0];

export const PUBLIC_MAINNET_RPC = "https://ethereum-rpc.publicnode.com";

/**
 * Focused dialog for choosing the Ethereum mainnet RPC that powers ENS resolution.
 *
 * Reachable from the "ENS unavailable" hint in address inputs and the ens status line
 * in the networks modal. Offers paste-your-own or an explicitly labeled public RPC.
 */
export default function MainnetRpcModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { configChains, setConfigChains } = useWagmiConfigContext();
  const { chain } = useAccount();
  const configured = isMainnetRpcConfigured(configChains);
  const currentUrl = configChains.find((c) => c.id === mainnet.id)?.rpcUrls?.default?.http?.[0];
  const walletOnMainnet = chain?.id === mainnet.id;

  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUrl(configured && currentUrl ? currentUrl : "");
      setError(null);
    }
  }, [open, configured, currentUrl]);

  function applyUrl(nextUrl: string) {
    setConfigChains((prev) =>
      prev.map((c) => (c.id === mainnet.id ? { ...c, rpcUrls: { ...c.rpcUrls, default: { http: [nextUrl] } } } : c)),
    );
    onClose();
  }

  function handleSave() {
    if (!/^https?:\/\/.+/.test(url)) {
      setError("RPC URL must start with http(s)");
      return;
    }
    applyUrl(url.trim());
  }

  return (
    <Modal open={open} onClose={onClose} showCloseButton={false} testid="mainnet-rpc-modal">
      <h2 className="text-lg font-bold">ENS / Mainnet RPC</h2>
      <div className="space-y-2 font-mono text-xs opacity-70">
        <p>
          ens names resolve on ethereum mainnet. localsafe never picks a mainnet rpc for you — reads go through your
          connected wallet (when it is on mainnet) or an rpc you choose here.
        </p>
        <p data-testid="mainnet-rpc-status">
          status:{" "}
          {configured
            ? "ens on — custom rpc configured"
            : walletOnMainnet
              ? "ens on — via connected wallet"
              : "ens off — no mainnet rpc"}
        </p>
      </div>

      <fieldset className="fieldset">
        <legend className="fieldset-legend">Mainnet RPC URL</legend>
        <input
          className={`input input-bordered w-full font-mono ${error ? "input-error" : ""}`}
          placeholder="https://..."
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          data-testid="mainnet-rpc-input"
        />
        {error && <p className="text-error mt-1 text-xs">{error}</p>}
        <button
          type="button"
          className="link mt-2 self-start font-mono text-xs"
          onClick={() => {
            setUrl(PUBLIC_MAINNET_RPC);
            setError(null);
          }}
          data-testid="mainnet-rpc-use-public"
        >
          use {PUBLIC_MAINNET_RPC}
        </button>
        <p className="mt-1 font-mono text-xs opacity-60">third-party service — it can see the addresses you look up</p>
      </fieldset>

      <div className="flex justify-end gap-2">
        {configured && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => applyUrl(VIEM_MAINNET_DEFAULT_RPC)}
            title="Remove the custom RPC; ENS turns off unless your wallet is on mainnet"
            data-testid="mainnet-rpc-clear"
          >
            Clear
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onClose} data-testid="mainnet-rpc-cancel">
          Cancel
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleSave} data-testid="mainnet-rpc-save">
          Save
        </button>
      </div>
    </Modal>
  );
}
