"use client";

import AppSection from "@/app/components/AppSection";
import AppCard from "@/app/components/AppCard";
import { useParams, useRouter } from "next/navigation";
import useSafe from "@/app/hooks/useSafe";
import { useEffect, useState, useRef } from "react";
import { EthSafeTransaction, EthSafeSignature } from "@safe-global/protocol-kit";
import { useSafeTxContext } from "@/app/provider/SafeTxProvider";
import DataPreview from "@/app/components/DataPreview";
import BtnCancel from "@/app/components/BtnCancel";
import { BroadcastModal } from "@/app/components/BroadcastModal";
import { useAccount } from "wagmi";
import { ethers } from "ethers";

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
export default function TxDetailsClient() {
  // Hooks
  const { chain, address: connectedAddress } = useAccount();
  const { address: safeAddress, txHash } = useParams<{ address: `0x${string}`; txHash: string }>();
  const router = useRouter();
  const {
    signSafeTransaction,
    broadcastSafeTransaction,
    isOwner,
    hasSigned,
    safeInfo,
    kit,
  } = useSafe(safeAddress);
  const { removeTransaction, getAllTransactions, saveTransaction } = useSafeTxContext();

  // Refs and state
  const toastRef = useRef<HTMLDivElement | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [broadcastHash, setBroadcastHash] = useState<string | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [safeTx, setSafeTx] = useState<EthSafeTransaction | null>(null);
  const [signing, setSigning] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddSigModal, setShowAddSigModal] = useState(false);
  const [signerAddress, setSignerAddress] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [eip712Data, setEip712Data] = useState<{
    domainHash: string;
    messageHash: string;
    eip712Hash: string;
  } | null>(null);

  // Check if current user has signed this specific transaction
  const hasSignedThisTx = safeTx && connectedAddress
    ? safeTx.signatures?.has(connectedAddress.toLowerCase()) ?? false
    : false;

  // Effects
  /**
   * Fetch the specific transaction by hash
   */
  useEffect(() => {
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
          setToast({ type: "error", message: "Could not load transaction" });
          setTimeout(() => setToast(null), 3000);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchTx();
    return () => {
      cancelled = true;
    };
  }, [kit, chain, txHash, safeAddress, getAllTransactions]);

  /**
   * Calculate EIP-712 hashes when transaction is loaded
   */
  useEffect(() => {
    if (!safeTx || !safeInfo || !chain) return;

    try {
      // Construct EIP-712 typed data for Safe transactions
      const domain = {
        chainId: chain.id,
        verifyingContract: safeAddress,
      };

      const types = {
        SafeTx: [
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
          { name: "operation", type: "uint8" },
          { name: "safeTxGas", type: "uint256" },
          { name: "baseGas", type: "uint256" },
          { name: "gasPrice", type: "uint256" },
          { name: "gasToken", type: "address" },
          { name: "refundReceiver", type: "address" },
          { name: "nonce", type: "uint256" },
        ],
      };

      const message = {
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
      };

      const domainHash = ethers.TypedDataEncoder.hashDomain(domain);
      const messageHash = ethers.TypedDataEncoder.hashStruct("SafeTx", types, message);
      const eip712Hash = ethers.TypedDataEncoder.hash(domain, types, message);

      setEip712Data({
        domainHash,
        messageHash,
        eip712Hash,
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
        setToast({ type: "error", message: "Signing failed" });
      } else {
        setToast({ type: "success", message: "Signature added!" });
        setSafeTx(signedTx);
      }
    } catch (e) {
      console.error("Signing error:", e);
      setToast({ type: "error", message: "Signing failed" });
    }
    setSigning(false);
    setTimeout(() => setToast(null), 3000);
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
      setToast({ type: "success", message: "Broadcast successful!" });
    } catch (err) {
      setBroadcastError(err instanceof Error ? err.message : String(err));
      setShowModal(true);
      setToast({ type: "error", message: "Broadcast failed" });
    }
    setBroadcasting(false);
    setTimeout(() => setToast(null), 3000);
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

      setToast({ type: "success", message: "Transaction exported!" });
      setTimeout(() => setToast(null), 3000);
    } catch (e: unknown) {
      console.error("Export error:", e);
      setToast({ type: "error", message: "Export failed" });
      setTimeout(() => setToast(null), 3000);
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
      const shareUrl = `${baseUrl}/safe/${safeAddress}?importTx=${encodeURIComponent(encoded)}&chainId=${chain.id}`;

      navigator.clipboard.writeText(shareUrl);
      setToast({ type: "success", message: "Share link copied to clipboard!" });
      setTimeout(() => setToast(null), 3000);
    } catch (e: unknown) {
      console.error("Share link error:", e);
      setToast({ type: "error", message: "Failed to create share link" });
      setTimeout(() => setToast(null), 3000);
    }
  }

  /**
   * Share signature link for this transaction
   */
  function handleShareSignature() {
    if (!safeTx || !chain) return;
    try {
      if (!connectedAddress) {
        setToast({ type: "error", message: "No wallet connected" });
        setTimeout(() => setToast(null), 3000);
        return;
      }

      // Find the signature for the current user
      const userSignature = safeTx.signatures
        ? Array.from(safeTx.signatures.values()).find(
            (sig) => sig.signer.toLowerCase() === connectedAddress.toLowerCase()
          )
        : null;

      if (!userSignature) {
        setToast({ type: "error", message: "You haven't signed this transaction yet" });
        setTimeout(() => setToast(null), 3000);
        return;
      }

      const signatureData = {
        signer: userSignature.signer,
        data: userSignature.data,
        isContractSignature: userSignature.isContractSignature,
      };

      const encoded = btoa(JSON.stringify({ signature: signatureData, txHash }));
      const baseUrl = window.location.origin;
      const shareUrl = `${baseUrl}/safe/${safeAddress}?importSig=${encodeURIComponent(encoded)}&chainId=${chain.id}`;

      navigator.clipboard.writeText(shareUrl);
      setToast({ type: "success", message: "Signature link copied to clipboard!" });
      setTimeout(() => setToast(null), 3000);
    } catch (e: unknown) {
      console.error("Share signature error:", e);
      setToast({ type: "error", message: "Failed to create signature link" });
      setTimeout(() => setToast(null), 3000);
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
        setToast({ type: "error", message: "Signer address and signature data are required" });
        setTimeout(() => setToast(null), 3000);
        return;
      }

      // Basic validation for address format
      if (!signerAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        setToast({ type: "error", message: "Invalid signer address format" });
        setTimeout(() => setToast(null), 3000);
        return;
      }

      // Basic validation for signature format
      if (!signatureData.match(/^0x[a-fA-F0-9]+$/)) {
        setToast({ type: "error", message: "Invalid signature data format" });
        setTimeout(() => setToast(null), 3000);
        return;
      }

      // Create the signature object
      const ethSignature = new EthSafeSignature(
        signerAddress,
        signatureData,
        false // Assuming EOA signature, not contract signature
      );

      // Add signature to the transaction
      safeTx.addSignature(ethSignature);

      // Save the updated transaction
      const chainId = String(chain.id);
      saveTransaction(safeAddress, safeTx, chainId);

      // Update local state
      setSafeTx({ ...safeTx });

      // Close modal and reset form
      setShowAddSigModal(false);
      setSignerAddress("");
      setSignatureData("");

      setToast({ type: "success", message: "Signature added successfully!" });
      setTimeout(() => setToast(null), 3000);
    } catch (e: unknown) {
      console.error("Add signature error:", e);
      setToast({ type: "error", message: "Failed to add signature" });
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <AppSection testid="tx-details-section">
      <div className="mb-4">
        <BtnCancel
          href={`/safe/${safeAddress}`}
          label="Back to Safe"
          data-testid="tx-details-cancel-btn"
        />
      </div>
      <AppCard title="Safe Transaction" data-testid="tx-details-card">
        <div className="flex flex-col gap-4" data-testid="tx-details-content">
          {loading ? (
            <div
              className="flex items-center justify-center py-8"
              data-testid="tx-details-loading-row"
            >
              <span className="loading loading-dots loading-lg" />
            </div>
          ) : safeTx ? (
            <>
              {/* Transaction details: simple flex column with DaisyUI dividers */}
              <div
                className="bg-base-200 rounded-box divide-base-100 flex max-h-80 flex-col divide-y overflow-y-auto shadow-md"
                data-testid="tx-details-data-box"
              >
                <div
                  className="flex items-center justify-between px-4 py-3"
                  data-testid="tx-details-to-row"
                >
                  <span className="font-semibold">To</span>
                  <span
                    className="max-w-[60%] truncate"
                    title={safeTx.data.to}
                    data-testid="tx-details-to-value"
                  >
                    {safeTx.data.to}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between px-4 py-3"
                  data-testid="tx-details-value-row"
                >
                  <span className="font-semibold">Value (wei)</span>
                  <span data-testid="tx-details-value-value">
                    {safeTx.data.value?.toString?.() ||
                      String(safeTx.data.value) ||
                      "0"}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between px-4 py-3"
                  data-testid="tx-details-nonce-row"
                >
                  <span className="font-semibold">Nonce</span>
                  <span data-testid="tx-details-nonce-value">
                    {safeTx.data.nonce}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between px-4 py-3"
                  data-testid="tx-details-operation-row"
                >
                  <span className="font-semibold">Operation</span>
                  <span data-testid="tx-details-operation-value">
                    {safeTx.data.operation}
                  </span>
                </div>
                <div
                  className="flex items-start justify-between px-4 py-3"
                  data-testid="tx-details-data-row"
                >
                  <span className="font-semibold">Data</span>
                  <div className="flex flex-col items-end gap-2">
                    {safeTx.data.data && safeTx.data.data !== "0x" ? (
                      <>
                        <DataPreview value={safeTx.data.data} />
                        {chain && (
                          <a
                            href={`https://tools.cyfrin.io/abi-encoding?data=${safeTx.data.data}`}
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
                <div
                  className="flex items-center justify-between px-4 py-3"
                  data-testid="tx-details-gasprice-row"
                >
                  <span className="font-semibold">Gas Price</span>
                  <span data-testid="tx-details-gasprice-value">
                    {safeTx.data.gasPrice}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between px-4 py-3"
                  data-testid="tx-details-basegas-row"
                >
                  <span className="font-semibold">Base Gas</span>
                  <span data-testid="tx-details-basegas-value">
                    {safeTx.data.baseGas}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between px-4 py-3"
                  data-testid="tx-details-safetxgas-row"
                >
                  <span className="font-semibold">SafeTxGas</span>
                  <span data-testid="tx-details-safetxgas-value">
                    {safeTx.data.safeTxGas}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between px-4 py-3"
                  data-testid="tx-details-gastoken-row"
                >
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
                <div
                  className="flex flex-col gap-1 px-4 py-3"
                  data-testid="tx-details-signatures-row"
                >
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
                    <span
                      className="text-xs text-gray-400"
                      data-testid="tx-details-signatures-empty"
                    >
                      No signatures
                    </span>
                  )}
                </div>
              </div>

              {/* EIP-712 Data Section */}
              {eip712Data && safeTx && chain && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="divider">EIP-712 Signature Data</div>
                    <a
                      href={`https://tools.cyfrin.io/safe-hash?safeAddress=${safeAddress}&chainId=${getChainNameForCyfrin(chain.id)}&safeVersion=${safeInfo?.version || "1.4.1"}&nonce=${safeTx.data.nonce}&to=${safeTx.data.to}&value=${safeTx.data.value}&data=${safeTx.data.data}&operation=${safeTx.data.operation}&safeTxGas=${safeTx.data.safeTxGas}&baseGas=${safeTx.data.baseGas}&gasPrice=${safeTx.data.gasPrice}&gasToken=${safeTx.data.gasToken}&refundReceiver=${safeTx.data.refundReceiver}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-xs btn-outline whitespace-nowrap"
                    >
                      🔐 Verify EIP-712 Hash
                    </a>
                  </div>

                  <div className="bg-base-200 rounded-box p-4 space-y-3">
                    <div>
                      <h4 className="font-semibold text-sm mb-1">Domain Hash</h4>
                      <p className="font-mono text-xs break-all">{eip712Data.domainHash}</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm mb-1">Message Hash</h4>
                      <p className="font-mono text-xs break-all">{eip712Data.messageHash}</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                      <h4 className="font-semibold text-sm text-blue-800 dark:text-blue-200 mb-1">
                        EIP-712 Digest (Signing Hash)
                      </h4>
                      <p className="font-mono text-xs text-blue-800 dark:text-blue-200 break-all">
                        {eip712Data.eip712Hash}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Info Alert */}
              <div className="alert alert-info">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="stroke-current shrink-0 w-6 h-6"
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

              {/* Action buttons: Sign and Broadcast */}
              <div
                className="mt-4 flex flex-wrap gap-2"
                data-testid="tx-details-actions-row"
              >
                <button
                  className="btn btn-outline btn-primary"
                  onClick={() => router.push(`/safe/${safeAddress}`)}
                  title="Return to dashboard without signing"
                  data-testid="tx-details-queue-btn"
                >
                  Back to Dashboard (Queued)
                </button>
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
                <button
                  className="btn btn-primary"
                  onClick={handleBroadcast}
                  disabled={
                    !(
                      safeTx &&
                      safeInfo &&
                      safeTx.signatures?.size >= safeInfo.threshold
                    ) || broadcasting
                  }
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
                <button
                  className="btn btn-outline btn-sm"
                  onClick={handleExportSingle}
                  disabled={!safeTx}
                  title="Export this transaction as JSON"
                  data-testid="tx-details-export-btn"
                >
                  Export Transaction
                </button>
                <button
                  className="btn btn-secondary btn-outline btn-sm"
                  onClick={handleShareLink}
                  disabled={!safeTx}
                  title="Copy shareable link with transaction and all signatures"
                  data-testid="tx-details-share-link-btn"
                >
                  Share Link
                </button>
                <button
                  className="btn btn-accent btn-outline btn-sm"
                  onClick={handleShareSignature}
                  disabled={!safeTx || !hasSignedThisTx}
                  title="Copy shareable link with only your signature"
                  data-testid="tx-details-share-signature-btn"
                >
                  Share Signature
                </button>
                <button
                  className="btn btn-info btn-outline btn-sm"
                  onClick={() => setShowAddSigModal(true)}
                  disabled={!safeTx}
                  title="Manually add a signature to this transaction"
                  data-testid="tx-details-add-signature-btn"
                >
                  Add Signature
                </button>
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
                    router.push(`/safe/${safeAddress}`);
                  }}
                  successLabel="Back to Safe"
                  testid="tx-details-broadcast-modal"
                />
              )}

              {/* Add Signature Modal */}
              {showAddSigModal && (
                <div className="modal modal-open">
                  <div className="modal-box">
                    <h3 className="font-bold text-lg mb-4">Add Signature Manually</h3>
                    <p className="text-sm text-gray-500 mb-4">
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
            <div
              className="text-gray-400"
              data-testid="tx-details-notfound-alert"
            >
              Transaction not found.
            </div>
          )}
          {/* DaisyUI toast notification */}
          {toast && (
            <div
              ref={toastRef}
              className={`toast toast-center z-50`}
              style={{
                position: "fixed",
                left: 0,
                right: 0,
                top: "2rem",
                margin: "auto",
                width: "fit-content",
              }}
              data-testid="tx-details-toast"
            >
              <div className={`alert alert-${toast.type}`}>{toast.message}</div>
            </div>
          )}
        </div>
      </AppCard>
    </AppSection>
  );
}
