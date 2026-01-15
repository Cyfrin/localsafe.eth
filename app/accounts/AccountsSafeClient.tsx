"use client";

import React, { useRef, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AppSection from "@/app/components/AppSection";
import AppCard from "@/app/components/AppCard";
import { useSafeWalletContext } from "../provider/SafeWalletProvider";
import { useChains, useSwitchChain } from "wagmi";
import { SafeWalletData } from "../utils/types";
import ImportSafeWalletModal from "../components/ImportSafeWalletModal";

/**
 * Accounts Page Component
 *
 * This component serves as the main entry point for the Accounts page.
 * It imports and renders the AccountsSafeClient component, which contains
 * the client-side logic and UI for managing safe accounts.
 *
 * @returns The Accounts page component.
 */
export default function AccountsPage() {
  // Hooks
  const wagmiChains = useChains();
  const { switchChain } = useSwitchChain();
  const { safeWalletData, setSafeWalletData } = useSafeWalletContext();
  const [searchParams] = useSearchParams();

  // State for toggling deployed/undeployed safes - default based on URL param
  const [showDeployed, setShowDeployed] = useState(true);

  // Set initial view based on URL query parameter
  useEffect(() => {
    const view = searchParams.get("view");
    if (view === "undeployed") {
      setShowDeployed(false);
    }
  }, [searchParams]);
  // State for import modal and preview
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importPreview, setImportPreview] = useState<SafeWalletData | { error: string } | null>(null);

  // Ref for hidden file input
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Group safes by safeAddress for accordion display using addressBook and undeployedSafes
  function getGroupedSafes(type: "deployed" | "undeployed") {
    const grouped: Record<string, Array<{ chainId: string; name: string }>> = {};
    const { addressBook, undeployedSafes } = safeWalletData.data;
    Object.entries(addressBook).forEach(([chainId, safesObj]) => {
      Object.entries(safesObj).forEach(([safeAddress, name]) => {
        const isUndeployed = undeployedSafes[chainId] && undeployedSafes[chainId][safeAddress];
        if ((type === "undeployed" && isUndeployed) || (type === "deployed" && !isUndeployed)) {
          if (!grouped[safeAddress]) grouped[safeAddress] = [];
          grouped[safeAddress].push({
            chainId,
            name: String(name),
          });
        }
      });
    });
    return grouped;
  }

  // Get safes to display based on toggle
  const groupedSafes = getGroupedSafes(showDeployed ? "deployed" : "undeployed");

  // Export SafeWallet data as JSON file
  function handleExport() {
    // We use a Blob and a temporary anchor element to trigger a download.
    // This is more robust than using a data URL in a Link, especially for large files.
    // The download attribute sets the filename for the user.
    // After the download, we revoke the object URL to free memory.
    const dataStr = JSON.stringify(safeWalletData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "msig-wallet-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Import logic: open file picker, parse JSON, show modal
  function handleImportClick() {
    fileInputRef.current?.click();
  }
  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event: ProgressEvent<FileReader>) => {
      try {
        const result = event.target?.result;
        if (typeof result === "string") {
          const json = JSON.parse(result);
          setImportPreview(json);
        } else {
          setImportPreview({ error: "Invalid file content." });
        }
        setShowImportModal(true);
      } catch {
        setImportPreview({ error: "Invalid JSON file." });
        setShowImportModal(true);
      }
    };
    reader.readAsText(file);
    // Reset input value so selecting the same file again will trigger onChange
    e.target.value = "";
  }

  return (
    <AppSection className="mx-auto max-w-4xl">
      <AppCard testid="safe-accounts-table">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-3xl font-bold">Safe Accounts</h2>
          {/* Create / Add Safe Buttons */}
          <div className="flex flex-col gap-2 md:flex-row">
            <Link to="/new-safe/create" className="btn btn-primary btn-sm" data-testid="create-safe-nav-btn">
              Deploy New Safe
            </Link>
            <Link to="/new-safe/connect" className="btn btn-secondary btn-sm" data-testid="add-safe-nav-btn">
              Add Existing Safe
            </Link>
          </div>
        </div>
        {/* Toggle Deployed/Undeployed */}
        <div className="mb-4 flex items-center justify-center gap-2">
          <div
            className="tooltip"
            data-tip="Toggle between safes that are deployed on-chain vs. safes that are configured but not yet deployed"
          >
            <svg
              className="text-base-content h-4 w-4 opacity-60"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="form-control">
            <label className="label cursor-pointer gap-2">
              <span className="label-text">Undeployed</span>
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={showDeployed}
                onChange={() => setShowDeployed(!showDeployed)}
                data-testid="toggle-deployed-undeployed"
              />
              <span className="label-text">Deployed</span>
            </label>
          </div>
        </div>
        {/* Safe Accounts List/Accordion */}
        <div className="flex flex-col gap-4">
          {Object.keys(groupedSafes).length === 0 ? (
            <div className="text-center text-gray-400">No Safes found.</div>
          ) : (
            Object.entries(groupedSafes).map(([safeAddress, chains]) => {
              // Use the first chain's name for display, since all have the same name
              const displayName = chains[0]?.name || safeAddress;
              return (
                // Accordion item for each safeAddress
                <div
                  className="bg-base-100 border-base-300 collapse-arrow collapse border"
                  key={safeAddress}
                  data-testid={`safe-account-row-${safeAddress}`}
                >
                  <input type="checkbox" data-testid="safe-account-collapse" />
                  <div className="collapse-title flex items-center gap-2 font-semibold">
                    <span className="text-lg font-bold break-all">{displayName}</span>
                    <span className="font-mono text-xs break-all text-gray-500">{safeAddress}</span>
                  </div>
                  {/*  Expanded content with chain links */}
                  <div className="collapse-content">
                    <ul className="list bg-base-100 rounded-box gap-4 shadow-md">
                      {chains.map(({ chainId }) => (
                        <Link
                          className="list-row border-accent text-base-content hover:bg-base-200 flex w-full items-center gap-4 rounded border-2 p-4 font-bold"
                          to={`/safe/${safeAddress}`}
                          key={chainId}
                          onClick={() => switchChain({ chainId: parseInt(chainId) })}
                          data-testid={`safe-account-link-${safeAddress}-${chainId}`}
                        >
                          {wagmiChains.find((c) => c.id.toString() === chainId)?.name || chainId}
                          <span className="ml-2 text-xs text-gray-500">({chainId})</span>
                        </Link>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </AppCard>
      {/* Import/Export buttons below the card */}
      <div className="mt-6 flex justify-center gap-2">
        <button className="btn btn-primary btn-outline btn-sm" onClick={handleExport} data-testid="export-wallets-btn">
          Export Safes
        </button>
        <button
          className="btn btn-secondary btn-outline btn-sm"
          onClick={handleImportClick}
          data-testid="import-wallets-btn"
        >
          Import Safes
        </button>
        <input type="file" className="hidden" ref={fileInputRef} accept=".json" onChange={handleImportFile} />
      </div>

      {/* Import Modal using generic Modal component */}
      <ImportSafeWalletModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        importPreview={importPreview}
        setSafeWalletData={setSafeWalletData}
      />
    </AppSection>
  );
}
