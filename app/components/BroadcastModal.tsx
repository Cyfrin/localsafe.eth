import React from "react";
import AppAddress from "@/app/components/AppAddress";

export interface BroadcastModalProps {
  open: boolean;
  txHash?: string | null;
  error?: string | null;
  blockExplorerUrl?: string;
  onClose: () => void;
  closeLabel?: string;
  onSuccess?: () => void;
  successLabel?: string;
  testid?: string;
}

/**
 * A modal component to display the status of a broadcasted transaction.
 *
 * @param {boolean} open - Whether the modal is open or not.
 * @param {string | null} [txHash] - The transaction hash of the broadcasted transaction.
 * @param {string | null} [error] - An error message if the broadcast failed.
 * @param {string} [blockExplorerUrl] - The base URL of the block explorer to link to the transaction.
 * @param {() => void} onClose - Function to call when closing the modal.
 * @param {string} [closeLabel="Close"] - Label for the close button.
 * @param {() => void} [onSuccess] - Function to call when the success button is clicked.
 * @param {string} [successLabel="Back to Safe"] - Label for the success button.
 * @param {string} [testid="broadcast-modal"] - Test ID for testing purposes.
 * @returns A modal component displaying the transaction status.
 */
const BroadcastModal: React.FC<BroadcastModalProps> = ({
  open,
  txHash,
  error,
  blockExplorerUrl,
  onClose,
  closeLabel = "Close",
  onSuccess,
  successLabel = "Back to Safe",
  testid = "broadcast-modal",
}) => {
  if (!open) return null;
  return (
    <dialog
      id="broadcast_modal"
      className="modal modal-bottom sm:modal-middle"
      open
      data-testid={testid}
    >
      <div className="modal-box flex !max-w-2xl flex-col gap-6 p-8">
        <div className="text-base-content font-bold">
          Broadcasting transaction
        </div>

        <div className="mb-4">
          {txHash && (
            <div className="mt-2" data-testid="broadcast-modal-txhash-row">
              <span className="font-semibold">Transaction Hash:</span>
              {blockExplorerUrl ? (
                <a
                  href={`${blockExplorerUrl}/tx/${encodeURIComponent(txHash)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link link-primary ml-2"
                  data-testid="broadcast-modal-txhash-link"
                >
                  <AppAddress address={txHash} className="text-xs" />
                </a>
              ) : (
                <AppAddress
                  address={txHash}
                  className="ml-2 text-xs"
                  testid="broadcast-modal-txhash"
                />
              )}
            </div>
          )}
          {error && (
            <div
              className="alert alert-error mt-4 w-full max-w-full overflow-x-auto break-words"
              data-testid="broadcast-modal-error-row"
            >
              <pre className="text-xs whitespace-pre-wrap">{error}</pre>
            </div>
          )}
        </div>
        <div
          className="flex justify-center gap-4"
          data-testid="broadcast-modal-actions"
        >
          {onSuccess && successLabel && !error ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onSuccess()}
              data-testid="broadcast-modal-success-btn"
            >
              {successLabel}
            </button>
          ) : (
            <button
              type="button"
              disabled={!error}
              className="btn btn-secondary"
              onClick={onClose}
              data-testid="broadcast-modal-close-btn"
            >
              {closeLabel}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
};

export { BroadcastModal };
