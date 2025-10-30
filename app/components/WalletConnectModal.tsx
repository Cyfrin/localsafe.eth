"use client";

import { useState, useEffect } from "react";
import { useWalletConnect } from "../provider/WalletConnectProvider";
import { useAccount } from "wagmi";
import { useParams } from "react-router-dom";

type WalletConnectModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function WalletConnectModal({ open, onClose }: WalletConnectModalProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [pairingCode, setPairingCode] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const { address: safeAddress } = useParams<{ address: string }>();
  const { chain } = useAccount();

  const {
    projectId,
    setProjectId,
    isInitialized,
    sessions,
    pendingProposal,
    pair,
    approveSession,
    rejectSession,
    disconnectSession,
    error,
  } = useWalletConnect();

  const isApiKeySet = !!projectId;

  useEffect(() => {
    if (open) {
      setPairingCode("");
    }
  }, [open]);

  useEffect(() => {
    if (pendingProposal && activeTab !== 1) {
      setActiveTab(1);
    }
  }, [pendingProposal, activeTab]);

  const handleSubmit = async () => {
    if (pairingCode.trim() !== "") {
      try {
        await pair(pairingCode.trim());
        setPairingCode("");
      } catch (e) {
        console.error("Failed to pair:", e);
      }
    }
  };

  const handleApproveSession = async () => {
    if (!pendingProposal) return;
    if (!safeAddress) {
      alert("Please navigate to a Safe before approving a session");
      return;
    }
    if (!chain) {
      alert("Please connect your wallet first");
      return;
    }

    try {
      const proposal = pendingProposal as any;
      console.log("🟢 Full proposal:", proposal);

      const requiredNamespaces = proposal.requiredNamespaces || {};
      const optionalNamespaces = proposal.optionalNamespaces || {};

      console.log("🟢 Required namespaces:", requiredNamespaces);
      console.log("🟢 Optional namespaces:", optionalNamespaces);
      console.log("🟢 Safe address being used:", safeAddress);
      console.log("🟢 Chain ID:", chain?.id);

      const namespaces: Record<string, any> = {};

      // Process required namespaces
      Object.entries(requiredNamespaces).forEach(([key, value]: [string, any]) => {
        const chains = value.chains || [];
        const methods = value.methods || [];
        const events = value.events || [];

        // Build accounts array - ensure proper format
        const accounts = chains.map((chainId: string) => `${chainId}:${safeAddress}`);

        console.log(`🟢 Namespace ${key} accounts:`, accounts);

        namespaces[key] = {
          accounts,
          methods,
          events,
          chains,
        };
      });

      // Process optional namespaces if any
      Object.entries(optionalNamespaces).forEach(([key, value]: [string, any]) => {
        if (namespaces[key]) {
          // Merge with existing namespace
          const chains = value.chains || [];
          const additionalAccounts = chains
            .filter((c: string) => !namespaces[key].chains.includes(c))
            .map((chainId: string) => `${chainId}:${safeAddress}`);

          namespaces[key].accounts = [...namespaces[key].accounts, ...additionalAccounts];
          namespaces[key].chains = [...namespaces[key].chains, ...chains];
          namespaces[key].methods = [...new Set([...namespaces[key].methods, ...(value.methods || [])])];
          namespaces[key].events = [...new Set([...namespaces[key].events, ...(value.events || [])])];
        } else {
          // Create new namespace entry
          const chains = value.chains || [];
          const accounts = chains.map((chainId: string) => `${chainId}:${safeAddress}`);

          namespaces[key] = {
            accounts,
            methods: value.methods || [],
            events: value.events || [],
            chains,
          };
        }
      });

      console.log("Constructed namespaces:", namespaces);

      await approveSession(namespaces);
    } catch (e) {
      console.error("Failed to approve session:", e);
      alert(`Failed to approve session: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleRejectSession = async () => {
    try {
      await rejectSession();
    } catch (e) {
      console.error("Failed to reject session:", e);
    }
  };

  const handleDisconnectSession = async (topic: string) => {
    try {
      await disconnectSession(topic);
    } catch (e) {
      console.error("Failed to disconnect session:", e);
    }
  };

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKeyInput.trim() !== "") {
      setProjectId(apiKeyInput.trim());
      setApiKeyInput("");
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPairingCode(text);
    } catch (err) {
      console.error("Failed to read clipboard:", err);
    }
  };

  if (!open) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">WalletConnect</h3>
          <button
            className="btn btn-ghost btn-sm btn-circle"
            onClick={onClose}
            data-testid="wc-modal-close-btn"
          >
            ✕
          </button>
        </div>

        {!isApiKeySet ? (
          <>
            <div className="alert alert-warning mb-4">
              <span>
                No WalletConnect Project ID is configured. You can use the default shared project ID
                or get your own from{" "}
                <a
                  href="https://cloud.walletconnect.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  WalletConnect Cloud
                </a>
              </span>
            </div>
            <form onSubmit={handleSaveApiKey}>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">WalletConnect Project ID (Optional)</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Enter your custom project ID"
                  data-testid="wc-api-key-input"
                />
                <label className="label">
                  <span className="label-text-alt">Leave empty to use the default shared project ID</span>
                </label>
              </div>
              <div className="modal-action">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!apiKeyInput.trim()}
                  data-testid="wc-save-api-key-btn"
                >
                  Save Custom Project ID
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div role="tablist" className="tabs tabs-boxed mb-4 gap-2 p-1">
              <button
                role="tab"
                type="button"
                className={`tab gap-2 flex-1 ${activeTab === 0 ? "tab-active" : ""}`}
                onClick={() => setActiveTab(0)}
                data-testid="wc-connect-tab"
              >
                Connect
              </button>
              <button
                role="tab"
                type="button"
                className={`tab gap-2 flex-1 ${activeTab === 1 ? "tab-active" : ""}`}
                onClick={() => setActiveTab(1)}
                data-testid="wc-proposals-tab"
              >
                Proposals
                {pendingProposal && (
                  <div className="badge badge-error badge-sm">1</div>
                )}
              </button>
              <button
                role="tab"
                type="button"
                className={`tab gap-2 flex-1 ${activeTab === 2 ? "tab-active" : ""}`}
                onClick={() => setActiveTab(2)}
                data-testid="wc-sessions-tab"
              >
                Sessions
                {sessions.length > 0 && (
                  <div className="badge badge-primary badge-sm">
                    {sessions.length}
                  </div>
                )}
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {/* Connect Tab */}
              {activeTab === 0 && (
                <div data-testid="wc-connect-panel">
                  <p className="mb-4">
                    Paste the pairing code below to connect to your Safe via WalletConnect
                  </p>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Pairing code</span>
                    </label>
                    <div className="join w-full">
                      <input
                        type="text"
                        className="input input-bordered join-item flex-1"
                        value={pairingCode}
                        onChange={(e) => setPairingCode(e.target.value)}
                        placeholder="wc:your-link-here"
                        data-testid="wc-pairing-code-input"
                      />
                      <button
                        className="btn btn-success join-item"
                        onClick={handlePaste}
                        data-testid="wc-paste-btn"
                      >
                        Paste
                      </button>
                    </div>
                  </div>
                  {error && (
                    <div className="alert alert-error mt-4">
                      <span>{error.message}</span>
                    </div>
                  )}
                  <p className="mt-4 text-sm text-gray-500">
                    No dApps are connected yet.
                  </p>
                </div>
              )}

              {/* Proposals Tab */}
              {activeTab === 1 && (
                <div data-testid="wc-proposals-panel">
                  {pendingProposal ? (
                    <div className="space-y-4">
                      <div className="flex flex-col items-center">
                        <div className="w-16 h-16 bg-primary rounded-lg mb-4 flex items-center justify-center">
                          {(pendingProposal as any).proposer?.metadata?.icons?.[0] ? (
                            <img
                              src={(pendingProposal as any).proposer.metadata.icons[0]}
                              alt={(pendingProposal as any).proposer.metadata.name}
                              className="w-full h-full rounded-lg"
                            />
                          ) : (
                            <span className="text-2xl">🔗</span>
                          )}
                        </div>
                        <h4 className="font-bold text-xl mb-2">
                          {(pendingProposal as any).proposer?.metadata?.name || "Unknown dApp"} wants to connect
                        </h4>
                        <p className="text-center mb-2">
                          {(pendingProposal as any).proposer?.metadata?.url || ""}
                        </p>
                        <p className="text-sm text-gray-500 text-center mb-4">
                          {(pendingProposal as any).proposer?.metadata?.description || ""}
                        </p>
                      </div>

                      {!safeAddress && (
                        <div className="alert alert-info">
                          <span>
                            Please navigate to a Safe before approving this connection
                          </span>
                        </div>
                      )}

                      <div className="bg-base-200 rounded-box p-4">
                        <h5 className="font-semibold mb-2">Requested Permissions:</h5>
                        {Object.entries((pendingProposal as any).requiredNamespaces || {}).map(
                          ([namespace, details]: [string, any]) => (
                            <div key={namespace} className="mb-2">
                              <p className="font-medium">{namespace}:</p>
                              <div className="pl-4 text-sm">
                                {details.chains && (
                                  <p>Chains: {details.chains.join(", ")}</p>
                                )}
                                <p>Methods: {details.methods.join(", ")}</p>
                                <p>Events: {details.events.join(", ")}</p>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  ) : (
                    <p>No pending connection proposals.</p>
                  )}
                </div>
              )}

              {/* Sessions Tab */}
              {activeTab === 2 && (
                <div data-testid="wc-sessions-panel">
                  {sessions.length > 0 ? (
                    <div className="space-y-2">
                      {sessions.map((session) => (
                        <div
                          key={session.topic}
                          className="card bg-base-200"
                          data-testid={`wc-session-${session.topic}`}
                        >
                          <div className="card-body p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {session.peer.metadata.icons?.[0] && (
                                  <img
                                    src={session.peer.metadata.icons[0]}
                                    alt={session.peer.metadata.name}
                                    className="w-10 h-10 rounded"
                                  />
                                )}
                                <div>
                                  <h4 className="font-semibold">
                                    {session.peer.metadata.name}
                                  </h4>
                                  <p className="text-sm text-gray-500">
                                    {session.peer.metadata.url}
                                  </p>
                                </div>
                              </div>
                              <button
                                className="btn btn-error btn-outline btn-sm"
                                onClick={() => handleDisconnectSession(session.topic)}
                                data-testid={`wc-disconnect-${session.topic}`}
                              >
                                Disconnect
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>No active sessions.</p>
                  )}
                </div>
              )}
            </div>

            <div className="modal-action">
              <button className="btn btn-ghost" onClick={onClose}>
                Close
              </button>

              {activeTab === 0 && (
                <button
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={!pairingCode.trim()}
                  data-testid="wc-connect-btn"
                >
                  Connect
                </button>
              )}

              {activeTab === 1 && pendingProposal && (
                <>
                  <button
                    className="btn btn-error btn-outline"
                    onClick={handleRejectSession}
                    data-testid="wc-reject-btn"
                  >
                    Reject
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={handleApproveSession}
                    disabled={!safeAddress}
                    data-testid="wc-approve-btn"
                  >
                    Approve
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  );
}
