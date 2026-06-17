"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, usePublicClient } from "wagmi";
import useSafe from "@/app/hooks/useSafe";
import { useSafeMessageContext } from "@/app/provider/SafeMessageProvider";
import { useToast } from "@/app/hooks/useToast";
import AppSection from "@/app/components/AppSection";
import AppCard from "@/app/components/AppCard";
import DataPreview from "@/app/components/DataPreview";
import { createSafeAppsHandlers, createSafeAppsHost } from "@/app/vendor/safe-apps";
import type {
  BaseTransaction,
  EIP712TypedData,
  OffChainSignMessageResponse,
  SafeAppsMethodContext,
  SendTransactionsResponse,
} from "@/app/vendor/safe-apps";

interface LoadedApp {
  url: string;
  origin: string;
  name?: string;
  iconUrl?: string;
}

/** A dApp request awaiting the user's explicit approval. */
type PendingApproval =
  | { kind: "tx"; txs: BaseTransaction[]; resolve: (r: SendTransactionsResponse) => void; reject: (e: Error) => void }
  | {
      kind: "message";
      message: string;
      resolve: (r: OffChainSignMessageResponse) => void;
      reject: (e: Error) => void;
    }
  | {
      kind: "typedMessage";
      typedData: EIP712TypedData;
      resolve: (r: OffChainSignMessageResponse) => void;
      reject: (e: Error) => void;
    };

const USER_REJECTED = "User rejected the request";

/**
 * Embedded dApp browser. Loads a Safe-App-compatible dApp in an iframe and acts as its
 * wallet over the Safe Apps postMessage protocol (no relay/QR), driving the vendored Safe
 * core. Transactions/messages are proposed into the normal Safe queue after explicit
 * approval; the dApp receives the native `safeTxHash`/`messageHash` and the session stays
 * open so the user can keep using it.
 */
