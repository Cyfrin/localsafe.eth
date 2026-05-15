"use client";

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AppSection from "@/app/components/AppSection";
import AppCard from "@/app/components/AppCard";
import { useToast } from "@/app/hooks/useToast";
import { useConfirm } from "@/app/hooks/useToast";

type Category = "app" | "cache" | "test" | "library";

interface KeyDescriptor {
  match: string | RegExp;
  category: Category;
  description: string;
  requiresReload?: boolean;
}

interface StorageItem {
  key: string;
  value: string;
  parsed: unknown;
  isJson: boolean;
  size: number;
  descriptor: KeyDescriptor;
}

// Catalog of localsafe's own keys + classification of common third-party SDK keys.
// Anything that doesn't match falls through to a generic "library" descriptor.
const KEY_CATALOG: KeyDescriptor[] = [
  // ---- app data ----
  {
    match: "MSIGUI_safeWalletData",
    category: "app",
    description: "Safes, address book, undeployed safes, visited safes — keyed by chain.",
    requiresReload: true,
  },
  {
    match: "MSIGUI_safeCurrentTxMap",
    category: "app",
    description: "Pending Safe transactions awaiting signatures, keyed by safe address.",
    requiresReload: true,
  },
  {
    match: "safe-messages",
    category: "app",
    description: "Pending off-chain Safe messages (EIP-1271 signatures), keyed by safe address.",
    requiresReload: true,
  },
  {
    match: "MSIG_wagmiConfigNetworks",
    category: "app",
    description: "Custom EVM network configurations (RPCs, Safe contract addresses).",
    requiresReload: true,
  },
  {
    match: "walletconnect-project-id",
    category: "app",
    description: "Your WalletConnect Cloud project ID. Required for WC sessions.",
    requiresReload: true,
  },
  {
    match: "coingecko-api-key",
    category: "app",
    description: "Optional CoinGecko API key for higher rate limits when fetching token prices.",
  },
  {
    match: "isdark",
    category: "app",
    description: "Theme preference: 'true' for dark, 'false' for light.",
  },
  {
    match: /^token-balances-0x[a-fA-F0-9]+-\d+$/,
    category: "app",
    description: "Tracked ERC-20 tokens for a specific safe on a specific chain.",
  },
  // ---- caches ----
  {
    match: "coingecko-price-cache",
    category: "cache",
    description: "Cached token prices from CoinGecko. Safe to clear at any time.",
  },
  // ---- test ----
  {
    match: "E2E_MODE",
    category: "test",
    description: "Enables end-to-end test mode. Set to 'true' to use the Playwright test fixtures.",
    requiresReload: true,
  },
];

const LIBRARY_PREFIXES = [
  { prefix: "wagmi", description: "Wagmi connector state (last connected wallet, chain id)." },
  { prefix: "rk-", description: "RainbowKit UI state (recent wallets, last connector)." },
  { prefix: "wc@", description: "WalletConnect v2 internal session/relay state." },
  { prefix: "WCM_", description: "WalletConnect modal state." },
  { prefix: "wcm_", description: "WalletConnect modal state." },
  { prefix: "@appkit", description: "Reown AppKit internal state." },
  { prefix: "reown", description: "Reown SDK state." },
  { prefix: "W3M", description: "Web3Modal legacy state." },
];

const GENERIC_LIBRARY_DESCRIPTOR: KeyDescriptor = {
  match: "",
  category: "library",
  description: "Library / SDK state. Editing this can break wallet connections — proceed carefully.",
};

function classify(key: string): KeyDescriptor {
  for (const d of KEY_CATALOG) {
    if (typeof d.match === "string" ? d.match === key : d.match.test(key)) return d;
  }
  for (const lib of LIBRARY_PREFIXES) {
    if (key.startsWith(lib.prefix)) {
      return { ...GENERIC_LIBRARY_DESCRIPTOR, description: lib.description };
    }
  }
  return GENERIC_LIBRARY_DESCRIPTOR;
}

const CATEGORY_LABEL: Record<Category, string> = {
  app: "APP DATA",
  cache: "CACHE",
  test: "TEST",
  library: "LIBRARY STATE",
};

const CATEGORY_ORDER: Category[] = ["app", "cache", "test", "library"];

