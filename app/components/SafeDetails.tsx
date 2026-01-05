import { type Chain } from "viem";
import AppAddress from "@/app/components/AppAddress";

interface SafeDetailsProps {
  safeName: string;
  selectedNetworks: Chain[] | undefined;
  signers: string[];
  threshold: number;
}

/**
 * SafeDetails Component
 *
 * This component displays the details of a Safe, including its name, selected networks,
 * list of signers, and the threshold for transaction approvals.
 *
 * @param {string} safeName - The name of the Safe.
 * @param {Chain[] | undefined} selectedNetworks - An array of selected network objects.
 * @param {string[]} signers - An array of signer addresses.
 * @param {number} threshold - The number of required signatures for transaction approval.
 * @returns A component displaying the Safe's details in a structured format.
 */
export default function SafeDetails({ safeName, selectedNetworks, signers, threshold }: SafeDetailsProps) {
  return (
    <div className="flex flex-col gap-2" data-testid="safe-details-root">
      <div>
        <p className="mb-2 text-lg font-medium">Safe Name:</p>
        <span className="badge badge-info badge-outline text-base font-bold" data-testid="safe-details-name">
          {safeName}
        </span>
      </div>
      <div className="divider my-0" />
      <div>
        <p className="mb-2 text-lg font-medium">Selected Networks:</p>
        <div className="flex flex-wrap gap-2" data-testid="safe-details-networks">
          {!selectedNetworks || selectedNetworks.length === 0 ? (
            <span className="badge badge-outline text-base-content" data-testid="safe-details-networks-none">
              None selected
            </span>
          ) : (
            selectedNetworks.map((network) => (
              <span
                key={network.id}
                className="badge badge-accent badge-outline"
                data-testid={`safe-details-network-${network.id}`}
              >
                {network.name}
              </span>
            ))
          )}
        </div>
      </div>
      <div className="divider my-0" />
      <div>
        <p className="mb-2 text-lg font-medium">Signers:</p>
        {signers.length === 0 || signers.every((s) => !s) ? (
          <div className="badge badge-outline" data-testid="safe-details-signers-none">
            No signers added
          </div>
        ) : (
          <div className="flex flex-col gap-2" data-testid="safe-details-signers">
            {signers.map((address, idx) =>
              address ? (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-1 rounded"
                  data-testid={`safe-details-signer-${idx}`}
                >
                  <span className="text-sm font-medium">{idx + 1}.</span>
                  <AppAddress address={address} className="text-sm" />
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>
      <div className="divider my-0" />
      <div>
        <p className="mb-2 text-lg font-medium">Threshold:</p>
        <div className="flex flex-wrap items-center gap-2 p-2" data-testid="safe-details-threshold">
          <span className="badge badge-success text-base font-bold" data-testid="safe-details-threshold-value">
            {threshold} / {signers.length}
          </span>
          <span className="text-sm">signers required</span>
        </div>
      </div>
    </div>
  );
}