export default function DAppBrowserClient({ safeAddress }: { safeAddress: `0x${string}` }) {
  const { chain, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const toast = useToast();
  const { safeInfo, isOwner, buildSafeTransaction, getSafeTransactionHash, kit } = useSafe(safeAddress);
  const { saveMessage } = useSafeMessageContext();

  const [urlInput, setUrlInput] = useState("");
  const [loadedApp, setLoadedApp] = useState<LoadedApp | null>(null);
  const [pending, setPending] = useState<PendingApproval | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectTimedOut, setConnectTimedOut] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const chainId = chain?.id ? String(chain.id) : undefined;

  // --- Method handlers wired to the Safe core, gated behind user approval ---

  const rpcRequest = useCallback(
    async (method: string, params: unknown[]): Promise<unknown> => {
      if (!publicClient) throw new Error("No RPC client for the active chain");
      const request = publicClient.request as (args: { method: string; params: unknown[] }) => Promise<unknown>;
      return request({ method, params });
    },
    [publicClient],
  );

  const proposeTransactions = useCallback(
    (txs: BaseTransaction[]): Promise<SendTransactionsResponse> =>
      new Promise((resolve, reject) => setPending({ kind: "tx", txs, resolve, reject })),
    [],
  );

  const proposeMessage = useCallback(
    (message: string): Promise<OffChainSignMessageResponse> =>
      new Promise((resolve, reject) => setPending({ kind: "message", message, resolve, reject })),
    [],
  );

  const proposeTypedMessage = useCallback(
    (typedData: EIP712TypedData): Promise<OffChainSignMessageResponse> =>
      new Promise((resolve, reject) => setPending({ kind: "typedMessage", typedData, resolve, reject })),
    [],
  );

  // --- Attach the Safe Apps host once the dApp, Safe info, and chain are all ready ---

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !loadedApp || !safeInfo || !chain) return;

    const ctx: SafeAppsMethodContext = {
      safeInfo: {
        safeAddress,
        chainId: chain.id,
        threshold: safeInfo.threshold,
        owners: safeInfo.owners,
        isReadOnly: !isOwner,
        nonce: safeInfo.nonce,
        version: safeInfo.version,
      },
      chain: {
        id: chain.id,
        name: chain.name,
        nativeCurrency: chain.nativeCurrency,
        blockExplorerUrl: chain.blockExplorers?.default.url,
        blockExplorerApiUrl: chain.blockExplorers?.default.apiUrl,
      },
      appOrigin: loadedApp.origin,
      rpcRequest,
      proposeTransactions,
      proposeMessage,
      proposeTypedMessage,
    };

    const handlers = createSafeAppsHandlers(ctx);
    return createSafeAppsHost({
      iframe,
      allowedOrigin: loadedApp.origin,
      // Mark connected on the dApp's first handshake call so we can distinguish a working
      // Safe App from one the browser refused to embed (CSP) or that isn't a Safe App.
      handlers: {
        ...handlers,
        getSafeInfo: () => {
          setConnected(true);
          return handlers.getSafeInfo();
        },
      },
    });
  }, [
    loadedApp,
    safeInfo,
    chain,
    isOwner,
    safeAddress,
    rpcRequest,
    proposeTransactions,
    proposeMessage,
    proposeTypedMessage,
  ]);

  // --- Flag dApps that never complete the Safe Apps handshake (CSP frame-ancestors block,
  //     X-Frame-Options, or simply not a Safe App). There is no reliable load-error event
  //     for a CSP-blocked iframe, so fall back to a connect timeout. ---

  useEffect(() => {
    if (!loadedApp) return;
    setConnected(false);
    setConnectTimedOut(false);
    const timer = setTimeout(() => setConnectTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [loadedApp]);

  // --- Load a dApp URL (best-effort manifest fetch for name/icon) ---

  const handleLoad = useCallback(async () => {
    let parsed: URL;
    try {
      parsed = new URL(urlInput.trim());
    } catch {
      toast.error("Enter a valid https:// URL");
      return;
    }
    if (parsed.protocol !== "https:") {
      toast.error("Only https:// dApps can be loaded");
      return;
    }

    const app: LoadedApp = { url: parsed.href, origin: parsed.origin };
    try {
      const res = await fetch(`${parsed.origin}/manifest.json`, { mode: "cors" });
      if (res.ok) {
        const manifest = (await res.json()) as { name?: string; iconPath?: string };
        app.name = manifest.name;
        if (manifest.iconPath) app.iconUrl = `${parsed.origin}/${manifest.iconPath.replace(/^\//, "")}`;
      }
    } catch {
      // No reachable Safe App manifest (CORS or missing). Still load; warn in the UI.
    }
    setLoadedApp(app);
  }, [urlInput, toast]);

  const closeApp = useCallback(() => {
    pending?.reject(new Error(USER_REJECTED));
    setPending(null);
    setLoadedApp(null);
  }, [pending]);

  // --- Approve / reject the pending request ---

  const approve = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === "tx") {
        const safeTx = await buildSafeTransaction(
          pending.txs.map((t) => ({ to: t.to, value: t.value, data: t.data, operation: 0 })),
        );
        if (!safeTx) throw new Error("Could not build the Safe transaction (is the Safe deployed and connected?)");
        const safeTxHash = await getSafeTransactionHash(safeTx);
        pending.resolve({ safeTxHash });
        toast.success("Transaction proposed — sign it from the queue below");
      } else {
        if (!kit) throw new Error("Safe is not connected");
        const messageData = pending.kind === "message" ? pending.message : pending.typedData;
        const safeMessage = await kit.createMessage(messageData);
        const messageHash = await kit.getSafeMessageHash(messageData);
        saveMessage(safeAddress, safeMessage, messageHash, chainId);
        pending.resolve({ messageHash });
        toast.success("Message proposed — sign it from the Safe dashboard");
      }
      setPending(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [pending, buildSafeTransaction, getSafeTransactionHash, kit, saveMessage, safeAddress, chainId, toast]);

  const reject = useCallback(() => {
    pending?.reject(new Error(USER_REJECTED));
    setPending(null);
  }, [pending]);

  const ready = isConnected && safeInfo?.deployed && !!chain;

  const sandbox = useMemo(
    () => "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads",
    [],
  );

  return (
    <AppSection testid="dapp-browser-section">
      <AppCard title="dApp Browser" testid="dapp-browser-card">
        <p className="mb-3 text-sm text-gray-500">
          Connect your Safe to a dApp with no WalletConnect relay — load it here and approve requests directly. Works
          with dApps built on wagmi / RainbowKit / ConnectKit or any Safe App. If a dApp refuses to load or never
          connects, it likely blocks embedding or doesn&apos;t support Safe Apps — use WalletConnect instead.
        </p>

        {!ready ? (
          <div className="alert alert-info" data-testid="dapp-browser-not-ready">
            {!isConnected
              ? "Connect your wallet to use the dApp browser."
              : !chain
                ? "Select a network to continue."
                : "This Safe must be deployed on the selected network to connect dApps."}
          </div>
        ) : (
          <div className="flex gap-2" data-testid="dapp-browser-urlbar">
            <input
              type="url"
              className="input input-bordered w-full font-mono text-sm"
              placeholder="https://app.example.eth"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLoad()}
              data-testid="dapp-browser-url-input"
            />
            <button className="btn btn-primary" onClick={handleLoad} data-testid="dapp-browser-load-btn">
              Load
            </button>
            {loadedApp && (
              <button className="btn btn-ghost" onClick={closeApp} data-testid="dapp-browser-close-btn">
                Close
              </button>
            )}
          </div>
        )}
      </AppCard>

      {loadedApp && ready && (
        <div className="mt-4">
          <div className="bg-base-200 mb-2 flex items-center gap-2 px-2 py-1 font-mono text-xs">
            {loadedApp.iconUrl && <img src={loadedApp.iconUrl} alt="" className="h-4 w-4" />}
            <span className="font-bold">{loadedApp.name ?? "dApp"}</span>
            <span className="text-gray-500">{loadedApp.origin}</span>
            <span
              className={`ml-auto ${connected ? "text-success" : connectTimedOut ? "text-warning" : "text-gray-500"}`}
              data-testid="dapp-browser-conn-status"
            >
              {connected ? "● connected" : connectTimedOut ? "○ not connected" : "… connecting"}
            </span>
          </div>
          {connectTimedOut && !connected && (
            <div className="alert alert-warning mb-2 text-sm" data-testid="dapp-browser-blocked">
              <span>
                LocalSafe couldn&apos;t connect to <span className="font-mono">{loadedApp.origin}</span> — it likely
                blocks embedding (CSP <code>frame-ancestors</code>) or isn&apos;t a Safe App. Connect it via
                WalletConnect from the top bar instead.
              </span>
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={loadedApp.url}
            title={loadedApp.name ?? loadedApp.origin}
            className="border-base-content h-[70vh] w-full border-2"
            sandbox={sandbox}
            allow="clipboard-write; clipboard-read"
            data-testid="dapp-browser-iframe"
          />
        </div>
      )}

      {pending && (
        <div className="modal modal-open" data-testid="dapp-browser-approval">
          <div className="modal-box max-w-2xl">
            <h3 className="mb-2 text-lg font-bold">
              {pending.kind === "tx" ? "Confirm transaction request" : "Confirm signature request"}
            </h3>
            <p className="mb-4 text-sm text-gray-500">
              {loadedApp?.name ?? loadedApp?.origin} wants your Safe to{" "}
              {pending.kind === "tx" ? "send a transaction." : "sign a message."} It will be proposed to your Safe and
              still requires owner signatures.
            </p>

            {pending.kind === "tx" && (
              <div className="bg-base-200 rounded-box divide-base-100 max-h-80 divide-y overflow-y-auto">
                {pending.txs.map((tx, i) => (
                  <div key={i} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex justify-between">
                      <span className="font-semibold">To</span>
                      <span className="max-w-[60%] truncate font-mono text-sm">{tx.to}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold">Value (wei)</span>
                      <span className="font-mono text-sm">{tx.value || "0"}</span>
                    </div>
                    {tx.data && tx.data !== "0x" && <DataPreview value={tx.data} />}
                  </div>
                ))}
              </div>
            )}

            {pending.kind !== "tx" && (
              <pre className="bg-base-300 max-h-80 overflow-auto rounded p-3 text-xs break-all whitespace-pre-wrap">
                {pending.kind === "message" ? pending.message : JSON.stringify(pending.typedData, null, 2)}
              </pre>
            )}

            <div className="modal-action">
              <button
                className="btn btn-error btn-outline"
                onClick={reject}
                disabled={busy}
                data-testid="dapp-reject-btn"
              >
                Reject
              </button>
              <button className="btn btn-success" onClick={approve} disabled={busy} data-testid="dapp-approve-btn">
                {busy ? <span className="loading loading-spinner loading-sm" /> : "Propose to Safe"}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-gray-500">
        Proposed transactions and messages appear on your{" "}
        <Link className="link" to={`/safe/${safeAddress}`}>
          Safe dashboard
        </Link>{" "}
        for owner signatures.
      </p>
    </AppSection>
  );
}
