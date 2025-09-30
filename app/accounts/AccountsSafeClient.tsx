"use client";

import React, { useState } from "react";

// Helper to summarize SafeWalletData for preview
import Link from "next/link";
import AppSection from "@/app/components/AppSection";
import AppCard from "@/app/components/AppCard";
import { useSafeWalletContext } from "../provider/SafeWalletProvider";
import { useChains, useSwitchChain } from "wagmi";
import { SafeWalletData } from "../utils/types";
import ImportSafeWalletModal from "../components/ImportSafeWalletModal";

export default function AccountsPage() {
  const wagmiChains = useChains();
  const { switchChain } = useSwitchChain();
  const { safeWalletData, setSafeWalletData } = useSafeWalletContext();
  const [showDeployed, setShowDeployed] = useState(true);

  // Group safes by safeAddress for accordion display using addressBook and undeployedSafes
  const getGroupedSafes = (type: "deployed" | "undeployed") => {
    const grouped: Record<
      string,
      Array<{ chainId: string; name: string }>
    > = {};
    const { addressBook, undeployedSafes } = safeWalletData.data;
    Object.entries(addressBook).forEach(([chainId, safesObj]) => {
      Object.entries(safesObj).forEach(([safeAddress, name]) => {
        const isUndeployed =
          undeployedSafes[chainId] && undeployedSafes[chainId][safeAddress];
        if (
          (type === "undeployed" && isUndeployed) ||
          (type === "deployed" && !isUndeployed)
        ) {
          if (!grouped[safeAddress]) grouped[safeAddress] = [];
          grouped[safeAddress].push({
            chainId,
            name: String(name),
          });
        }
      });
    });
    return grouped;
  };

  const groupedSafes = getGroupedSafes(
    showDeployed ? "deployed" : "undeployed",
  );

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

  // State for import modal and preview
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importPreview, setImportPreview] = useState<
    SafeWalletData | { error: string } | null
  >(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
          <div className="flex flex-col gap-2 md:flex-row">
            <Link
              href="/new-safe/create"
              className="btn btn-primary btn-sm"
              data-testid="create-safe-nav-btn"
            >
              Create Safe
            </Link>
            <Link
              href="/new-safe/connect"
              className="btn btn-secondary btn-sm"
              data-testid="add-safe-nav-btn"
            >
              Add Safe
            </Link>
          </div>
        </div>
        <div className="mb-4 flex justify-center">
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
        <div className="flex flex-col gap-4">
          {Object.keys(groupedSafes).length === 0 ? (
            <div className="text-center text-gray-400">No Safes found.</div>
          ) : (
            Object.entries(groupedSafes).map(([safeAddress, chains]) => {
              // Use the first chain's name for display, since all have the same name
              const displayName = chains[0]?.name || safeAddress;
              return (
                <div
                  className="bg-base-100 border-base-300 collapse-arrow collapse border"
                  key={safeAddress}
                  data-testid={`safe-account-row-${safeAddress}`}
                >
                  <input type="checkbox" data-testid="safe-account-collapse" />
                  <div className="collapse-title flex items-center gap-2 font-semibold">
                    <span className="text-lg font-bold break-all">
                      {displayName}
                    </span>
                    <span className="font-mono text-xs break-all text-gray-500">
                      {safeAddress}
                    </span>
                  </div>
                  <div className="collapse-content">
                    <ul className="list bg-base-100 rounded-box gap-4 shadow-md">
                      {chains.map(({ chainId }) => (
                        <Link
                          className="list-row border-accent text-base-content hover:bg-base-200 flex w-full items-center gap-4 rounded border-2 p-4 font-bold"
                          href={`/safe/${safeAddress}`}
                          key={chainId}
                          onClick={() =>
                            switchChain({ chainId: parseInt(chainId) })
                          }
                          data-testid={`safe-account-link-${safeAddress}-${chainId}`}
                        >
                          {wagmiChains.find((c) => c.id.toString() === chainId)
                            ?.name || chainId}
                          <span className="ml-2 text-xs text-gray-500">
                            ({chainId})
                          </span>
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
        <button
          className="btn btn-primary btn-outline btn-sm"
          onClick={handleExport}
          data-testid="export-wallets-btn"
        >
          Export Wallets
        </button>
        <button
          className="btn btn-secondary btn-outline btn-sm"
          onClick={handleImportClick}
          data-testid="import-wallets-btn"
        >
          Import Wallets
        </button>
        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          accept=".json"
          onChange={handleImportFile}
        />
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
