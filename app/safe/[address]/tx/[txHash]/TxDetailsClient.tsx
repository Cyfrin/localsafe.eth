"use client";

import AppSection from "@/app/components/AppSection";
import AppCard from "@/app/components/AppCard";
import EIP712DataDisplay from "@/app/components/EIP712DataDisplay";
import { useNavigate, Link } from "react-router-dom";
import useSafe from "@/app/hooks/useSafe";
import { useEffect, useState } from "react";
import { EthSafeTransaction, EthSafeSignature } from "@safe-global/protocol-kit";
import { useSafeTxContext } from "@/app/provider/SafeTxProvider";
import DataPreview from "@/app/components/DataPreview";
import { BroadcastModal } from "@/app/components/BroadcastModal";
import { useAccount } from "wagmi";
import { useToast } from "@/app/hooks/useToast";
import { calculateSafeTxHashes } from "@/app/utils/messageHashing";
import { useWalletConnect } from "@/app/provider/WalletConnectProvider";

/**
 * Maps chain IDs to chain names expected by Cyfrin tools
 */
function getChainNameForCyfrin(chainId: number): string {
  const chainMap: Record<number, string> = {
    1: "ethereum",
    11155111: "sepolia",
    42161: "arbitrum",
    421614: "arbitrum-sepolia",
    10: "optimism",
    11155420: "optimism-sepolia",
    8453: "base",
    84532: "base-sepolia",
    137: "polygon",
    80001: "polygon-mumbai",
    1101: "polygon-zkevm",
    100: "gnosis",
    56: "bsc",
    43114: "avalanche",
    5000: "mantle",
    59144: "linea",
    534352: "scroll",
    42220: "celo",
    324: "zksync",
    7777777: "zora",
    31337: "anvil",
  };
  return chainMap[chainId] || chainId.toString();
}

/**
 * TxDetailsClient component that displays the details of a specific transaction and allows signing and broadcasting.
 *
 * @returns {JSX.Element} The rendered TxDetailsClient component.
 */
