"use client";

import React, { useState, useMemo, useEffect } from "react";
import Modal from "./Modal";
import { useNavigate } from "react-router-dom";
import { encodeFunctionData, parseUnits } from "viem";
import useSafe from "@/app/hooks/useSafe";
import { useSafeTxContext } from "@/app/provider/SafeTxProvider";
import { EthSafeTransaction } from "@safe-global/protocol-kit";
import { useAccount } from "wagmi";

interface TokenTransferModalProps {
  open: boolean;
  onClose: () => void;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenBalance: string;
  safeAddress: string;
}

const ERC20_TRANSFER_ABI = [
  {
    constant: false,
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    type: "function",
  },
] as const;

export default function TokenTransferModal({
  open,
  onClose,
  tokenAddress,
  tokenSymbol,
  tokenDecimals,
  tokenBalance,
  safeAddress,
}: TokenTransferModalProps) {
  const navigate = useNavigate();
  const { chain } = useAccount();
  const { buildSafeTransaction, getSafeTransactionHash, safeInfo } = useSafe(safeAddress as `0x${string}`);
  const { getAllTransactions } = useSafeTxContext();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [customNonce, setCustomNonce] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [nonceWarning, setNonceWarning] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);

  // Calculate next available nonce
  const chainId = chain?.id ? String(chain.id) : undefined;
  const queuedTransactions = getAllTransactions(safeAddress as `0x${string}`, chainId);
  const nextAvailableNonce = useMemo(() => {
    if (!safeInfo) return 0;

    // Find highest nonce in queue
    const queuedNonces = queuedTransactions.map((tx: EthSafeTransaction) => Number(tx.data.nonce));
    const highestQueued = queuedNonces.length > 0 ? Math.max(...queuedNonces) : safeInfo.nonce - 1;

    // Next available is highest queued + 1, or current Safe nonce if nothing queued
    return Math.max(highestQueued + 1, safeInfo.nonce);
  }, [safeInfo, queuedTransactions]);

  // Set default nonce to next available
  useEffect(() => {
    if (nextAvailableNonce !== undefined) {
      setCustomNonce(String(nextAvailableNonce));
    }
  }, [nextAvailableNonce]);

  // Validate nonce whenever it changes
  useEffect(() => {
    if (!customNonce || !safeInfo) {
      setNonceWarning(null);
      return;
    }

    const nonce = parseInt(customNonce, 10);
    if (isNaN(nonce)) {
      setNonceWarning(null);
      return;
    }

    // Check if nonce is already used on-chain
    if (nonce < safeInfo.nonce) {
      setNonceWarning(`⚠️ This nonce (${nonce}) has already been executed on-chain. Current on-chain nonce is ${safeInfo.nonce}.`);
      return;
    }

    // Check if nonce is already in queue
    const nonceInQueue = queuedTransactions.some((tx: EthSafeTransaction) => Number(tx.data.nonce) === nonce);
    if (nonceInQueue) {
      setNonceWarning(`⚠️ A transaction with nonce ${nonce} is already queued. Building this will overwrite it.`);
      return;
    }

    setNonceWarning(null);
  }, [customNonce, safeInfo, queuedTransactions]);

  async function handleTransfer() {
    setError(null);

    // Validate recipient address
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      setError("Invalid recipient address");
      return;
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Amount must be a positive number");
      return;
    }

    // Check balance
    const balanceNum = parseFloat(tokenBalance);
    if (amountNum > balanceNum) {
      setError(`Insufficient balance. You have ${balanceNum} ${tokenSymbol}`);
      return;
    }

    setIsBuilding(true);

    try {
      // Convert amount to wei/token units
      const amountInUnits = parseUnits(amount, tokenDecimals);

      // Encode the transfer function call
      const data = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [recipient as `0x${string}`, amountInUnits],
      });

      // Parse custom nonce if provided
      const nonce = customNonce ? parseInt(customNonce, 10) : undefined;
      if (customNonce && (isNaN(nonce!) || nonce! < 0)) {
        setError("Invalid nonce value");
        setIsBuilding(false);
        return;
      }

      // Build the Safe transaction
      const safeTx = await buildSafeTransaction([
        {
          to: tokenAddress,
          value: "0",
          data: data,
          operation: 0,
        },
      ], nonce);

      if (!safeTx) {
        setError("Failed to build transaction");
        setIsBuilding(false);
        return;
      }

      // Get transaction hash
      const hash = await getSafeTransactionHash(safeTx);

      // Navigate to the transaction signing page
      navigate(`/safe/${safeAddress}/tx/${hash}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create transfer transaction");
      setIsBuilding(false);
    }
  }

  function handleMaxClick() {
    setAmount(tokenBalance);
  }

  function handleClose() {
    setRecipient("");
    setAmount("");
    setCustomNonce("");
    setError(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} showCloseButton={false}>
      <h2 className="mb-4 text-2xl font-bold">Transfer {tokenSymbol}</h2>

      <div className="mb-4">
        <p className="text-sm opacity-70">
          Token: <span className="font-mono">{tokenAddress}</span>
        </p>
        <p className="text-sm opacity-70">
          Available:{" "}
          <span className="font-semibold">
            {parseFloat(tokenBalance).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 4,
            })}{" "}
            {tokenSymbol}
          </span>
        </p>
      </div>

      {/* Recipient Input */}
      <div className="mb-4">
        <label className="label">
          <span className="label-text font-semibold">Recipient Address</span>
        </label>
        <input
          type="text"
          className="input input-bordered w-full font-mono text-sm"
          placeholder="0x..."
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          pattern="^0x[a-fA-F0-9]{40}$"
        />
      </div>

      {/* Amount Input */}
      <div className="mb-4">
        <label className="label">
          <span className="label-text font-semibold">Amount</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            className="input input-bordered flex-1 font-mono text-sm"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            className="btn btn-outline btn-sm"
            onClick={handleMaxClick}
          >
            Max
          </button>
        </div>
      </div>

      {/* Nonce Input */}
      <div className="mb-4">
        <label className="label">
          <span className="label-text font-semibold">Transaction Nonce</span>
        </label>
        <div className="alert alert-info mb-2 text-xs">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            className="stroke-current shrink-0 w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
          <div>
            <p className="font-semibold">Auto-selected: Next Available Nonce</p>
            <p>Set to {nextAvailableNonce}. You can change it manually if needed.</p>
          </div>
        </div>
        {nonceWarning && (
          <div className="alert alert-warning mb-2 text-xs">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-4 w-4"
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
            <div>
              {nonceWarning}
            </div>
          </div>
        )}
        <input
          type="number"
          className={`input input-bordered input-sm w-full ${nonceWarning ? "input-warning" : ""}`}
          placeholder={`Next available: ${nextAvailableNonce}`}
          value={customNonce}
          onChange={(e) => setCustomNonce(e.target.value)}
          min="0"
        />
        <label className="label">
          <span className="label-text-alt">
            On-chain nonce: {safeInfo?.nonce ?? "-"} | Queued transactions: {queuedTransactions.length}
          </span>
        </label>
      </div>

      {error && <div className="alert alert-error mb-4 text-sm">{error}</div>}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost btn-sm" onClick={handleClose} disabled={isBuilding}>
          Cancel
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleTransfer}
          disabled={!recipient || !amount || isBuilding}
        >
          {isBuilding ? "Creating Transaction..." : "Create Transfer Transaction"}
        </button>
      </div>
    </Modal>
  );
}
