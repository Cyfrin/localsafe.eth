"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { verifyDeployments } from "../vendor/safe";
import type { ContractAddresses, DeploymentTrustResult, DeploymentTrustStatus } from "../vendor/safe";

type TrustedDeploymentsModalProps = {
  open: boolean;
  onClose: () => void;
  chainId: string;
  /** Effective contract set for this chain (network config + per-Safe overrides). */
  contracts: ContractAddresses;
  /** Previously confirmed set, if any. */
  confirmed?: ContractAddresses;
  onConfirm: (addresses: ContractAddresses) => void;
};

const STATUS_LABEL: Record<DeploymentTrustStatus, string> = {
  trusted: "[trusted] known safe deployment",
  "verified-bytecode": "[verified] bytecode matches an official safe build",
  "user-confirmed": "[user-confirmed] you trusted this address",
  "no-code": "[no code] nothing is deployed at this address",
  unverified: "[unverified] unknown contract",
};

/**
 * Review-and-trust dialog for a chain's Safe infrastructure contracts.
 *
 * Shown when batching or Safe creation would use contracts that are neither known
 * deployments nor bytecode-verified. Confirming records the current effective address
 * set for this chain in wallet data; changing addresses still happens in network
 * settings, so the confirmation always applies to exactly what will be used.
 */
export default function TrustedDeploymentsModal({
  open,
  onClose,
  chainId,
  contracts,
  confirmed,
  onConfirm,
}: TrustedDeploymentsModalProps) {
  const publicClient = usePublicClient();
  const [results, setResults] = useState<DeploymentTrustResult[] | null>(null);

  useEffect(() => {
    if (!open || !publicClient) return;
    let cancelled = false;
    verifyDeployments({
      client: publicClient,
      chainId,
      contracts,
      fields: Object.keys(contracts) as Array<keyof ContractAddresses>,
      confirmed,
    })
      .then((res) => {
        if (!cancelled) setResults(res);
      })
      .catch(() => {
        if (!cancelled) setResults(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, publicClient, chainId, contracts, confirmed]);

  if (!open) return null;

  const unverified = results?.filter((r) => r.status === "unverified") ?? [];
  const noCode = results?.filter((r) => r.status === "no-code") ?? [];

  function handleConfirm() {
    onConfirm(contracts);
    onClose();
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Review Safe Deployments</h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="mb-4 text-sm opacity-70">
          These are the Safe infrastructure contracts this app will use on chain {chainId}. Batched transactions
          delegatecall into MultiSendCallOnly, and new Safes are created through the factory and singleton — only
          continue if you trust these contracts.
        </p>

        <div className="space-y-3 font-mono text-xs">
          {results === null && <p className="opacity-60">verifying on-chain code...</p>}
          {results?.map((result) => (
            <div key={result.field} data-testid={`trust-row-${result.field}`}>
              <div className="opacity-60">{result.field.replace(/Address$/, "")}</div>
              <div className="break-all">{result.address}</div>
              <div
                className={
                  result.status === "no-code" || result.status === "unverified" ? "text-warning" : "opacity-60"
                }
              >
                {STATUS_LABEL[result.status]}
              </div>
            </div>
          ))}
        </div>

        {noCode.length > 0 && (
          <p className="text-error mt-4 font-mono text-xs">
            contracts without code cannot be trusted — fix these addresses in network settings first
          </p>
        )}

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            data-testid="trust-deployments-confirm"
            disabled={results === null || unverified.length === 0}
            onClick={handleConfirm}
          >
            Trust These Deployments
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  );
}
