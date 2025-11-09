"use client";

import React, { useState, useEffect } from "react";
import Modal from "./Modal";
import { useChainManager } from "../hooks/useChainManager";
import DefaultNetworkSvg from "../assets/svg/DefaultNetworkSvg";
import NetworkForm from "./NetworkForm";
import { NetworkFormState } from "../utils/types";
import XSymbolSvg from "../assets/svg/XSymbolSvg";
import PenEditSvg from "../assets/svg/PenEditSvg";
import type { Chain } from "viem";

// Component to render chain icon with fallback
const ChainIcon = ({ chain }: { chain: Chain }) => {
  const [imageError, setImageError] = useState(false);

  // Use iconUrl if available (from RainbowKit or user-provided)
  const iconUrl = (chain as Chain & { iconUrl?: string }).iconUrl;

  if (!iconUrl || imageError) {
    return (
      <div className="h-6 w-6">
        <DefaultNetworkSvg />
      </div>
    );
  }

  return (
    <img
      src={iconUrl}
      alt={`${chain.name} logo`}
      className="h-6 w-6 rounded-full"
      onError={() => setImageError(true)}
    />
  );
};

/**
 * A modal component to manage user config networks.
 *
 * @param {boolean} open - Whether the modal is open or not.
 * @param {() => void} onClose - Function to call when closing the modal.
 * @param {NetworkFormState | undefined} suggestedFormState - Optional suggested form state for pre-filling the form.
 * @returns A modal component for managing user networks.
 */