export default function AdvancedSettingsClient() {
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm } = useConfirm();

  const [items, setItems] = useState<StorageItem[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);

  const [newKeyOpen, setNewKeyOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    loadStorage();
  }, []);

  const loadStorage = () => {
    if (typeof window === "undefined") return;
    const out: StorageItem[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) ?? "";
      let parsed: unknown = value;
      let isJson = false;
      try {
        parsed = JSON.parse(value);
        isJson = true;
      } catch {
        // plain string
      }
      out.push({
        key,
        value,
        parsed,
        isJson,
        size: new Blob([value]).size,
        descriptor: classify(key),
      });
    }
    out.sort((a, b) => {
      const aOrder = CATEGORY_ORDER.indexOf(a.descriptor.category);
      const bOrder = CATEGORY_ORDER.indexOf(b.descriptor.category);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.key.localeCompare(b.key);
    });
    setItems(out);
  };

  const beginEdit = (item: StorageItem) => {
    setEditingKey(item.key);
    setEditValue(item.isJson ? JSON.stringify(item.parsed, null, 2) : item.value);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue("");
  };

  const handleSave = async () => {
    if (!editingKey) return;
    const item = items.find((i) => i.key === editingKey);
    try {
      if (item?.isJson) JSON.parse(editValue);
      localStorage.setItem(editingKey, editValue);
      cancelEdit();
      loadStorage();
      if (item?.descriptor.requiresReload) {
        const ok = await confirm("Reload to apply changes?", "Reload required");
        if (ok) window.location.reload();
        else toast.warning("Saved. Manual refresh needed to apply.");
      } else {
        toast.success("Saved.");
      }
    } catch (error) {
      toast.error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleDelete = async (item: StorageItem) => {
    const ok = await confirm(
      `Delete "${item.key}"? This cannot be undone.`,
      item.descriptor.category === "library" ? "Delete library state" : "Delete key",
    );
    if (!ok) return;
    localStorage.removeItem(item.key);
    loadStorage();
    if (item.descriptor.requiresReload) {
      const reload = await confirm("Reload to apply changes?", "Reload required");
      if (reload) {
        window.location.reload();
        return;
      }
      toast.warning(`Deleted "${item.key}". Manual refresh needed to apply.`);
    } else {
      toast.success(`Deleted "${item.key}".`);
    }
  };

  const handleCreate = () => {
    const trimmedKey = newKey.trim();
    if (!trimmedKey) {
      toast.error("Key cannot be empty.");
      return;
    }
    if (localStorage.getItem(trimmedKey) !== null) {
      toast.error("Key already exists. Edit it instead.");
      return;
    }
    // If newValue parses as JSON, store the canonical form; otherwise store raw.
    let toStore = newValue;
    try {
      const parsed = JSON.parse(newValue);
      toStore = JSON.stringify(parsed);
    } catch {
      // not JSON, store as-is
    }
    localStorage.setItem(trimmedKey, toStore);
    setNewKeyOpen(false);
    setNewKey("");
    setNewValue("");
    loadStorage();
    toast.success(`Created "${trimmedKey}".`);
  };

  const handleExportAll = () => {
    const data: Record<string, unknown> = {};
    items.forEach((item) => {
      data[item.key] = item.isJson ? item.parsed : item.value;
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
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
          const ok = await confirm(
            `Overwrite ${Object.keys(data).length} localStorage entries from this file?`,
            "Import data",
          );
          if (!ok) return;
          Object.entries(data).forEach(([key, value]) => {
            const stringValue = typeof value === "string" ? value : JSON.stringify(value);
            localStorage.setItem(key, stringValue);
          });
          loadStorage();
          const reload = await confirm("Reload to apply the imported state?", "Reload required");
          if (reload) window.location.reload();
          else toast.success("Imported. Manual refresh needed to apply.");
        } catch (error) {
          toast.error(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleClearAll = async () => {
    const first = await confirm(
      "Clear ALL localStorage data? This wipes safes, networks, settings, and library state.",
      "Clear all",
    );
    if (!first) return;
    const second = await confirm("Absolutely sure? This cannot be undone.", "Final warning");
    if (!second) return;
    localStorage.clear();
    loadStorage();
    const reload = await confirm("Reload now?", "Reload required");
    if (reload) window.location.reload();
    else toast.success("All data cleared. Refresh the page.");
  };

  const filtered = useMemo(() => {
    const q = searchFilter.toLowerCase();
    return items.filter((item) => {
      if (!showLibrary && item.descriptor.category === "library") return false;
      if (!q) return true;
      return item.key.toLowerCase().includes(q) || item.value.toLowerCase().includes(q);
    });
  }, [items, searchFilter, showLibrary]);

  const byCategory = useMemo(() => {
    const map = new Map<Category, StorageItem[]>();
    filtered.forEach((item) => {
      const arr = map.get(item.descriptor.category) ?? [];
      arr.push(item);
      map.set(item.descriptor.category, arr);
    });
    return map;
  }, [filtered]);

  const libraryCount = items.filter((i) => i.descriptor.category === "library").length;
  const totalSize = useMemo(() => items.reduce((sum, i) => sum + i.size, 0), [items]);

  return (
    <AppSection className="max-w-4xl">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="border-base-content hover:bg-base-200 inline-flex items-center gap-2 border-2 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.15em] uppercase transition-colors"
        >
          <span aria-hidden>←</span>
          <span>back</span>
        </button>
        <span className="font-mono text-[11px] tracking-[0.2em] uppercase opacity-60">
          {items.length} keys · {formatBytes(totalSize)}
        </span>
      </div>

      <AppCard title="Advanced settings">
        <div className="flex flex-col gap-6">
          {/* Hazard notice */}
          <div className="surface-inset border-base-content flex gap-3 border-2 p-4">
            <span aria-hidden className="font-display text-primary text-xl leading-none">
              ⚠
            </span>
            <div className="flex flex-col gap-1 font-mono text-[12px] leading-relaxed">
              <span className="text-[11px] font-bold tracking-[0.2em] uppercase">caution</span>
              <span className="opacity-85">
                Editing these values directly can corrupt the application. Export your data first. Keys marked
                <span className="status-pill ml-1 align-middle">requires reload</span> will prompt you to reload after
                save or delete.
              </span>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="text"
              className="border-base-content bg-base-100 w-full border-2 px-3 py-2 font-mono text-sm focus:outline-none sm:max-w-sm"
              placeholder="search key or value…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="border-base-content hover:bg-base-200 border-2 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.15em] uppercase transition-colors"
                onClick={() => setNewKeyOpen((v) => !v)}
              >
                {newKeyOpen ? "× close" : "+ new key"}
              </button>
              <button
                className="border-base-content hover:bg-base-200 border-2 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.15em] uppercase transition-colors"
                onClick={handleExportAll}
              >
                export
              </button>
              <button
                className="border-base-content hover:bg-base-200 border-2 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.15em] uppercase transition-colors"
                onClick={handleImportAll}
              >
                import
              </button>
              <button
                className="border-error text-error hover:bg-error hover:text-error-content border-2 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.15em] uppercase transition-colors"
                onClick={handleClearAll}
              >
                clear all
              </button>
            </div>
          </div>

          {/* New key form */}
          {newKeyOpen && (
            <div className="surface-inset flex flex-col gap-3 p-4">
              <div className="ascii-label">new key</div>
              <input
                type="text"
                className="border-base-content bg-base-100 border-2 px-3 py-2 font-mono text-sm focus:outline-none"
                placeholder="key name (e.g. myCustomFlag)"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
              />
              <textarea
                className="border-base-content bg-base-100 min-h-32 border-2 p-3 font-mono text-xs focus:outline-none"
                placeholder='value — plain string or JSON, e.g. {"foo": "bar"}'
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button
                  className="border-base-content hover:bg-base-200 border-2 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.15em] uppercase transition-colors"
                  onClick={() => {
                    setNewKeyOpen(false);
                    setNewKey("");
                    setNewValue("");
                  }}
                >
                  cancel
                </button>
                <button
                  className="bg-base-content text-base-100 border-base-content hover:bg-base-100 hover:text-base-content border-2 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.15em] uppercase transition-colors"
                  onClick={handleCreate}
                >
                  create
                </button>
              </div>
            </div>
          )}

          {/* Category sections */}
          {CATEGORY_ORDER.map((cat) => {
            const list = byCategory.get(cat);
            if (cat !== "library" && !list?.length) return null;
            if (cat === "library" && !showLibrary) {
              return (
                <div
                  key={cat}
                  className="border-base-content/40 flex items-center justify-between border-2 border-dashed px-4 py-3"
                >
                  <span className="font-mono text-[11px] tracking-[0.2em] uppercase opacity-70">
                    {libraryCount} library / sdk keys hidden
                  </span>
                  <button
                    className="border-base-content hover:bg-base-200 border-2 px-3 py-1 font-mono text-[10px] font-bold tracking-[0.18em] uppercase transition-colors"
                    onClick={() => setShowLibrary(true)}
                  >
                    show
                  </button>
                </div>
              );
            }
            if (!list?.length) return null;
            return (
              <section key={cat} className="flex flex-col gap-3">
                <header className="flex items-center justify-between">
                  <span className="ascii-label">{CATEGORY_LABEL[cat]}</span>
                  <span className="font-mono text-[11px] tracking-[0.2em] uppercase opacity-50">{list.length}</span>
                </header>
                <div className="flex flex-col gap-3">
                  {list.map((item) => (
                    <StorageItemRow
                      key={item.key}
                      item={item}
                      isEditing={editingKey === item.key}
                      editValue={editValue}
                      onEditValueChange={setEditValue}
                      onEdit={() => beginEdit(item)}
                      onCancel={cancelEdit}
                      onSave={handleSave}
                      onDelete={() => handleDelete(item)}
                    />
                  ))}
                </div>
                {cat === "library" && (
                  <div className="flex justify-end">
                    <button
                      className="hover:bg-base-200 px-2 py-1 font-mono text-[10px] tracking-[0.18em] uppercase opacity-70 transition"
                      onClick={() => setShowLibrary(false)}
                    >
                      hide library keys
                    </button>
                  </div>
                )}
              </section>
            );
          })}

          {filtered.length === 0 && (
            <div className="py-12 text-center font-mono text-sm opacity-60">
              {searchFilter ? "no entries match your search" : "no localStorage data"}
            </div>
          )}
        </div>
      </AppCard>
    </AppSection>
  );
}

interface RowProps {
  item: StorageItem;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (v: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
}

function StorageItemRow({
  item,
  isEditing,
  editValue,
  onEditValueChange,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: RowProps) {
  return (
    <div className="surface flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-[13px] font-bold break-all">{item.key}</code>
            {item.descriptor.requiresReload && <span className="status-pill status-pill--warn">requires reload</span>}
            {!item.isJson && <span className="status-pill">plain text</span>}
          </div>
          <p className="mt-1 font-mono text-[11px] leading-relaxed opacity-70">{item.descriptor.description}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          {!isEditing ? (
            <>
              <button
                className="border-base-content hover:bg-base-200 border-2 px-2 py-1 font-mono text-[10px] font-bold tracking-[0.15em] uppercase transition-colors"
                onClick={onEdit}
              >
                edit
              </button>
              <button
                className="border-error text-error hover:bg-error hover:text-error-content border-2 px-2 py-1 font-mono text-[10px] font-bold tracking-[0.15em] uppercase transition-colors"
                onClick={onDelete}
              >
                delete
              </button>
            </>
          ) : (
            <>
              <button
                className="bg-base-content text-base-100 border-base-content hover:bg-base-100 hover:text-base-content border-2 px-2 py-1 font-mono text-[10px] font-bold tracking-[0.15em] uppercase transition-colors"
                onClick={onSave}
              >
                save
              </button>
              <button
                className="border-base-content hover:bg-base-200 border-2 px-2 py-1 font-mono text-[10px] font-bold tracking-[0.15em] uppercase transition-colors"
                onClick={onCancel}
              >
                cancel
              </button>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <textarea
          className="border-base-content bg-base-100 min-h-48 w-full border-2 p-3 font-mono text-[12px] leading-relaxed focus:outline-none"
          rows={12}
          value={editValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <pre className="bg-base-200 border-base-content/30 max-h-64 overflow-x-auto overflow-y-auto border p-3 font-mono text-[11px] leading-relaxed">
          {item.isJson ? JSON.stringify(item.parsed, null, 2) : item.value}
        </pre>
      )}

      <div className="flex flex-wrap gap-3 font-mono text-[10px] tracking-[0.15em] uppercase opacity-55">
        <span>{formatBytes(item.size)}</span>
        <span aria-hidden>·</span>
        <span>{item.isJson ? "valid json" : "string"}</span>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
