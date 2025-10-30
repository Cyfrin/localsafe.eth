"use client";

import AppSection from "@/app/components/AppSection";
import AppCard from "@/app/components/AppCard";
import BtnCancel from "@/app/components/BtnCancel";
import NetworkModal from "@/app/components/NetworkModal";
import { useState } from "react";
import { useChains } from "wagmi";
import { useNavigate } from "react-router-dom";
import { useSafeWalletContext } from "@/app/provider/SafeWalletProvider";
import useNewSafe from "@/app/hooks/useNewSafe";
import { getRandomSafeName, sanitizeUserInput } from "@/app/utils/helpers";

/**
 * Connect Safe Client Component
 *
 * This component provides the UI and logic for connecting an existing safe.
 * It includes form fields for entering the safe name, address, and selecting
 * the network. It handles validation, error states, and integrates with the
 * SafeWallet context to add the connected safe.
 *
 * @returns The Connect Safe client component.
 */
export default function ConnectSafeClient() {
  // Hooks
  const chains = useChains();
  const { addSafe, safeWalletData } = useSafeWalletContext();
  const { connectNewSafe } = useNewSafe();
  const navigate = useNavigate();

  // State for name, address, chain, error, loading
  const [safeName, setSafeName] = useState<string>("");
  const [randomName] = useState(() => getRandomSafeName());
  const [safeAddress, setSafeAddress] = useState<`0x${string}`>(
    "" as `0x${string}`,
  );
  const [selectedChain, setSelectedChain] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [networkModalOpen, setNetworkModalOpen] = useState(false);

  /**
   * Handle adding an existing safe to the wallet.
   *
   * Validates the address, chain selection, and name.
   *
   * @returns Promise<void>
   */
  async function handleAddSafe() {
    setLoading(true);
    setError(null);
    // Validate address
    if (!/^0x[a-fA-F0-9]{40}$/.test(safeAddress)) {
      setError("Invalid Safe address");
      setLoading(false);
      return;
    }
    // Validate chain
    if (!selectedChain) {
      setError("Please select a network");
      setLoading(false);
      return;
    }
    // Validate name
    const nameToStore = safeName || randomName;
    // Check if already registered
    const addressBook = safeWalletData.data.addressBook;
    if (addressBook[selectedChain] && addressBook[selectedChain][safeAddress]) {
      setError(
        "This Safe address is already registered on the selected network.",
      );
      setLoading(false);
      return;
    }
    // Optionally check deployment
    try {
      const safeMeta = await connectNewSafe(safeAddress, Number(selectedChain));
      if (!safeMeta) {
        setError("Failed to connect or add Safe");
        setLoading(false);
        return;
      }
      if ("error" in safeMeta) {
        setError(safeMeta.error);
        setLoading(false);
        return;
      }
      // Store in addressBook with name
      addSafe(selectedChain, safeAddress, nameToStore);
      navigate("/accounts");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to connect or add Safe",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppSection className="flex min-h-screen items-center">
      <div className="self-start">
        <BtnCancel to="/accounts" />
      </div>
      <AppCard
        title={
          <div className="flex w-full items-center justify-between">
            Add Safe Account
          </div>
        }
        className="w-full max-w-md"
      >
        <div className="text-base-content text-sm">
          You can only add Safe accounts that are already deployed on the
          selected network. If your Safe is not yet deployed, please use the
          Deploy New Safe flow.
        </div>

        {/* Form Safe Name, Address, Network Select, Error, Add Button */}
        <fieldset className="fieldset w-full">
          <legend className="fieldset-legend">Safe Name</legend>
          <input
            type="text"
            className="input input-bordered flex-1"
            placeholder={randomName}
            value={safeName}
            onChange={(e) => setSafeName(sanitizeUserInput(e.target.value))}
            disabled={loading}
            data-testid="safe-name-input"
          />
          <label className="label">
            <span className="label-text-alt">
              If left blank, a random name will be generated.
            </span>
          </label>
        </fieldset>
        <fieldset className="fieldset w-full">
          <legend className="fieldset-legend">Safe Address</legend>
          <input
            type="text"
            className="input validator flex-1 font-mono"
            placeholder="0x..."
            value={safeAddress}
            onChange={(e) => setSafeAddress(e.target.value as `0x${string}`)}
            pattern="^0x[a-fA-F0-9]{40}$"
            required
            disabled={loading}
            data-testid="safe-address-input"
          />
        </fieldset>
        <div className="mb-4">
          <label className="mb-2 block font-semibold">Select Network</label>
          <select
            className="select select-bordered w-full"
            value={selectedChain}
            onChange={(e) => {
              if (e.target.value === "add-network") {
                setNetworkModalOpen(true);
                e.target.value = selectedChain; // Reset to previous value
              } else {
                setSelectedChain(e.target.value);
              }
            }}
            disabled={loading}
            data-testid="network-select"
          >
            <option value="" disabled>
              Choose a network
            </option>
            {chains.map((chain) => (
              <option key={chain.id} value={chain.id.toString()}>
                {chain.name}
              </option>
            ))}
            <option value="add-network" className="font-semibold">
              + Edit Networks
            </option>
          </select>
        </div>
        {error && <div className="alert alert-error mb-4">{error}</div>}
        <button
          className="btn btn-primary w-full"
          onClick={handleAddSafe}
          disabled={loading}
          data-testid="add-safe-btn"
        >
          {loading ? "Adding..." : "Add Safe"}
        </button>
      </AppCard>

      <NetworkModal
        open={networkModalOpen}
        onClose={() => setNetworkModalOpen(false)}
      />
    </AppSection>
  );
}