export default function NetworkModal({
  open,
  onClose,
  suggestedFormState,
}: {
  open: boolean;
  onClose: () => void;
  suggestedFormState?: import("../utils/types").NetworkFormState;
}) {
  // Chain management hook
  const { configChains, removeChainById, addOrUpdateChain } = useChainManager();
  const [showForm, setShowForm] = useState<null | "add" | "edit">(null);
  const [editChain, setEditChain] = useState<NetworkFormState | null>(null);

  // Always pre-fill form when modal is opened and suggestedFormState is present
  useEffect(() => {
    if (open && suggestedFormState) {
      setEditChain(suggestedFormState);
      setShowForm("add");
    }
  }, [open, suggestedFormState]);

  /**
   * Handle adding or updating a network based on the provided form state.
   *
   * @param state - The state of the network form to add or update.
   */
  function handleNetworkAdd(state: NetworkFormState) {
    // Build contracts object with all Safe contract addresses if provided
    const contracts: Record<string, { address: `0x${string}` }> = {};

    if (state.safeProxyFactoryAddress) {
      contracts.safeProxyFactory = { address: state.safeProxyFactoryAddress as `0x${string}` };
    }
    if (state.safeSingletonAddress) {
      contracts.safeSingleton = { address: state.safeSingletonAddress as `0x${string}` };
    }
    if (state.fallbackHandlerAddress) {
      contracts.fallbackHandler = { address: state.fallbackHandlerAddress as `0x${string}` };
    }
    if (state.multiSendAddress) {
      contracts.multiSend = { address: state.multiSendAddress as `0x${string}` };
    }
    if (state.multiSendCallOnlyAddress) {
      contracts.multiSendCallOnly = { address: state.multiSendCallOnlyAddress as `0x${string}` };
    }
    if (state.signMessageLibAddress) {
      contracts.signMessageLib = { address: state.signMessageLibAddress as `0x${string}` };
    }
    if (state.createCallAddress) {
      contracts.createCall = { address: state.createCallAddress as `0x${string}` };
    }
    if (state.simulateTxAccessorAddress) {
      contracts.simulateTxAccessor = { address: state.simulateTxAccessorAddress as `0x${string}` };
    }
    if (state.tokenCallbackHandlerAddress) {
      contracts.tokenCallbackHandler = { address: state.tokenCallbackHandlerAddress as `0x${string}` };
    }

    addOrUpdateChain({
      id: Number(state.id),
      name: state.name,
      rpcUrls: { default: { http: [state.rpcUrl] } },
      blockExplorers: state.blockExplorerUrl
        ? {
            default: {
              name: state.blockExplorerName || "Explorer",
              url: state.blockExplorerUrl,
            },
          }
        : undefined,
      nativeCurrency: state.nativeCurrency,
      contracts: Object.keys(contracts).length > 0 ? contracts : undefined,
    });
    setEditChain(null);
  }

  return (
    <Modal open={open} onClose={onClose} showCloseButton={false} testid="network-modal">
      <h2 className="mb-4 text-2xl font-bold">Manage Networks</h2>
      {showForm ? (
        <NetworkForm
          setShowForm={setShowForm}
          onSubmit={handleNetworkAdd}
          initialState={editChain}
          onCancel={() => setEditChain(null)}
        />
      ) : (
        <>
          <p>
            Here you can manage your custom networks. You can add or remove custom networks as needed.
            <br />
            <span className="text-xs text-gray-400 italic">
              Note: Adding a new network will take over any previously set custom network with the same Chain ID.
            </span>
          </p>
          <ul className="list bg-base-100 rounded-box max-h-64 overflow-y-auto shadow-md">
            <li className="p-4 pb-2 text-xs tracking-wide opacity-60">Your configured networks</li>
            {/* Conditional rendering of configured networks */}
            {configChains.length > 0 ? (
              configChains.map((chain) => {
                return (
                  <li className="list-row" key={chain.id}>
                    <div>
                      <div className="rounded-box bg-base-200 flex size-10 items-center justify-center overflow-hidden">
                        <ChainIcon chain={chain} />
                      </div>
                    </div>
                    <div>
                      <div>{chain.name}</div>
                      <div className="text-xs font-semibold uppercase opacity-60">Chain ID: {chain.id}</div>
                    </div>
                    {/* Edit network button */}
                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-square btn-ghost"
                        title={`Edit ${chain.name}`}
                        onClick={() => {
                          const chainContracts = chain.contracts as Record<string, { address: string }> | undefined;
                          setEditChain({
                            id: chain.id,
                            name: chain.name,
                            rpcUrl: chain.rpcUrls?.default?.http?.[0] || "",
                            blockExplorerUrl: chain.blockExplorers?.default?.url || "",
                            blockExplorerName: chain.blockExplorers?.default?.name || "",
                            safeProxyFactoryAddress: chainContracts?.safeProxyFactory?.address || "",
                            safeSingletonAddress: chainContracts?.safeSingleton?.address || "",
                            fallbackHandlerAddress: chainContracts?.fallbackHandler?.address || "",
                            multiSendAddress: chainContracts?.multiSend?.address || "",
                            multiSendCallOnlyAddress: chainContracts?.multiSendCallOnly?.address || "",
                            signMessageLibAddress: chainContracts?.signMessageLib?.address || "",
                            createCallAddress: chainContracts?.createCall?.address || "",
                            simulateTxAccessorAddress: chainContracts?.simulateTxAccessor?.address || "",
                            tokenCallbackHandlerAddress: chainContracts?.tokenCallbackHandler?.address || "",
                            nativeCurrency: chain.nativeCurrency || {
                              name: "",
                              symbol: "",
                              decimals: 18,
                            },
                          });
                          setShowForm("edit");
                        }}
                      >
                        <PenEditSvg />
                      </button>
                      {/* Remove network button with tooltip if only one chain remains */}
                      <div
                        className="tooltip tooltip-left"
                        data-tip={configChains.length === 1 ? "One chain is required" : undefined}
                      >
                        <button
                          className="btn btn-square btn-ghost"
                          onClick={() => removeChainById(chain.id)}
                          title={`Remove ${chain.name}`}
                          disabled={configChains.length === 1}
                        >
                          <XSymbolSvg />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })
            ) : (
              <li className="p-4 text-center text-sm opacity-60">No custom networks added.</li>
            )}
          </ul>
          {/* Add and Close buttons */}
          <div className="mb-4 flex items-center justify-center gap-4">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowForm("add")}
              data-testid="network-modal-add-btn"
            >
              Add Network
            </button>
            <button
              className="btn btn-secondary btn-ghost btn-sm"
              onClick={onClose}
              data-testid="network-modal-close-btn"
            >
              Close
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
