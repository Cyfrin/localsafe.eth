import { type Chain } from "viem";
import AppAddress from "@/app/components/AppAddress";

interface SafeDetailsProps {
  safeName: string;
  selectedNetworks: Chain[] | undefined;
  signers: string[];
  threshold: number;
}

export default function SafeDetails({
  safeName,
  selectedNetworks,
  signers,
  threshold,
}: SafeDetailsProps) {
  return (
    <div className="flex flex-col gap-2" data-testid="safe-details-root">
      <div>
        <p className="mb-2 text-lg font-medium">Safe Name:</p>
        <span
          className="badge badge-info badge-outline text-base font-bold"
          data-testid="safe-details-name"
        >
          {safeName}
        </span>
      </div>
      <div className="divider my-0" />
      <div>
        <p className="mb-2 text-lg font-medium">Selected Networks:</p>
        <div
          className="flex flex-wrap gap-2"
          data-testid="safe-details-networks"
        >
          {!selectedNetworks || selectedNetworks.length === 0 ? (
            <span
              className="badge badge-outline text-base-content"
              data-testid="safe-details-networks-none"
            >
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
          <div
            className="badge badge-outline"
            data-testid="safe-details-signers-none"
          >
            No signers added
          </div>
        ) : (
          <div
            className="flex flex-col gap-2"
            data-testid="safe-details-signers"
          >
            {signers.map((address, idx) =>
              address ? (
                <div
                  key={idx}
                  className="flex flex-wrap rounded"
                  data-testid={`safe-details-signer-${idx}`}
                >
                  <AppAddress
                    address={`${idx + 1}. ${address}`}
                    className="text-sm"
                  />
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>
      <div className="divider my-0" />
      <div>
        <p className="mb-2 text-lg font-medium">Threshold:</p>
        <div
          className="flex flex-wrap items-center gap-2 p-2"
          data-testid="safe-details-threshold"
        >
          <span
            className="badge badge-success text-base font-bold"
            data-testid="safe-details-threshold-value"
          >
            {threshold} / {signers.length}
          </span>
          <span className="text-sm">signers required</span>
        </div>
      </div>
    </div>
  );
}
