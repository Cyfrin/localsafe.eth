"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AppSection from "@/app/components/AppSection";
import AppCard from "@/app/components/AppCard";
import { useToast } from "@/app/hooks/useToast";
import { useConfirm } from "@/app/hooks/useToast";

interface StorageItem {
  key: string;
  value: string;
  parsed: unknown;
  isValid: boolean;
}

const KNOWN_KEYS = [
  { key: "MSIGUI_safeWalletData", description: "Safe wallet configuration (owners, threshold)" },
  { key: "MSIGUI_safeCurrentTxMap", description: "Pending Safe transactions" },
  { key: "walletconnect-project-id", description: "WalletConnect Project ID" },
  { key: "MSIG_wagmiConfigNetworks", description: "Custom network configurations" },
  { key: "coingecko-api-key", description: "CoinGecko API key" },
  { key: "coingecko-price-cache", description: "Cached token prices" },
];

// Keys that require a page reload to take effect
const KEYS_REQUIRING_RELOAD = [
  "MSIG_wagmiConfigNetworks",
  "MSIGUI_safeWalletData",
  "walletconnect-project-id",
  "MSIGUI_safeCurrentTxMap",
];

export default function AdvancedSettingsClient() {
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [storageItems, setStorageItems] = useState<StorageItem[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [searchFilter, setSearchFilter] = useState("");

  useEffect(() => {
    loadStorage();
  }, []);

  const loadStorage = () => {
    if (typeof window === "undefined") return;

    const items: StorageItem[] = [];

    // Load all localStorage items
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      const value = localStorage.getItem(key) || "";
      let parsed: unknown = value;
      let isValid = true;

      // Try to parse as JSON
      try {
        parsed = JSON.parse(value);
      } catch {
        // Not JSON, treat as plain string
        isValid = false;
      }

      items.push({ key, value, parsed, isValid });
    }

    // Sort: known keys first, then alphabetically
    items.sort((a, b) => {
      const aKnown = KNOWN_KEYS.some((k) => k.key === a.key);
      const bKnown = KNOWN_KEYS.some((k) => k.key === b.key);

      if (aKnown && !bKnown) return -1;
      if (!aKnown && bKnown) return 1;
      return a.key.localeCompare(b.key);
    });

    setStorageItems(items);
  };

  const handleEdit = (key: string, value: string, isValid: boolean, parsed: unknown) => {
    setEditingKey(key);
    // If it's valid JSON, format it with indentation; otherwise use raw value
    setEditValue(isValid ? JSON.stringify(parsed, null, 2) : value);
  };

  const handleSave = async () => {
    if (!editingKey) return;

    try {
      // Validate JSON if the original was JSON
      const item = storageItems.find((i) => i.key === editingKey);
      if (item?.isValid) {
        JSON.parse(editValue); // Validate JSON
      }

      localStorage.setItem(editingKey, editValue);
      setEditingKey(null);
      setEditValue("");
      loadStorage();

      // Check if this key requires a page reload to take effect
      if (KEYS_REQUIRING_RELOAD.includes(editingKey)) {
        const confirmed = await confirm(
          "Settings saved! The page will reload to apply changes. Continue?",
          "Reload Required",
        );
        if (confirmed) {
          window.location.reload();
        } else {
          toast.warning("Settings saved, but you'll need to manually refresh the page for changes to take effect.");
        }
      } else {
        toast.success("Settings saved successfully!");
      }
    } catch (error) {
      toast.error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleDelete = async (key: string) => {
    const confirmed = await confirm(`Are you sure you want to delete "${key}"?`, "Delete Confirmation");
    if (!confirmed) return;

    localStorage.removeItem(key);
    loadStorage();
    toast.success(`Deleted "${key}" successfully`);
  };

  const handleExportAll = () => {
    const data: Record<string, unknown> = {};
    storageItems.forEach((item) => {
      data[item.key] = item.isValid ? item.parsed : item.value;
    });

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `localsafe-settings-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportAll = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);

          const confirmed = await confirm(
            `This will overwrite ${Object.keys(data).length} localStorage items. Continue?`,
            "Import Confirmation",
          );
          if (!confirmed) return;

          Object.entries(data).forEach(([key, value]) => {
            const stringValue = typeof value === "string" ? value : JSON.stringify(value);
            localStorage.setItem(key, stringValue);
          });

          loadStorage();
          toast.success("Import successful! Refresh the page for changes to take effect.");
        } catch (error) {
          toast.error(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleClearAll = async () => {
    const firstConfirm = await confirm(
      "Are you sure you want to clear ALL localStorage data? This cannot be undone!",
      "Clear All Data",
    );
    if (!firstConfirm) return;

    const secondConfirm = await confirm(
      "This will delete all your wallets, transactions, and settings. Are you ABSOLUTELY sure?",
      "Final Warning",
    );
    if (!secondConfirm) return;

    localStorage.clear();
    loadStorage();
    toast.success("All data cleared. Refresh the page.");
  };

  const filteredItems = storageItems.filter(
    (item) =>
      item.key.toLowerCase().includes(searchFilter.toLowerCase()) ||
      item.value.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  return (
    <AppSection>
      <div className="mb-4">
        <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm">
          ← Back
        </button>
      </div>
      <AppCard title="Advanced Settings">
        <div className="flex flex-col gap-4">
          {/* Warning */}
          <div className="alert alert-warning">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 shrink-0 stroke-current"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <h3 className="font-bold">Caution: Advanced Users Only</h3>
              <div className="text-sm">
                Editing these values directly can break the application. Always export your data before making changes.
                Some settings will automatically reload the page to apply changes.
              </div>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary btn-sm" onClick={handleExportAll}>
              Export All Data
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleImportAll}>
              Import Data
            </button>
            <button className="btn btn-error btn-outline btn-sm" onClick={handleClearAll}>
              Clear All Data
            </button>
          </div>

          {/* Search */}
          <div className="form-control">
            <input
              type="text"
              className="input input-bordered"
              placeholder="Search by key or value..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>

          {/* Storage Items */}
          <div className="space-y-4">
            {filteredItems.map((item) => {
              const knownKey = KNOWN_KEYS.find((k) => k.key === item.key);
              const isEditing = editingKey === item.key;

              return (
                <div key={item.key} className="card bg-base-200">
                  <div className="card-body p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h3 className="font-mono text-sm font-bold break-all">{item.key}</h3>
                        {knownKey && <p className="mt-1 text-xs text-gray-500">{knownKey.description}</p>}
                      </div>
                      <div className="flex gap-2">
                        {!isEditing ? (
                          <>
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={() => handleEdit(item.key, item.value, item.isValid, item.parsed)}
                            >
                              Edit
                            </button>
                            <button className="btn btn-ghost btn-xs text-error" onClick={() => handleDelete(item.key)}>
                              Delete
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-primary btn-xs" onClick={handleSave}>
                              Save
                            </button>
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={() => {
                                setEditingKey(null);
                                setEditValue("");
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="mt-2">
                      {isEditing ? (
                        <textarea
                          className="textarea textarea-bordered min-h-64 w-full p-3 font-mono text-xs"
                          rows={10}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                        />
                      ) : (
                        <pre className="bg-base-300 max-h-64 overflow-x-auto overflow-y-auto rounded p-3 text-xs">
                          {item.isValid ? JSON.stringify(item.parsed, null, 2) : item.value}
                        </pre>
                      )}
                    </div>

                    <div className="mt-2 text-xs text-gray-500">
                      Size: {new Blob([item.value]).size} bytes
                      {item.isValid && " • Valid JSON"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredItems.length === 0 && (
            <div className="py-8 text-center text-gray-500">
              {searchFilter ? "No items match your search" : "No localStorage data found"}
            </div>
          )}
        </div>
      </AppCard>
    </AppSection>
  );
}
