"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState, useRef } from "react";
import NetworkChainSvg from "../assets/svg/NetworkChainSvg";
import DefaultNetworkSvg from "../assets/svg/DefaultNetworkSvg";
import { WAGMI_CONFIG_NETWORKS_KEY } from "../utils/constants";
import type { NetworkFormState } from "../utils/types";

interface CustomConnectButtonProps {
  onOpenNetworkModal: () => void;
  showNetworkFormIndicator?: boolean;
  chainStatusDisplay?: "none" | { smallScreen: string; largeScreen: string };
}

export default function CustomConnectButton({
  onOpenNetworkModal,
  showNetworkFormIndicator = false,
  chainStatusDisplay,
}: CustomConnectButtonProps) {
  const [isChainMenuOpen, setIsChainMenuOpen] = useState(false);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportNetworks = () => {
    try {
      const networks = localStorage.getItem(WAGMI_CONFIG_NETWORKS_KEY);
      if (!networks) {
        alert("No networks to export");
        return;
      }

      const blob = new Blob([networks], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `msig-networks-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setIsChainMenuOpen(false);
    } catch (error) {
      console.error("Failed to export networks:", error);
      alert("Failed to export networks");
    }
  };

  const handleImportNetworks = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedNetworks = JSON.parse(content);

        // Validate that it's an array
        if (!Array.isArray(importedNetworks)) {
          alert("Invalid networks file format");
          return;
        }

        // Get existing networks
        const existingNetworksStr = localStorage.getItem(WAGMI_CONFIG_NETWORKS_KEY);
        const existingNetworks = existingNetworksStr
          ? JSON.parse(existingNetworksStr)
          : [];

        // Merge networks, avoiding duplicates by chain ID
        // If a network with the same ID exists, keep the existing one
        const mergedNetworks = [...existingNetworks];
        let addedCount = 0;

        importedNetworks.forEach((importedNet: NetworkFormState) => {
          const exists = mergedNetworks.some(
            (existingNet: NetworkFormState) => existingNet.id === importedNet.id
          );
          if (!exists) {
            mergedNetworks.push(importedNet);
            addedCount++;
          }
        });

        // Save merged networks to localStorage
        localStorage.setItem(
          WAGMI_CONFIG_NETWORKS_KEY,
          JSON.stringify(mergedNetworks)
        );

        // Reload the page to apply changes
        alert(
          `${addedCount} network(s) imported successfully! Reloading page...`
        );
        window.location.reload();
      } catch (error) {
        console.error("Failed to import networks:", error);
        alert("Failed to import networks. Please check the file format.");
      }
    };
    reader.readAsText(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setIsChainMenuOpen(false);
  };

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === "authenticated");

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: {
                opacity: 0,
                pointerEvents: "none",
                userSelect: "none",
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    type="button"
                    className="btn btn-primary btn-sm rounded"
                  >
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    type="button"
                    className="btn btn-error btn-sm rounded"
                  >
                    Wrong network
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  {/* Custom Chain Selector with Dropdown */}
                  {chainStatusDisplay !== "none" && (
                    <div className="dropdown dropdown-end">
                      <div
                        tabIndex={0}
                        role="button"
                        className="btn btn-ghost btn-sm flex items-center gap-2 rounded"
                        onClick={() => setIsChainMenuOpen(!isChainMenuOpen)}
                      >
                        {chain.hasIcon && chain.iconUrl && !imageErrors[chain.id] ? (
                          <div
                            className="h-5 w-5 overflow-hidden rounded-full"
                            style={{ background: chain.iconBackground }}
                          >
                            <img
                              alt={chain.name ?? "Chain icon"}
                              src={chain.iconUrl}
                              className="h-5 w-5"
                              onError={() => setImageErrors(prev => ({ ...prev, [chain.id]: true }))}
                            />
                          </div>
                        ) : (
                          <div className="h-5 w-5 overflow-hidden rounded-full">
                            <DefaultNetworkSvg />
                          </div>
                        )}
                        <span className="hidden sm:inline">{chain.name}</span>
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>
                      <ul
                        tabIndex={0}
                        className="menu dropdown-content bg-base-200 rounded-box z-[1] mt-3 w-52 border border-base-300 p-2 shadow"
                      >
                        {/* RainbowKit's default chain switching */}
                        <li>
                          <button
                            onClick={() => {
                              setIsChainMenuOpen(false);
                              openChainModal();
                            }}
                            className="flex items-center gap-2"
                          >
                            <NetworkChainSvg />
                            <span>Switch Network</span>
                          </button>
                        </li>

                        <div className="divider my-1"></div>

                        {/* Manage Networks option */}
                        <li>
                          <button
                            onClick={() => {
                              setIsChainMenuOpen(false);
                              onOpenNetworkModal();
                            }}
                            className="flex items-center gap-2"
                          >
                            {showNetworkFormIndicator && (
                              <span className="badge badge-warning badge-xs">
                                New
                              </span>
                            )}
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                            </svg>
                            <span>Manage Networks</span>
                          </button>
                        </li>

                        <div className="divider my-1"></div>

                        {/* Export Networks */}
                        <li>
                          <button
                            onClick={handleExportNetworks}
                            className="flex items-center gap-2"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                              />
                            </svg>
                            <span>Export Networks</span>
                          </button>
                        </li>

                        {/* Import Networks */}
                        <li>
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                              />
                            </svg>
                            <span>Import Networks</span>
                          </button>
                        </li>
                      </ul>
                      {/* Hidden file input for import */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/json,.json"
                        onChange={handleImportNetworks}
                        className="hidden"
                      />
                    </div>
                  )}

                  {/* Account Button */}
                  <button
                    onClick={openAccountModal}
                    type="button"
                    className="btn btn-ghost btn-sm flex items-center gap-2 rounded"
                  >
                    <span className="hidden md:inline">
                      {account.displayName}
                    </span>
                    <span className="md:hidden">
                      {account.displayName.split(" ")[0]}
                    </span>
                    {account.displayBalance && (
                      <span className="hidden lg:inline">
                        ({account.displayBalance})
                      </span>
                    )}
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
