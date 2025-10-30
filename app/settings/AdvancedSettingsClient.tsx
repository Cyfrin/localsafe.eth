"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AppSection from "@/app/components/AppSection";
import AppCard from "@/app/components/AppCard";

interface StorageItem {
  key: string;
  value: string;
  parsed: any;
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

export default function AdvancedSettingsClient() {
  const navigate = useNavigate();
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
      let parsed: any = value;
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

  const handleEdit = (key: string, value: string) => {
    setEditingKey(key);
    setEditValue(value);
  };

  const handleSave = () => {
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
      alert("Saved successfully! Refresh the page for changes to take effect.");
    } catch (error) {
      alert(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleDelete = (key: string) => {
    if (!confirm(`Are you sure you want to delete "${key}"?`)) return;

    localStorage.removeItem(key);
    loadStorage();
  };

  const handleExportAll = () => {
    const data: Record<string, any> = {};
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
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);

          if (!confirm(`This will overwrite ${Object.keys(data).length} localStorage items. Continue?`)) {
            return;
          }

          Object.entries(data).forEach(([key, value]) => {
            const stringValue = typeof value === "string" ? value : JSON.stringify(value);
            localStorage.setItem(key, stringValue);
          });

          loadStorage();
          alert("Import successful! Refresh the page for changes to take effect.");
        } catch (error) {
          alert(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleClearAll = () => {
    if (!confirm("Are you sure you want to clear ALL localStorage data? This cannot be undone!")) {
      return;
    }

    if (!confirm("This will delete all your wallets, transactions, and settings. Are you ABSOLUTELY sure?")) {
      return;
    }

    localStorage.clear();
    loadStorage();
    alert("All data cleared. Refresh the page.");
  };

  const filteredItems = storageItems.filter(
    (item) =>
      item.key.toLowerCase().includes(searchFilter.toLowerCase()) ||
      item.value.toLowerCase().includes(searchFilter.toLowerCase())
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
              className="stroke-current shrink-0 h-6 w-6"
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
                Editing these values directly can break the application. Always export your data
                before making changes. After editing, refresh the page for changes to take effect.
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
                        <h3 className="font-bold font-mono text-sm break-all">{item.key}</h3>
                        {knownKey && (
                          <p className="text-xs text-gray-500 mt-1">{knownKey.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {!isEditing ? (
                          <>
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={() => handleEdit(item.key, item.value)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-ghost btn-xs text-error"
                              onClick={() => handleDelete(item.key)}
                            >
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
                          className="textarea textarea-bordered w-full font-mono text-xs"
                          rows={10}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                        />
                      ) : (
                        <pre className="bg-base-300 p-3 rounded text-xs overflow-x-auto max-h-64 overflow-y-auto">
                          {item.isValid
                            ? JSON.stringify(item.parsed, null, 2)
                            : item.value}
                        </pre>
                      )}
                    </div>

                    <div className="text-xs text-gray-500 mt-2">
                      Size: {new Blob([item.value]).size} bytes
                      {item.isValid && " • Valid JSON"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredItems.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {searchFilter ? "No items match your search" : "No localStorage data found"}
            </div>
          )}
        </div>
      </AppCard>
    </AppSection>
  );
}
