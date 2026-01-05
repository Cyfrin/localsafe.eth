"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWalletConnect } from "@/app/provider/WalletConnectProvider";
import useSafe from "@/app/hooks/useSafe";
import AppSection from "@/app/components/AppSection";
import AppCard from "@/app/components/AppCard";
import DataPreview from "@/app/components/DataPreview";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import type { SignClientTypes } from "@walletconnect/types";

export default function WalletConnectTxClient({ safeAddress }: { safeAddress: `0x${string}` }) {
  const navigate = useNavigate();
  const { chain } = useAccount();
  const { pendingRequest, approveRequest, rejectRequest, clearPendingRequest } = useWalletConnect();
  const { buildSafeTransaction, kit, safeInfo } = useSafe(safeAddress);

  interface TxParams {
    to: string;
    value?: string;
    data?: string;
    gas?: string;
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  }

  const [txParams, setTxParams] = useState<TxParams | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [requestFromStorage, setRequestFromStorage] = useState<
    SignClientTypes.EventArguments["session_request"] | null
  >(null);
  const [customNonce, setCustomNonce] = useState<string>("");

  // Flash the tab title to get user's attention
  useEffect(() => {
    const originalTitle = document.title || "LocalSafe";
    let isVisible = true;

    // Set initial state
    document.title = "🔔 Sign Transaction!";

    const interval = setInterval(() => {
      document.title = isVisible ? "🔔 Sign Transaction!" : originalTitle;
      isVisible = !isVisible;
    }, 1000); // Flash every second

    return () => {
      clearInterval(interval);
      document.title = originalTitle;
    };
  }, []);

  // Load request from sessionStorage if not in context
  useEffect(() => {
    if (!pendingRequest && typeof window !== "undefined") {
      const stored = sessionStorage.getItem("wc-pending-request");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setRequestFromStorage(parsed);

          if (parsed.params?.request?.method === "eth_sendTransaction") {
            const [params] = parsed.params.request.params;
            setTxParams(params);
          }
        } catch (e) {
          console.error("Failed to parse stored request:", e);
        }
      }
    } else if (pendingRequest) {
      const { params } = pendingRequest;
      if (params.request.method === "eth_sendTransaction") {
        const [txParam] = params.request.params;
        setTxParams(txParam);
      }
    }
  }, [pendingRequest]);

  const currentRequest = pendingRequest || requestFromStorage;

  const handleApprove = async () => {
    if (!currentRequest || !txParams) return;

    setIsProcessing(true);
    try {
      // Parse custom nonce if provided
      const nonce = customNonce ? parseInt(customNonce, 10) : undefined;
      if (customNonce && (isNaN(nonce!) || nonce! < 0)) {
        alert("Invalid nonce value");
        setIsProcessing(false);
        return;
      }

      // Build the Safe transaction
      const safeTx = await buildSafeTransaction(
        [
          {
            to: txParams.to,
            value: txParams.value || "0",
            data: txParams.data || "0x",
            operation: 0,
          },
        ],
        nonce,
      );

      if (!safeTx) {
        throw new Error("Failed to build Safe transaction");
      }

      // Get the Safe transaction hash
      const safeTxHash = await kit?.getTransactionHash(safeTx);

      if (!safeTxHash) {
        throw new Error("Failed to get Safe transaction hash");
      }

      // Approve the WalletConnect request with the Safe transaction hash
      // Note: We're sending a safeTxHash (internal Safe hash for signature collection)
      // not a blockchain transaction hash. The dApp will show this as "pending".
      await approveRequest(currentRequest.topic, {
        id: currentRequest.id,
        jsonrpc: "2.0",
        result: safeTxHash,
      });

      // Clear from sessionStorage
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("wc-pending-request");
      }

      // Navigate to the transaction signing page
      navigate(`/safe/${safeAddress}/tx/${safeTxHash}`);
    } catch (error) {
      console.error("Failed to approve transaction:", error);
      alert(`Failed to approve transaction: ${error instanceof Error ? error.message : String(error)}`);
      setIsProcessing(false);
    }
  };

  /**
   * Handle creating the transaction but delay WalletConnect response until execution.
   * This stores the WC request info so we can respond with the real on-chain tx hash after execution.
   */
  const handleApproveAndWait = async () => {
    if (!currentRequest || !txParams) return;

    setIsProcessing(true);
    try {
      // Parse custom nonce if provided
      const nonce = customNonce ? parseInt(customNonce, 10) : undefined;
      if (customNonce && (isNaN(nonce!) || nonce! < 0)) {
        alert("Invalid nonce value");
        setIsProcessing(false);
        return;
      }

      // Build the Safe transaction
      const safeTx = await buildSafeTransaction(
        [
          {
            to: txParams.to,
            value: txParams.value || "0",
            data: txParams.data || "0x",
            operation: 0,
          },
        ],
        nonce,
      );

      if (!safeTx) {
        throw new Error("Failed to build Safe transaction");
      }

      // Get the Safe transaction hash
      const safeTxHash = await kit?.getTransactionHash(safeTx);

      if (!safeTxHash) {
        throw new Error("Failed to get Safe transaction hash");
      }

      // Store WalletConnect request info for later response (after execution)
      // We don't respond to WC now - we'll respond with the real tx hash after execution
      if (typeof window !== "undefined") {
        const wcRequestInfo = {
          topic: currentRequest.topic,
          id: currentRequest.id,
          safeTxHash,
          timestamp: Date.now(),
        };
        sessionStorage.setItem(`wc-pending-response-${safeTxHash}`, JSON.stringify(wcRequestInfo));
        sessionStorage.removeItem("wc-pending-request");
      }

      // Clear pending request from context (but don't respond to WC yet)
      clearPendingRequest();

      // Navigate to the transaction signing page
      navigate(`/safe/${safeAddress}/tx/${safeTxHash}`);
    } catch (error) {
      console.error("Failed to create transaction:", error);
      alert(`Failed to create transaction: ${error instanceof Error ? error.message : String(error)}`);
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!currentRequest) return;

    setIsProcessing(true);
    try {
      await rejectRequest(
        currentRequest.topic,
        {
          code: 4001,
          message: "User rejected the request",
        },
        currentRequest.id, // Pass the request ID
      );
    } catch (error) {
      console.error("Failed to reject transaction:", error);
      alert(`Failed to reject transaction: ${error instanceof Error ? error.message : String(error)}`);
      setIsProcessing(false);
      return;
    } finally {
      // Always clear pending request state
      clearPendingRequest();
    }

    // Navigate back to safe
    navigate(`/safe/${safeAddress}`);
  };

  if (!currentRequest || !txParams) {
    return (
      <AppSection>
        <AppCard title="WalletConnect Transaction">
          <div className="py-8 text-center">
            <p>No pending transaction request found.</p>
            <button className="btn btn-primary mt-4" onClick={() => navigate(`/safe/${safeAddress}`)}>
              Back to Safe
            </button>
          </div>
        </AppCard>
      </AppSection>
    );
  }

  const dappMetadata = (
    currentRequest as unknown as {
      params?: { proposer?: { metadata?: { icons?: string[]; name?: string; url?: string; description?: string } } };
    }
  )?.params?.proposer?.metadata;

  return (
    <AppSection testid="wc-tx-section">
      <div className="mb-4">
        <button
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            if (currentRequest) {
              try {
                await rejectRequest(
                  currentRequest.topic,
                  {
                    code: 4001,
                    message: "User cancelled the request",
                  },
                  currentRequest.id, // Pass the request ID
                );
              } catch (error) {
                console.error("Failed to reject request:", error);
              } finally {
                // Always clear pending request state as a safety measure
                clearPendingRequest();
              }
            }
            navigate(`/safe/${safeAddress}`);
          }}
          data-testid="wc-tx-cancel-btn"
        >
          ← Back to Safe
        </button>
      </div>

      <AppCard title="WalletConnect Transaction Request" data-testid="wc-tx-card">
        <div className="flex flex-col gap-4">
          {/* dApp Info */}
          {dappMetadata && (
            <div className="bg-base-200 rounded-box p-4">
              <div className="mb-2 flex items-center gap-3">
                {dappMetadata.icons?.[0] && (
                  <img src={dappMetadata.icons[0]} alt={dappMetadata.name} className="h-12 w-12 rounded" />
                )}
                <div>
                  <h4 className="text-lg font-bold">{dappMetadata.name}</h4>
                  <p className="text-sm text-gray-500">{dappMetadata.url}</p>
                </div>
              </div>
              <p className="text-sm">{dappMetadata.description}</p>
            </div>
          )}

          {/* Transaction Details */}
          <div className="bg-base-200 rounded-box divide-base-100 flex max-h-80 flex-col divide-y overflow-y-auto shadow-md">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-semibold">To</span>
              <span className="max-w-[60%] truncate font-mono text-sm" title={txParams.to}>
                {txParams.to}
              </span>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-semibold">Value (wei)</span>
              <span className="font-mono text-sm">{txParams.value || "0"}</span>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-semibold">Value (ETH)</span>
              <span>{txParams.value ? formatEther(BigInt(txParams.value)) : "0"}</span>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-semibold">Operation</span>
              <span>0 (Call)</span>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-semibold">Data</span>
              <div className="flex flex-col items-end gap-2">
                {txParams.data && txParams.data !== "0x" ? (
                  <>
                    <DataPreview value={txParams.data} />
                    {chain && (
                      <a
                        href={`https://tools.cyfrin.io/abi-encoding?data=${encodeURIComponent(txParams.data)}`}
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

            {txParams.gas && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="font-semibold">Gas Limit</span>
                <span className="font-mono text-sm">{txParams.gas}</span>
              </div>
            )}

            {txParams.gasPrice && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="font-semibold">Gas Price</span>
                <span className="font-mono text-sm">{txParams.gasPrice}</span>
              </div>
            )}

            {txParams.maxFeePerGas && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="font-semibold">Max Fee Per Gas</span>
                <span className="font-mono text-sm">{txParams.maxFeePerGas}</span>
              </div>
            )}

            {txParams.maxPriorityFeePerGas && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="font-semibold">Max Priority Fee Per Gas</span>
                <span className="font-mono text-sm">{txParams.maxPriorityFeePerGas}</span>
              </div>
            )}
          </div>

          {/* Custom Nonce */}
          <div className="bg-base-200 rounded-box p-4">
            <h5 className="mb-2 font-semibold">Custom Nonce (optional)</h5>
            <input
              type="number"
              className="input input-bordered w-full"
              placeholder={`Leave empty for current nonce (${safeInfo?.nonce ?? ""})`}
              value={customNonce}
              onChange={(e) => setCustomNonce(e.target.value)}
              min="0"
              data-testid="wc-tx-nonce-input"
            />
            <div className="mt-1 text-sm text-gray-500">Current Safe nonce: {safeInfo?.nonce ?? "-"}</div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex gap-2">
            <button
              className="btn btn-error btn-outline"
              onClick={handleReject}
              disabled={isProcessing}
              data-testid="wc-tx-reject-btn"
            >
              {isProcessing ? <span className="loading loading-spinner loading-sm"></span> : "Reject"}
            </button>
            <div
              className="tooltip tooltip-top flex-1"
              data-tip="Responds immediately with Safe tx hash. Use for dApps that don't need to track your exact on-chain transaction."
            >
              <button
                className="btn btn-success w-full"
                onClick={handleApprove}
                disabled={isProcessing}
                data-testid="wc-tx-approve-btn"
              >
                {isProcessing ? (
                  <div className="flex items-center gap-2">
                    <span className="loading loading-spinner loading-sm"></span>
                    <span>Creating...</span>
                  </div>
                ) : (
                  "Create (Quick Response)"
                )}
              </button>
            </div>
            <div
              className="tooltip tooltip-top flex-1"
              data-tip="Waits until you execute, then sends the real on-chain tx hash. Use for ENS, Uniswap, or dApps that track your transaction."
            >
              <button
                className="btn btn-success w-full"
                onClick={handleApproveAndWait}
                disabled={isProcessing}
                data-testid="wc-tx-approve-wait-btn"
              >
                {isProcessing ? (
                  <div className="flex items-center gap-2">
                    <span className="loading loading-spinner loading-sm"></span>
                    <span>Creating...</span>
                  </div>
                ) : (
                  "Create (And wait for execution)"
                )}
              </button>
            </div>
          </div>
        </div>
      </AppCard>
    </AppSection>
  );
}