export default function TxDetailsClient({ safeAddress, txHash }: { safeAddress: `0x${string}`; txHash: string }) {
  // Hooks
  const { chain, address: connectedAddress } = useAccount();
  const navigate = useNavigate();
  const { signSafeTransaction, broadcastSafeTransaction, isOwner, safeInfo, kit } = useSafe(safeAddress);
  const { removeTransaction, getAllTransactions, saveTransaction } = useSafeTxContext();
  const toast = useToast();
  const { approveRequest } = useWalletConnect();

  // State
  const [showModal, setShowModal] = useState(false);
  const [broadcastHash, setBroadcastHash] = useState<string | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [safeTx, setSafeTx] = useState<EthSafeTransaction | null>(null);
  const [signing, setSigning] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAddSigModal, setShowAddSigModal] = useState(false);
  const [signerAddress, setSignerAddress] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [eip712Data, setEip712Data] = useState<{
    domainHash: string;
    messageHash: string;
    eip712Hash: string;
  } | null>(null);
  const [pendingWcRequest, setPendingWcRequest] = useState<{
    topic: string;
    id: number;
    safeTxHash: string;
    timestamp: number;
  } | null>(null);

  // Check for pending WalletConnect request that needs response after execution
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(`wc-pending-response-${txHash}`);
      if (stored) {
        try {
          const wcRequest = JSON.parse(stored);
          setPendingWcRequest(wcRequest);
        } catch (e) {
          console.error("Failed to parse WC request:", e);
        }
      }
    }
  }, [txHash]);

  // Check if current user has signed this specific transaction
  const hasSignedThisTx =
    safeTx && connectedAddress ? (safeTx.signatures?.has(connectedAddress.toLowerCase()) ?? false) : false;

  // Check if user can execute directly (they would be the last signer needed)
  const canExecuteDirectly =
    safeTx && safeInfo && isOwner && !hasSignedThisTx
      ? safeInfo.threshold - (safeTx.signatures?.size || 0) === 1
      : false;

  const [showSignDropdown, setShowSignDropdown] = useState(false);
  const [showCollabDropdown, setShowCollabDropdown] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;

      // Don't close if clicking on a dropdown button (let the button's toggle handle it)
      const isDropdownButton = target.closest('button[type="button"]')?.closest(".dropdown");
      if (isDropdownButton) {
        return;
      }

      // Check if click is outside all dropdowns
      if (!target.closest(".dropdown")) {
        setShowSignDropdown(false);
        setShowCollabDropdown(false);
      }
    }

    if (showSignDropdown || showCollabDropdown) {
      // Add listener immediately
      document.addEventListener("mousedown", handleClickOutside);

      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showSignDropdown, showCollabDropdown]);

  // Effects
  /**
   * Fetch the specific transaction by hash
   */
  useEffect(() => {
    // Don't re-fetch if we've already broadcast successfully - the tx has been removed from storage
    if (broadcastHash) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;
    async function fetchTx() {
      try {
        if (!kit || !chain) return;

        const chainId = String(chain.id);
        const allTxs = getAllTransactions(safeAddress, chainId);

        // Find the transaction matching this hash
        let matchingTx: EthSafeTransaction | null = null;
        for (const tx of allTxs) {
          const hash = await kit.getTransactionHash(tx);
          if (hash === txHash) {
            matchingTx = tx;
            break;
          }
        }

        if (!cancelled) setSafeTx(matchingTx);
      } catch {
        if (!cancelled) {
          toast.error("Could not load transaction");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchTx();
    return () => {
      cancelled = true;
    };
  }, [kit, chain, txHash, safeAddress, getAllTransactions, toast, broadcastHash]);

  /**
   * Calculate EIP-712 hashes when transaction is loaded
   */
  useEffect(() => {
    if (!safeTx || !safeInfo || !chain) return;

    try {
      const hashes = calculateSafeTxHashes(safeAddress, chain.id, {
        to: safeTx.data.to,
        value: safeTx.data.value,
        data: safeTx.data.data,
        operation: safeTx.data.operation,
        safeTxGas: safeTx.data.safeTxGas,
        baseGas: safeTx.data.baseGas,
        gasPrice: safeTx.data.gasPrice,
        gasToken: safeTx.data.gasToken,
        refundReceiver: safeTx.data.refundReceiver,
        nonce: safeTx.data.nonce,
      });

      setEip712Data({
        domainHash: hashes.domainHash,
        messageHash: hashes.messageHash,
        eip712Hash: hashes.eip712Hash,
      });
    } catch (err) {
      console.error("Failed to calculate EIP-712 hashes:", err);
      setEip712Data(null);
    }
  }, [safeTx, safeInfo, safeAddress, chain]);

  /**
   * Handle signing the transaction.
   *
   * @returns {Promise<void>} A promise that resolves when the signing process is complete.
   */
  async function handleSign() {
    setSigning(true);
    if (!safeTx) {
      setSigning(false);
      return;
    }
    try {
      const signedTx = await signSafeTransaction(safeTx);
      if (!signedTx) {
        toast.error("Signing failed");
      } else {
        toast.success("Signature added!");
        setSafeTx(signedTx);
      }
    } catch (e) {
      console.error("Signing error:", e);
      toast.error("Signing failed");
    }
    setSigning(false);
  }

  /**
   * Handle broadcasting the transaction.
   *
   * @returns {Promise<void>} A promise that resolves when the broadcasting process is complete.
   */
  async function handleBroadcast() {
    if (!safeTx) return;
    setBroadcasting(true);
    try {
      const result = await broadcastSafeTransaction(safeTx);
      let txHash = "";
      if (result && typeof result === "object") {
        txHash = result?.hash;
      }
      setBroadcastHash(txHash || null);
      setBroadcastError(null);
      setShowModal(true);
      toast.success("Broadcast successful!");

      // Remove the transaction from the pending list after successful broadcast
      if (chain?.id) {
        removeTransaction(safeAddress, undefined, Number(safeTx.data.nonce), String(chain.id));
      }

      // If there's a pending WalletConnect request, respond with the real tx hash
      if (pendingWcRequest && txHash) {
        try {
          await approveRequest(pendingWcRequest.topic, {
            id: pendingWcRequest.id,
            jsonrpc: "2.0",
            result: txHash,
          });
          // Clear the pending request from sessionStorage
          sessionStorage.removeItem(`wc-pending-response-${pendingWcRequest.safeTxHash}`);
          setPendingWcRequest(null);
          toast.success("WalletConnect: Sent real tx hash to dApp!");
        } catch (wcErr) {
          console.error("Failed to respond to WalletConnect:", wcErr);
          toast.error("Failed to send WalletConnect response");
        }
      }
    } catch (err) {
      setBroadcastError(err instanceof Error ? err.message : String(err));
      setShowModal(true);
      toast.error("Broadcast failed");
    }
    setBroadcasting(false);
  }

  /**
   * Export this single transaction as JSON
   */
  function handleExportSingle() {
    if (!safeTx) return;
    try {
      const signatures = safeTx.signatures
        ? Array.from(safeTx.signatures.values()).map((sig) => ({
            signer: sig.signer,
            data: sig.data,
            isContractSignature: sig.isContractSignature,
          }))
        : [];

      const txData = {
        data: safeTx.data,
        signatures,
      };

      const json = JSON.stringify({ tx: txData }, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `safe-tx-nonce-${safeTx.data.nonce}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Transaction exported!");
    } catch (e: unknown) {
      console.error("Export error:", e);
      toast.error("Export failed");
    }
  }

  /**
   * Share transaction link with all signatures
   */
  function handleShareLink() {
    if (!safeTx || !chain) return;
    try {
      const signatures = safeTx.signatures
        ? Array.from(safeTx.signatures.values()).map((sig) => ({
            signer: sig.signer,
            data: sig.data,
            isContractSignature: sig.isContractSignature,
          }))
        : [];

      const txData = {
        data: safeTx.data,
        signatures,
      };

      const encoded = btoa(JSON.stringify({ tx: txData }));
      const baseUrl = window.location.origin;
      const shareUrl = `${baseUrl}/#/safe/${safeAddress}?importTx=${encodeURIComponent(encoded)}&chainId=${chain.id}`;

      navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied to clipboard!");
    } catch (e: unknown) {
      console.error("Share link error:", e);
      toast.error("Failed to create share link");
    }
  }

  /**
   * Share signature link for this transaction
   */
  function handleShareSignature() {
    if (!safeTx || !chain) return;
    try {
      if (!connectedAddress) {
        toast.error("No wallet connected");
        return;
      }

      // Find the signature for the current user
      const userSignature = safeTx.signatures
        ? Array.from(safeTx.signatures.values()).find(
            (sig) => sig.signer.toLowerCase() === connectedAddress.toLowerCase(),
          )
        : null;

      if (!userSignature) {
        toast.error("You haven't signed this transaction yet");
        return;
      }

      const signatureData = {
        signer: userSignature.signer,
        data: userSignature.data,
        isContractSignature: userSignature.isContractSignature,
      };

      const encoded = btoa(JSON.stringify({ signature: signatureData, txHash }));
      const baseUrl = window.location.origin;
      const shareUrl = `${baseUrl}/#/safe/${safeAddress}?importSig=${encodeURIComponent(encoded)}&chainId=${chain.id}`;

      navigator.clipboard.writeText(shareUrl);
      toast.success("Signature link copied to clipboard!");
    } catch (e: unknown) {
      console.error("Share signature error:", e);
      toast.error("Failed to create signature link");
    }
  }

  /**
   * Add a signature manually to the transaction
   */
  function handleAddSignature() {
    if (!safeTx || !chain) return;
    try {
      // Validate inputs
      if (!signerAddress || !signatureData) {
        toast.error("Signer address and signature data are required");
        return;
      }

      // Basic validation for address format
      if (!signerAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        toast.error("Invalid signer address format");
        return;
      }

      // Basic validation for signature format
      if (!signatureData.match(/^0x[a-fA-F0-9]+$/)) {
        toast.error("Invalid signature data format");
        return;
      }

      // Create the signature object
      const ethSignature = new EthSafeSignature(
        signerAddress,
        signatureData,
        false, // Assuming EOA signature, not contract signature
      );

      // Add signature to the transaction
      safeTx.addSignature(ethSignature);

      // Save the updated transaction
      const chainId = String(chain.id);
      saveTransaction(safeAddress, safeTx, chainId);

      // Update local state - create fresh instance to trigger re-render
      const updatedTx = new EthSafeTransaction(safeTx.data);
      if (safeTx.signatures) {
        safeTx.signatures.forEach((sig) => {
          updatedTx.addSignature(sig);
        });
      }
      setSafeTx(updatedTx);

      // Close modal and reset form
      setShowAddSigModal(false);
      setSignerAddress("");
      setSignatureData("");

      toast.success("Signature added successfully!");
    } catch (e: unknown) {
      console.error("Add signature error:", e);
      toast.error("Failed to add signature");
    }
  }

  return (
    <AppSection testid="tx-details-section">
      <div className="mb-4">
        <Link to={`/safe/${safeAddress}`} className="btn btn-ghost btn-secondary" data-testid="tx-details-cancel-btn">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-5 w-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to Safe
        </Link>
      </div>
      <AppCard title="Safe Transaction" data-testid="tx-details-card">
        <div className="flex flex-col gap-4" data-testid="tx-details-content">
          {loading ? (
            <div className="flex items-center justify-center py-8" data-testid="tx-details-loading-row">
              <span className="loading loading-dots loading-lg" />
            </div>
          ) : safeTx ? (
            <>
              {/* Transaction details: simple flex column with DaisyUI dividers */}
              <div
                className="bg-base-200 rounded-box divide-base-100 flex max-h-80 flex-col divide-y overflow-y-auto shadow-md"
                data-testid="tx-details-data-box"
              >
                <div className="flex items-center justify-between px-4 py-3" data-testid="tx-details-to-row">
                  <span className="font-semibold">To</span>
                  <span className="max-w-[60%] truncate" title={safeTx.data.to} data-testid="tx-details-to-value">
                    {safeTx.data.to}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3" data-testid="tx-details-value-row">
                  <span className="font-semibold">Value (wei)</span>
                  <span data-testid="tx-details-value-value">
                    {safeTx.data.value?.toString?.() || String(safeTx.data.value) || "0"}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3" data-testid="tx-details-nonce-row">
                  <span className="font-semibold">Nonce</span>
                  <span data-testid="tx-details-nonce-value">{safeTx.data.nonce}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3" data-testid="tx-details-operation-row">
                  <span className="font-semibold">Operation</span>
                  <span data-testid="tx-details-operation-value">{safeTx.data.operation}</span>
                </div>
                <div className="flex items-start justify-between px-4 py-3" data-testid="tx-details-data-row">
                  <span className="font-semibold">Data</span>
                  <div className="flex flex-col items-end gap-2">
                    {safeTx.data.data && safeTx.data.data !== "0x" ? (
                      <>
                        <DataPreview value={safeTx.data.data} />
                        {chain && (
                          <a
                            href={`https://tools.cyfrin.io/abi-encoding?data=${encodeURIComponent(safeTx.data.data)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-xs btn-outline"
                          >
                            🔍 Decode Calldata
                          </a>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400">No calldata (0x)</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-3" data-testid="tx-details-gasprice-row">
                  <span className="font-semibold">Gas Price</span>
                  <span data-testid="tx-details-gasprice-value">{safeTx.data.gasPrice}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3" data-testid="tx-details-basegas-row">
                  <span className="font-semibold">Base Gas</span>
                  <span data-testid="tx-details-basegas-value">{safeTx.data.baseGas}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3" data-testid="tx-details-safetxgas-row">
                  <span className="font-semibold">SafeTxGas</span>
                  <span data-testid="tx-details-safetxgas-value">{safeTx.data.safeTxGas}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3" data-testid="tx-details-gastoken-row">
                  <span className="font-semibold">Gas Token</span>
                  <span
                    className="max-w-[60%] truncate"
                    title={safeTx.data.gasToken}
                    data-testid="tx-details-gastoken-value"
                  >
                    {safeTx.data.gasToken}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between px-4 py-3"
                  data-testid="tx-details-refundreceiver-row"
                >
                  <span className="font-semibold">Refund Receiver</span>
                  <span
                    className="max-w-[60%] truncate"
                    title={safeTx.data.refundReceiver}
                    data-testid="tx-details-refundreceiver-value"
                  >
                    {safeTx.data.refundReceiver}
                  </span>
                </div>
                <div className="flex flex-col gap-1 px-4 py-3" data-testid="tx-details-signatures-row">
                  <span className="mb-1 font-semibold">Signatures</span>
                  {safeTx.signatures && safeTx.signatures.size > 0 ? (
                    [...safeTx.signatures.values()].map((sigObj, idx) => (
                      <span
                        key={idx}
                        className="font-mono text-xs break-all"
                        data-testid={`tx-details-signature-${idx}`}
                      >
                        Sig {idx + 1}: {sigObj.data}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-gray-400" data-testid="tx-details-signatures-empty">
                      No signatures
                    </span>
                  )}
                </div>
              </div>

              {/* EIP-712 Data Section */}
              {eip712Data && safeTx && chain && (
                <div className="mt-4">
                  <div className="mb-4 flex items-center justify-end">
                    <a
                      href={`https://tools.cyfrin.io/safe-hash?safeAddress=${encodeURIComponent(safeAddress)}&chainId=${encodeURIComponent(getChainNameForCyfrin(chain.id))}&safeVersion=${encodeURIComponent(safeInfo?.version || "1.4.1")}&nonce=${encodeURIComponent(safeTx.data.nonce)}&to=${encodeURIComponent(safeTx.data.to)}&value=${encodeURIComponent(safeTx.data.value)}&data=${encodeURIComponent(safeTx.data.data)}&operation=${encodeURIComponent(safeTx.data.operation)}&safeTxGas=${encodeURIComponent(safeTx.data.safeTxGas)}&baseGas=${encodeURIComponent(safeTx.data.baseGas)}&gasPrice=${encodeURIComponent(safeTx.data.gasPrice)}&gasToken=${encodeURIComponent(safeTx.data.gasToken)}&refundReceiver=${encodeURIComponent(safeTx.data.refundReceiver)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-xs btn-outline whitespace-nowrap"
                    >
                      🔐 Verify EIP-712 Hash
                    </a>
                  </div>
                  <EIP712DataDisplay
                    domainHash={eip712Data.domainHash}
                    messageHash={eip712Data.messageHash}
                    eip712Hash={eip712Data.eip712Hash}
                  />
                </div>
              )}

              {/* WalletConnect Pending Alert */}
              {pendingWcRequest && (
                <div className="alert alert-warning">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 shrink-0 stroke-current"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <div className="text-sm">
                    <p className="font-semibold">WalletConnect Request Pending</p>
                    <p>
                      A dApp is waiting for the real transaction hash. Execute this transaction to send the response.
                    </p>
                  </div>
                </div>
              )}

              {/* Info Alert */}
              <div className="alert alert-info">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="h-6 w-6 shrink-0 stroke-current"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  ></path>
                </svg>
                <div className="text-sm">
                  <p className="font-semibold">Transaction Queued</p>
                  <p>This transaction is saved and visible to all owners. Sign it now or return to the dashboard.</p>
                </div>
              </div>

              {/* Action buttons organized by purpose */}
              <div className="mt-4 flex flex-col gap-4">
                {/* Navigation */}
                <div>
                  <button
                    className="btn btn-outline btn-primary"
                    onClick={() => navigate(`/safe/${safeAddress}`)}
                    title="Return to dashboard without signing"
                    data-testid="tx-details-queue-btn"
                  >
                    Back to Dashboard (Queued)
                  </button>
                </div>

                {/* Primary Actions: Sign and Broadcast */}
                <div className="flex flex-wrap gap-2">
                  <div className="mb-1 w-full text-sm font-semibold">Primary Actions</div>
                  {canExecuteDirectly ? (
                    <div className={`dropdown dropdown-top ${showSignDropdown ? "dropdown-open" : ""}`}>
                      <button
                        type="button"
                        tabIndex={0}
                        className="btn btn-success"
                        data-testid="tx-details-sign-dropdown-btn"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowSignDropdown(!showSignDropdown);
                        }}
                        disabled={signing || broadcasting}
                      >
                        {signing || broadcasting ? (
                          <div className="flex items-center">
                            <span>{signing ? "Signing" : "Executing"} in progress</span>
                            <span className="loading loading-dots loading-xs ml-2" />
                          </div>
                        ) : (
                          <>
                            Sign Transaction
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                              className="ml-1 h-4 w-4"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                          </>
                        )}
                      </button>
                      {showSignDropdown && (
                        <ul
                          tabIndex={0}
                          className="dropdown-content menu bg-base-100 rounded-box border-base-300 z-[1] mb-2 w-64 border p-2 shadow"
                        >
                          <li>
                            <button
                              onClick={() => {
                                setShowSignDropdown(false);
                                handleSign();
                              }}
                              disabled={signing || broadcasting}
                              className="flex flex-col items-start py-3"
                              data-testid="tx-details-sign-option-btn"
                            >
                              <span className="font-semibold">Sign Transaction</span>
                              <span className="text-xs opacity-70">Add your signature to the queue</span>
                            </button>
                          </li>
                          <li>
                            <button
                              onClick={() => {
                                setShowSignDropdown(false);
                                handleBroadcast();
                              }}
                              disabled={signing || broadcasting}
                              className="flex flex-col items-start py-3"
                              data-testid="tx-details-execute-option-btn"
                            >
                              <span className="font-semibold">Execute Transaction</span>
                              <span className="text-xs opacity-70">
                                Execute immediately (you&apos;re the last signer)
                              </span>
                            </button>
                          </li>
                        </ul>
                      )}
                    </div>
                  ) : (
                    <button
                      className="btn btn-success"
                      onClick={handleSign}
                      disabled={!isOwner || signing || hasSignedThisTx}
                      title={"Signing tx"}
                      data-testid="tx-details-sign-btn"
                    >
                      {!isOwner ? (
                        "Only Safe owners can sign"
                      ) : hasSignedThisTx ? (
                        "Already Signed"
                      ) : signing ? (
                        <div className="flex items-center">
                          <span>Signing in progress</span>
                          <span className="loading loading-dots loading-xs ml-2" />
                        </div>
                      ) : (
                        "Sign Transaction"
                      )}
                    </button>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={handleBroadcast}
                    disabled={!(safeTx && safeInfo && safeTx.signatures?.size >= safeInfo.threshold) || broadcasting}
                    title="Broadcasting tx"
                    data-testid="tx-details-broadcast-btn"
                  >
                    {broadcasting ? (
                      <div className="flex items-center">
                        <span>Broadcasting in progress</span>
                        <span className="loading loading-dots loading-xs ml-2" />
                      </div>
                    ) : (
                      "Broadcast Transaction"
                    )}
                  </button>
                </div>

                {/* Collaboration Tools */}
                <div className="flex flex-wrap gap-2">
                  <div className="mb-1 w-full text-sm font-semibold">Collaboration Tools</div>
                  <div className={`dropdown dropdown-top ${showCollabDropdown ? "dropdown-open" : ""}`}>
                    <button
                      type="button"
                      tabIndex={0}
                      className="btn btn-outline btn-sm"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowCollabDropdown(!showCollabDropdown);
                      }}
                      disabled={!safeTx}
                      title="Share and export tools"
                    >
                      Share & Export
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="ml-1 h-4 w-4"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                    {showCollabDropdown && (
                      <ul
                        tabIndex={0}
                        className="dropdown-content menu bg-base-100 rounded-box border-base-300 z-[1] mb-2 w-64 border p-2 shadow"
                      >
                        <li>
                          <button
                            onClick={() => {
                              setShowCollabDropdown(false);
                              handleExportSingle();
                            }}
                            disabled={!safeTx}
                            className="flex flex-col items-start py-3"
                            data-testid="tx-details-export-btn"
                          >
                            <span className="font-semibold">📤 Export Transaction</span>
                            <span className="text-xs opacity-70">Download as JSON file</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => {
                              setShowCollabDropdown(false);
                              handleShareLink();
                            }}
                            disabled={!safeTx}
                            className="flex flex-col items-start py-3"
                            data-testid="tx-details-share-link-btn"
                          >
                            <span className="font-semibold">🔗 Share Link</span>
                            <span className="text-xs opacity-70">Copy link with all signatures</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => {
                              setShowCollabDropdown(false);
                              handleShareSignature();
                            }}
                            disabled={!safeTx || !hasSignedThisTx}
                            className={`flex flex-col items-start py-3 ${!safeTx || !hasSignedThisTx ? "cursor-not-allowed opacity-40" : ""}`}
                            title={
                              !safeTx || !hasSignedThisTx
                                ? "You must sign the transaction first"
                                : "Share your signature with others"
                            }
                            data-testid="tx-details-share-signature-btn"
                          >
                            <span className="font-semibold">✍️ Share Signature</span>
                            <span className="text-xs opacity-70">Copy link with your signature only</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => {
                              setShowCollabDropdown(false);
                              setShowAddSigModal(true);
                            }}
                            disabled={!safeTx}
                            className="flex flex-col items-start py-3"
                            data-testid="tx-details-add-signature-btn"
                          >
                            <span className="font-semibold">➕ Add Signature</span>
                            <span className="text-xs opacity-70">Manually add another signer&apos;s signature</span>
                          </button>
                        </li>
                      </ul>
                    )}
                  </div>
                </div>
              </div>
              {/* BroadcastModal for broadcast feedback */}
              {showModal && (
                <BroadcastModal
                  open={showModal}
                  txHash={broadcastHash}
                  error={broadcastError}
                  blockExplorerUrl={chain?.blockExplorers?.default?.url}
                  onClose={() => setShowModal(false)}
                  onSuccess={() => {
                    removeTransaction(safeAddress);
                    setShowModal(false);
                    navigate(`/safe/${safeAddress}`);
                  }}
                  successLabel="Back to Safe"
                  testid="tx-details-broadcast-modal"
                />
              )}

              {/* Add Signature Modal */}
              {showAddSigModal && (
                <div className="modal modal-open">
                  <div className="modal-box">
                    <h3 className="mb-4 text-lg font-bold">Add Signature Manually</h3>
                    <p className="mb-4 text-sm text-gray-500">
                      Add a signature from another signer who signed this transaction offline or using a different tool.
                    </p>

                    <div className="form-control mb-4">
                      <label className="label">
                        <span className="label-text">Signer Address</span>
                      </label>
                      <input
                        type="text"
                        placeholder="0x..."
                        className="input input-bordered w-full font-mono"
                        value={signerAddress}
                        onChange={(e) => setSignerAddress(e.target.value)}
                      />
                      <label className="label">
                        <span className="label-text-alt">The address that signed the transaction</span>
                      </label>
                    </div>

                    <div className="form-control mb-4">
                      <label className="label">
                        <span className="label-text">Signature Data</span>
                      </label>
                      <textarea
                        placeholder="0x..."
                        className="textarea textarea-bordered w-full font-mono text-xs"
                        rows={4}
                        value={signatureData}
                        onChange={(e) => setSignatureData(e.target.value)}
                      />
                      <label className="label">
                        <span className="label-text-alt">The hex-encoded signature data</span>
                      </label>
                    </div>

                    <div className="modal-action">
                      <button
                        className="btn btn-ghost"
                        onClick={() => {
                          setShowAddSigModal(false);
                          setSignerAddress("");
                          setSignatureData("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={handleAddSignature}
                        disabled={!signerAddress || !signatureData}
                      >
                        Add Signature
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="alert alert-info" data-testid="tx-details-notfound-alert">
              {!connectedAddress ? (
                <div className="flex flex-col gap-2">
                  <span className="font-semibold">Connect Wallet to Get Started</span>
                  <span className="text-sm">Please connect your wallet to view and sign this transaction.</span>
                </div>
              ) : (
                "Transaction not found."
              )}
            </div>
          )}
        </div>
      </AppCard>
    </AppSection>
  );
}
