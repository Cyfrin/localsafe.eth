import React from "react";
import AppAddress from "@/app/components/AppAddress";
import { DeploymentModalProps } from "../utils/types";

/**
 * DeploymentModal Component
 *
 * This component displays a modal dialog to show the progress of a deployment workflow.
 * It includes steps with their statuses, transaction hash (if available), error messages,
 * and action buttons for closing the modal or proceeding after a successful deployment.
 *
 * @param {boolean} open - Indicates if the modal is open.
 * @param {Array<{ step: string; status: string }>} steps - Array of steps with their statuses.
 * @param {Record<string, string>} stepLabels - Labels for each step.
 * @param {string} [txHash] - Optional transaction hash to display.
 * @param {string} [error] - Optional error message to display.
 * @param {import("wagmi").Chain | null} [selectedNetwork] - The selected network information.
 * @param {() => void} onClose - Function to call when closing the modal.
 * @param {string} [closeLabel="Close"] - Label for the close button.
 * @param {() => void} [onSuccess] - Function to call when the success button is clicked.
 * @param {string} [successLabel="Back to Safe"] - Label for the success button.
 * @returns A modal component displaying the deployment workflow progress.
 */
export default function DeploymentModal({
  open,
  steps,
  stepLabels,
  txHash,
  error,
  selectedNetwork,
  onClose,
  closeLabel = "Close",
  onSuccess,
  successLabel,
}: DeploymentModalProps) {
  if (!open) return null;
  return (
    <dialog
      id="workflow_modal"
      className="modal modal-bottom sm:modal-middle"
      open
      data-testid="deployment-modal-root"
    >
      <div
        className="modal-box flex !max-w-3xl flex-col gap-6 p-8"
        data-testid="deployment-modal-box"
      >
        <h3
          className="mb-4 text-lg font-bold"
          data-testid="deployment-modal-title"
        >
          Workflow Progress
        </h3>
        <div className="mb-4" data-testid="deployment-modal-steps">
          <ul
            className="steps w-full"
            data-testid="deployment-modal-steps-list"
          >
            {steps.map((step: { step: string; status: string }) => {
              let stepClass = "step ";
              if (step.status === "running") stepClass += "step-primary";
              else if (step.status === "success") stepClass += "step-success";
              else if (step.status === "error") stepClass += "step-error";
              return (
                <li
                  key={step.step}
                  className={stepClass}
                  data-testid={`deployment-modal-step-${step.step}`}
                >
                  {step.status === "running" ? (
                    <span
                      className="loading loading-spinner loading-xs"
                      data-testid={`deployment-modal-step-loading-${step.step}`}
                    />
                  ) : null}
                  {stepLabels[step.step]}
                </li>
              );
            })}
          </ul>
          {txHash && (
            <div className="mt-4">
              <span className="font-semibold">Transaction Hash:</span>
              {selectedNetwork &&
              selectedNetwork.blockExplorers?.default?.url ? (
                <a
                  href={`${selectedNetwork.blockExplorers.default.url}/tx/${encodeURIComponent(txHash)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link link-primary ml-2"
                  data-testid="deployment-modal-txhash-link"
                >
                  <AppAddress
                    address={txHash}
                    className="text-xs"
                    testid="deployment-modal-txhash"
                  />
                </a>
              ) : (
                <AppAddress
                  address={txHash}
                  className="ml-2 text-xs"
                  testid="deployment-modal-txhash"
                />
              )}
            </div>
          )}
          {error && (
            <div
              className="alert alert-error mt-4 w-full max-w-full overflow-x-auto break-words"
              data-testid="deployment-modal-error"
            >
              <pre className="text-xs whitespace-pre-wrap">{error}</pre>
            </div>
          )}
        </div>
        <div
          className="flex justify-center gap-4"
          data-testid="deployment-modal-actions"
        >
          {onSuccess && successLabel && !error ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onSuccess()}
              data-testid="deployment-modal-success-btn"
            >
              {successLabel}
            </button>
          ) : (
            <button
              type="button"
              disabled={!error}
              className="btn btn-secondary"
              onClick={onClose}
              data-testid="deployment-modal-close-btn"
            >
              {closeLabel}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
