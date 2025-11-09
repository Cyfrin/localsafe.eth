"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import { fetchTokenPrice } from "@/app/utils/coingecko";
import { getCoinGeckoApiKey } from "./ApiKeyModal";
import ApiKeyModal from "./ApiKeyModal";
import TokenTransferModal from "./TokenTransferModal";

interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  name?: string;
}

interface TokenBalance extends TokenInfo {
  balance: string;
  usdPrice?: number;
  usdValue?: number;
}

interface TokenBalancesSectionProps {
  safeAddress: `0x${string}`;
  chainId: number;
}

const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
] as const;

export default function TokenBalancesSection({ safeAddress, chainId }: TokenBalancesSectionProps) {
  const publicClient = usePublicClient();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTokenAddress, setNewTokenAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [showAddToken, setShowAddToken] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonEditorValue, setJsonEditorValue] = useState("");
  const [jsonEditorError, setJsonEditorError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const STORAGE_KEY = `token-balances-${safeAddress}-${chainId}`;

  // Load tokens from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setTokens(JSON.parse(stored));
      } catch {
        setTokens([]);
      }
    } else {
      // Clear tokens and balances if switching to a chain/safe with no stored tokens
      setTokens([]);
      setBalances([]);
    }
  }, [STORAGE_KEY]);

  // Save tokens to localStorage
  useEffect(() => {
    if (tokens.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    }
  }, [tokens, STORAGE_KEY]);

  // Fetch USD prices for tokens
  const fetchPrices = useCallback(
    async (tokenBalances: TokenBalance[], apiKey: string) => {
      setFetchingPrices(true);
      try {
        const pricePromises = tokenBalances.map(async (token) => {
          const price = await fetchTokenPrice(token.address, chainId, apiKey);
          return { address: token.address, price };
        });

        const prices = await Promise.all(pricePromises);

        // Update balances with prices and calculated USD values
        setBalances((prevBalances) =>
          prevBalances.map((balance) => {
            const priceData = prices.find((p) => p.address.toLowerCase() === balance.address.toLowerCase());
            const usdPrice = priceData?.price ?? undefined;
            const usdValue = usdPrice ? parseFloat(balance.balance) * usdPrice : undefined;

            return {
              ...balance,
              usdPrice,
              usdValue,
            };
          }),
        );
      } catch (err) {
        console.error("Failed to fetch prices:", err);
      } finally {
        setFetchingPrices(false);
      }
    },
    [chainId],
  );

  // Fetch balances and prices when tokens change
  useEffect(() => {
    if (tokens.length === 0 || !publicClient) return;

    async function fetchBalances() {
      setLoading(true);
      try {
        if (!publicClient) return;
        const balancePromises = tokens.map(async (token) => {
          const balance = await publicClient.readContract({
            address: token.address as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [safeAddress],
          });

          return {
            ...token,
            balance: formatUnits(balance as bigint, token.decimals),
          };
        });

        const results = await Promise.all(balancePromises);
        setBalances(results);

        // Fetch prices if API key is available
        const apiKey = getCoinGeckoApiKey();
        if (apiKey) {
          fetchPrices(results, apiKey);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch balances");
      } finally {
        setLoading(false);
      }
    }

    fetchBalances();
  }, [tokens, publicClient, safeAddress, chainId, fetchPrices]);

  // Refresh prices manually
  function handleRefreshPrices() {
    const apiKey = getCoinGeckoApiKey();
    if (!apiKey) {
      setShowApiKeyModal(true);
      return;
    }
    if (balances.length > 0) {
      fetchPrices(balances, apiKey);
    }
  }

  // Add new token
  async function handleAddToken() {
    setError(null);
    if (!newTokenAddress || !publicClient) return;

    // Validate address
    if (!/^0x[a-fA-F0-9]{40}$/.test(newTokenAddress)) {
      setError("Invalid token address");
      return;
    }

    // Check if already added
    if (tokens.some((t) => t.address.toLowerCase() === newTokenAddress.toLowerCase())) {
      setError("Token already added");
      return;
    }

    try {
      // Fetch token info
      const [symbol, decimals, name] = await Promise.all([
        publicClient.readContract({
          address: newTokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "symbol",
        }),
        publicClient.readContract({
          address: newTokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "decimals",
        }),
        publicClient
          .readContract({
            address: newTokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "name",
          })
          .catch(() => ""),
      ]);

      setTokens([
        ...tokens,
        {
          address: newTokenAddress,
          symbol: symbol as string,
          decimals: decimals as number,
          name: name as string,
        },
      ]);
      setNewTokenAddress("");
      setShowAddToken(false);
    } catch {
      setError("Failed to fetch token info. Make sure it's a valid ERC20 token.");
    }
  }

  // Remove token
  function handleRemoveToken(address: string) {
    setTokens(tokens.filter((t) => t.address !== address));
    setBalances(balances.filter((b) => b.address !== address));
  }

  // Export tokens
  function handleExport() {
    const dataStr = JSON.stringify(tokens, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tokens-${safeAddress}-${chainId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Import tokens
  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (typeof result === "string") {
          const importedTokens = JSON.parse(result) as TokenInfo[];
          // Merge with existing, avoid duplicates
          const merged = [...tokens];
          importedTokens.forEach((token) => {
            if (!merged.some((t) => t.address.toLowerCase() === token.address.toLowerCase())) {
              merged.push(token);
            }
          });
          setTokens(merged);
        }
      } catch {
        setError("Invalid JSON file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // Open JSON editor
  function handleOpenJsonEditor() {
    setJsonEditorValue(JSON.stringify(tokens, null, 2));
    setJsonEditorError(null);
    setShowJsonEditor(true);
  }

  // Save JSON editor changes
  function handleSaveJsonEditor() {
    try {
      const parsed = JSON.parse(jsonEditorValue);
      if (!Array.isArray(parsed)) {
        setJsonEditorError("JSON must be an array of token objects");
        return;
      }
      // Validate each token has required fields
      for (const token of parsed) {
        if (!token.address || !token.symbol || typeof token.decimals !== "number") {
          setJsonEditorError("Each token must have address, symbol, and decimals fields");
          return;
        }
      }
      setTokens(parsed);
      setShowJsonEditor(false);
      setJsonEditorError(null);
    } catch (err) {
      setJsonEditorError("Invalid JSON: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  // Calculate total USD value
  const totalUsdValue = balances.reduce((sum, b) => sum + (b.usdValue || 0), 0);

  return (
    <div className="mb-6">
      <div className="divider" data-testid="token-balances-divider">
        Assets
      </div>

      {/* Header with actions */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-baseline gap-4">
          <h3 className="text-xl font-bold">Tokens</h3>
          {balances.length > 0 && (
            <div className="text-base-content">
              <span className="text-sm opacity-60">Total value: </span>
              <span className="text-lg font-semibold">
                $
                {totalUsdValue.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowApiKeyModal(true)}
            title="Configure CoinGecko API Key"
          >
            ⚙️ API
          </button>
          {balances.length > 0 && (
            <div className="tooltip" data-tip="Refresh Prices">
              <button className="btn btn-ghost btn-sm" onClick={handleRefreshPrices} disabled={fetchingPrices}>
                {fetchingPrices ? "⏳" : "🔄"}
              </button>
            </div>
          )}
          <button className="btn btn-outline btn-sm" onClick={handleOpenJsonEditor} title="Edit token list as JSON">
            Edit JSON
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleExport} disabled={tokens.length === 0}>
            Export
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleImportClick}>
            Import
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddToken(!showAddToken)}>
            + Add Token
          </button>
          <input type="file" className="hidden" ref={fileInputRef} accept=".json" onChange={handleImportFile} />
        </div>
      </div>

      {/* Add Token Form (collapsible) */}
      {showAddToken && (
        <div className="bg-base-200 mb-4 rounded-lg p-4">
          <div className="flex gap-2">
            <input
              type="text"
              className="input input-bordered flex-1 font-mono text-sm"
              placeholder="Token contract address (0x...)"
              value={newTokenAddress}
              onChange={(e) => setNewTokenAddress(e.target.value)}
              autoFocus
            />
            <button className="btn btn-primary btn-sm" onClick={handleAddToken} disabled={!newTokenAddress}>
              Add
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setShowAddToken(false);
                setNewTokenAddress("");
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
          {error && <div className="alert alert-error mt-2 text-sm">{error}</div>}
        </div>
      )}

      {/* API Key Warning */}
      {!getCoinGeckoApiKey() && balances.length > 0 && (
        <div className="alert alert-warning mb-4 text-sm">
          <span>
            Configure a CoinGecko API key to see USD prices.{" "}
            <button className="link link-primary" onClick={() => setShowApiKeyModal(true)}>
              Add API Key
            </button>
          </span>
        </div>
      )}

      {/* Token List Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : balances.length === 0 && tokens.length === 0 ? (
          <div className="bg-base-200 rounded-box p-8 text-center text-gray-400">
            No tokens added. Click &quot;+ Add Token&quot; to track token balances.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Price</th>
                <th>Balance</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {balances.map((token) => (
                <tr key={token.address} className="group hover:bg-base-200">
                  <td>
                    <div>
                      <div className="font-semibold">{token.symbol}</div>
                      <div className="text-xs opacity-60">{token.name}</div>
                    </div>
                  </td>
                  <td className="font-mono text-sm">
                    {token.usdPrice
                      ? `$${token.usdPrice.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                      : "-"}
                  </td>
                  <td className="font-mono text-sm">
                    {parseFloat(token.balance).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}{" "}
                    {token.symbol}
                  </td>
                  <td className="font-mono text-sm font-semibold">
                    {token.usdValue
                      ? `$${token.usdValue.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                      : "-"}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-primary btn-xs opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => {
                          setSelectedToken(token);
                          setShowTransferModal(true);
                        }}
                      >
                        Transfer
                      </button>
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => handleRemoveToken(token.address)}
                        title="Remove token"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* API Key Settings Modal */}
      <ApiKeyModal
        open={showApiKeyModal}
        onClose={() => {
          setShowApiKeyModal(false);
          // Refresh prices if API key was just added
          const apiKey = getCoinGeckoApiKey();
          if (apiKey && balances.length > 0) {
            fetchPrices(balances, apiKey);
          }
        }}
      />

      {/* Token Transfer Modal */}
      {selectedToken && (
        <TokenTransferModal
          open={showTransferModal}
          onClose={() => {
            setShowTransferModal(false);
            setSelectedToken(null);
          }}
          tokenAddress={selectedToken.address}
          tokenSymbol={selectedToken.symbol}
          tokenDecimals={selectedToken.decimals}
          tokenBalance={selectedToken.balance}
          safeAddress={safeAddress}
        />
      )}

      {/* JSON Editor Modal */}
      {showJsonEditor && (
        <div className="modal modal-open">
          <div className="modal-box max-w-4xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Edit Token List (JSON)</h3>
              <button className="btn btn-ghost btn-sm btn-circle" onClick={() => setShowJsonEditor(false)}>
                ✕
              </button>
            </div>

            <div className="alert alert-info mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                className="h-6 w-6 shrink-0 stroke-current"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
              <div className="text-sm">
                <p className="font-semibold">Token List Format</p>
                <p>
                  Each token must have: address (string), symbol (string), decimals (number), and optionally name
                  (string)
                </p>
              </div>
            </div>

            <textarea
              className="textarea textarea-bordered w-full font-mono text-sm"
              rows={20}
              value={jsonEditorValue}
              onChange={(e) => setJsonEditorValue(e.target.value)}
              placeholder='[\n  {\n    "address": "0x...",\n    "symbol": "USDT",\n    "decimals": 6,\n    "name": "Tether USD"\n  }\n]'
            />

            {jsonEditorError && (
              <div className="alert alert-error mt-2">
                <span>{jsonEditorError}</span>
              </div>
            )}

            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setShowJsonEditor(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveJsonEditor}>
                Save Changes
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowJsonEditor(false)}></div>
        </div>
      )}
    </div>
  );
}
