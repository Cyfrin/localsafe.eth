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

export default function WalletConnectTxClient({
  safeAddress,
}: {
  safeAddress: `0x${string}`;
}) {
  const navigate = useNavigate();
  const { chain } = useAccount();
  const { pendingRequest, rejectRequest, clearPendingRequest } = useWalletConnect();
  const { buildSafeTransaction, kit, safeInfo } = useSafe(safeAddress);

  const [txParams, setTxParams] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [requestFromStorage, setRequestFromStorage] = useState<any>(null);
  const [customNonce, setCustomNonce] = useState<string>("");

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
      const safeTx = await buildSafeTransaction([
        {
          to: txParams.to,
          value: txParams.value || "0",
          data: txParams.data || "0x",
          operation: 0,
        },
      ], nonce);

      if (!safeTx) {
        throw new Error("Failed to build Safe transaction");
      }

      // Get the Safe transaction hash
      const safeTxHash = await kit?.getTransactionHash(safeTx);

      // For Safe wallets, we need to reject the request since we can't provide an immediate tx hash
      // The user will sign and broadcast the Safe transaction separately
      await rejectRequest(currentRequest.topic, {
        code: 4001,
        message: "Safe transaction created. Please sign and broadcast it separately.",
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

  const handleReject = async () => {
    if (!currentRequest) return;

    console.log("🔴 handleReject called");
    console.log("🔴 currentRequest:", currentRequest);
    console.log("🔴 currentRequest.topic:", currentRequest.topic);
    console.log("🔴 currentRequest.id:", currentRequest.id);

    setIsProcessing(true);
    try {
      await rejectRequest(
        currentRequest.topic,
        {
          code: 4001,
          message: "User rejected the request",
        },
        currentRequest.id // Pass the request ID
      );
      console.log("🔴 rejectRequest completed successfully");
    } catch (error) {
      console.error("🔴 Failed to reject transaction:", error);
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
          <div className="text-center py-8">
            <p>No pending transaction request found.</p>
            <button
              className="btn btn-primary mt-4"
              onClick={() => navigate(`/safe/${safeAddress}`)}
            >
              Back to Safe
            </button>
          </div>
        </AppCard>
      </AppSection>
    );
  }

  const dappMetadata = (currentRequest.params as any)?.proposer?.metadata || (currentRequest.verifyContext as any)?.verified?.metadata;

  return (
    <AppSection testid="wc-tx-section">
      <div className="mb-4">
        <button
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            if (currentRequest) {
              try {
                console.log("🔴 Rejecting request:", currentRequest.id);
                await rejectRequest(
                  currentRequest.topic,
                  {
                    code: 4001,
                    message: "User cancelled the request",
                  },
                  currentRequest.id // Pass the request ID
                );
                console.log("🔴 Request rejected successfully");
              } catch (error) {
                console.error("🔴 Failed to reject request:", error);
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
              <div className="flex items-center gap-3 mb-2">
                {dappMetadata.icons?.[0] && (
                  <img
                    src={dappMetadata.icons[0]}
                    alt={dappMetadata.name}
                    className="w-12 h-12 rounded"
                  />
                )}
                <div>
                  <h4 className="font-bold text-lg">{dappMetadata.name}</h4>
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
              <span className="font-mono text-sm">
                {txParams.value || "0"}
              </span>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-semibold">Value (ETH)</span>
              <span>
                {txParams.value
                  ? formatEther(BigInt(txParams.value))
                  : "0"}
              </span>
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
                        href={`https://tools.cyfrin.io/abi-encoding?data=${txParams.data}`}
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
            <h5 className="font-semibold mb-2">Custom Nonce (optional)</h5>
            <input
              type="number"
              className="input input-bordered w-full"
              placeholder={`Leave empty for current nonce (${safeInfo?.nonce ?? ""})`}
              value={customNonce}
              onChange={(e) => setCustomNonce(e.target.value)}
              min="0"
              data-testid="wc-tx-nonce-input"
            />
            <div className="text-sm text-gray-500 mt-1">
              Current Safe nonce: {safeInfo?.nonce ?? "-"}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 mt-4">
            <button
              className="btn btn-error btn-outline flex-1"
              onClick={handleReject}
              disabled={isProcessing}
              data-testid="wc-tx-reject-btn"
            >
              {isProcessing ? (
                <span className="loading loading-spinner loading-sm"></span>
              ) : (
                "Reject"
              )}
            </button>
            <button
              className="btn btn-success flex-1"
              onClick={handleApprove}
              disabled={isProcessing}
              data-testid="wc-tx-approve-btn"
            >
              {isProcessing ? (
                <div className="flex items-center gap-2">
                  <span className="loading loading-spinner loading-sm"></span>
                  <span>Creating Transaction...</span>
                </div>
              ) : (
                "Create Safe Transaction"
              )}
            </button>
          </div>

          <div className="alert alert-warning">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex flex-col">
              <span className="font-semibold">Safe Wallet Workflow</span>
              <span className="text-sm">
                Clicking &quot;Create Safe Transaction&quot; will build a multi-sig transaction that requires signing and broadcasting.
                The dApp request will be rejected since Safe transactions cannot provide an immediate transaction hash.
              </span>
            </div>
          </div>
        </div>
      </AppCard>
    </AppSection>
  );
}
