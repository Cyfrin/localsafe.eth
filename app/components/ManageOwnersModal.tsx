"use client";

import { useState, useEffect } from "react";
import { isAddress } from "viem";
import AppAddress from "./AppAddress";
import AddressInput from "./AddressInput";

type OwnerChange = {
  type: "add" | "remove";
  address: string;
};

type ManageOwnersModalProps = {
  open: boolean;
  onClose: () => void;
  owners: string[];
  threshold: number;
  onBatchUpdate: (changes: OwnerChange[], newThreshold: number) => Promise<void>;
};

export default function ManageOwnersModal({ open, onClose, owners, threshold, onBatchUpdate }: ManageOwnersModalProps) {
  const [newOwnerInput, setNewOwnerInput] = useState("");
  const [newOwnerAddress, setNewOwnerAddress] = useState<string | undefined>();
  const [ownersToRemove, setOwnersToRemove] = useState<Set<string>>(new Set());
  const [ownersToAdd, setOwnersToAdd] = useState<string[]>([]);
  const [newThreshold, setNewThreshold] = useState(threshold);
  const [isProcessing, setIsProcessing] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setOwnersToRemove(new Set());
      setOwnersToAdd([]);
      setNewThreshold(threshold);
      setNewOwnerInput("");
      setNewOwnerAddress(undefined);
    }
  }, [open, threshold]);

  // Calculate the projected final owner count
  const finalOwnerCount = owners.length - ownersToRemove.size + ownersToAdd.length;

  const hasChanges = ownersToRemove.size > 0 || ownersToAdd.length > 0 || newThreshold !== threshold;

  const handleAddOwnerToQueue = () => {
    if (!newOwnerAddress || !isAddress(newOwnerAddress)) {
      alert("Invalid address");
      return;
    }

    const normalizedAddress = newOwnerAddress.toLowerCase();

    // Check if already an owner
    if (owners.some((o) => o.toLowerCase() === normalizedAddress)) {
      alert("This address is already an owner");
      return;
    }

    // Check if already in the add queue
    if (ownersToAdd.some((o) => o.toLowerCase() === normalizedAddress)) {
      alert("This address is already queued to be added");
      return;
    }

    // Check if it's in the remove queue (if so, remove it from there instead of adding)
    if (ownersToRemove.has(normalizedAddress)) {
      alert("This address is queued for removal. Remove it from the removal queue first.");
      return;
    }

    setOwnersToAdd([...ownersToAdd, newOwnerAddress]);
    setNewOwnerInput("");
    setNewOwnerAddress(undefined);
  };

  const handleToggleRemoveOwner = (owner: string) => {
    const normalizedOwner = owner.toLowerCase();
    const newSet = new Set(ownersToRemove);

    if (newSet.has(normalizedOwner)) {
      newSet.delete(normalizedOwner);
    } else {
      newSet.add(normalizedOwner);
    }

    setOwnersToRemove(newSet);
  };

  const handleRemoveFromAddQueue = (index: number) => {
    setOwnersToAdd(ownersToAdd.filter((_, i) => i !== index));
  };

  const handleCreateTransaction = async () => {
    // Validate threshold
    if (newThreshold < 1 || newThreshold > finalOwnerCount) {
      alert(`Threshold must be between 1 and ${finalOwnerCount} (final owner count)`);
      return;
    }

    if (!hasChanges) {
      alert("No changes to apply");
      return;
    }

    setIsProcessing(true);
    try {
      // Build changes array
      const changes: OwnerChange[] = [
        ...Array.from(ownersToRemove).map((addr) => ({
          type: "remove" as const,
          address: addr,
        })),
        ...ownersToAdd.map((addr) => ({
          type: "add" as const,
          address: addr,
        })),
      ];

      await onBatchUpdate(changes, newThreshold);
      alert("Transaction created! Sign and broadcast it to apply the changes.");
      onClose();
    } catch (error) {
      console.error("Failed to create batch update:", error);
      alert(`Failed to create transaction: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Manage Owners & Threshold</h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose} disabled={isProcessing}>
            ✕
          </button>
        </div>

        <div className="alert alert-info mb-4">
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
          <span className="text-sm">
            Queue up multiple owner changes and update the threshold. All changes will be batched into a single
            transaction using MultiSend.
          </span>
        </div>

        {/* Current vs Final State */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="bg-base-200 rounded-box p-4">
            <h4 className="mb-2 font-semibold">Current State</h4>
            <div className="flex justify-between">
              <span>Owners:</span>
              <span className="font-bold">{owners.length}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>Threshold:</span>
              <span className="font-bold">{threshold}</span>
            </div>
          </div>
          <div className="bg-base-200 rounded-box p-4">
            <h4 className="mb-2 font-semibold">Final State</h4>
            <div className="flex justify-between">
              <span>Owners:</span>
              <span className={`font-bold ${finalOwnerCount !== owners.length ? "text-primary" : ""}`}>
                {finalOwnerCount}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>Threshold:</span>
              <span className={`font-bold ${newThreshold !== threshold ? "text-primary" : ""}`}>{newThreshold}</span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Add Owners Section */}
          <div className="border-base-300 rounded-box border p-4">
            <h4 className="mb-3 font-semibold">Add Owners</h4>
            <div className="mb-3 flex gap-2">
              <AddressInput
                value={newOwnerInput}
                onChange={setNewOwnerInput}
                onResolvedAddressChange={setNewOwnerAddress}
                disabled={isProcessing}
              />
              <button
                className="btn btn-primary"
                onClick={handleAddOwnerToQueue}
                disabled={isProcessing || !newOwnerAddress}
              >
                Add to Queue
              </button>
            </div>

            {ownersToAdd.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Queued to Add:</p>
                {ownersToAdd.map((addr, idx) => (
                  <div key={idx} className="bg-success bg-opacity-10 flex items-center justify-between rounded p-2">
                    <AppAddress address={addr as `0x${string}`} className="text-sm" />
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => handleRemoveFromAddQueue(idx)}
                      disabled={isProcessing}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Remove Owners Section */}
          <div className="border-base-300 rounded-box border p-4">
            <h4 className="mb-3 font-semibold">Remove Owners</h4>
            <p className="mb-3 text-sm text-gray-500">Click owners to toggle removal</p>

            <div className="max-h-64 space-y-2 overflow-y-auto">
              {owners.map((owner) => {
                const isMarkedForRemoval = ownersToRemove.has(owner.toLowerCase());
                return (
                  <div
                    key={owner}
                    className={`flex cursor-pointer items-center justify-between rounded p-2 transition-colors ${
                      isMarkedForRemoval
                        ? "bg-error bg-opacity-10 border-error border"
                        : "bg-base-200 hover:bg-base-300"
                    }`}
                    onClick={() => handleToggleRemoveOwner(owner)}
                  >
                    <AppAddress address={owner as `0x${string}`} className="text-sm" />
                    {isMarkedForRemoval && <span className="badge badge-error badge-sm">Removing</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Change Threshold Section */}
          <div className="border-base-300 rounded-box border p-4">
            <h4 className="mb-3 font-semibold">New Threshold</h4>
            <input
              type="number"
              className="input input-bordered w-full"
              min="1"
              max={finalOwnerCount}
              value={newThreshold}
              onChange={(e) => setNewThreshold(parseInt(e.target.value) || 1)}
              disabled={isProcessing}
            />
            <label className="label">
              <span className="label-text-alt">Must be between 1 and {finalOwnerCount} (final owner count)</span>
            </label>
          </div>
        </div>

        {/* Summary */}
        {hasChanges && (
          <div className="alert alert-warning mt-4">
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
              <p className="font-semibold">Changes Summary:</p>
              <ul className="list-inside list-disc">
                {ownersToRemove.size > 0 && <li>Remove {ownersToRemove.size} owner(s)</li>}
                {ownersToAdd.length > 0 && <li>Add {ownersToAdd.length} owner(s)</li>}
                {newThreshold !== threshold && (
                  <li>
                    Change threshold from {threshold} to {newThreshold}
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose} disabled={isProcessing}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleCreateTransaction} disabled={isProcessing || !hasChanges}>
            {isProcessing ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Creating Transaction...
              </>
            ) : (
              "Create Batched Transaction"
            )}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  );
}
