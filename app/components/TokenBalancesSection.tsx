"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import { fetchTokenPrice } from "@/app/utils/coingecko";
import { fetchOctavPortfolio, octavKeyForChain, type OctavPortfolio } from "@/app/utils/octav";
import { getOctavEnabled, useOctavEnabled } from "@/app/utils/octav-enabled";
import { ERC20_ABI } from "@/app/utils/erc20-abi";
import ApiKeyModal, { getCoinGeckoApiKey, getOctavApiKey } from "./ApiKeyModal";
import OctavPortfolioPanel from "./OctavPortfolioPanel";
import TokenTransferModal from "./TokenTransferModal";
import TokensAddTokenForm from "./TokensAddTokenForm";
import TokensTable from "./TokensTable";
import TokensJsonEditorModal from "./TokensJsonEditorModal";

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

export default function TokenBalancesSection({ safeAddress, chainId }: TokenBalancesSectionProps) {
  const publicClient = usePublicClient();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTokenInput, setNewTokenInput] = useState("");
  const [newTokenAddress, setNewTokenAddress] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [showAddToken, setShowAddToken] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonEditorValue, setJsonEditorValue] = useState("");
  const [jsonEditorError, setJsonEditorError] = useState<string | null>(null);
  const [octavDiscovering, setOctavDiscovering] = useState(false);
  const [octavMessage, setOctavMessage] = useState<string | null>(null);
  const [octavPortfolio, setOctavPortfolio] = useState<OctavPortfolio | null>(null);
  // Tracks whether the API-settings modal was opened because the user tried
  // to Enrich without an Octav key — if so, re-attempt the enrich once the
  // modal closes with a key now configured.
  const [pendingOctavDiscover, setPendingOctavDiscover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const octavSupportsChain = octavKeyForChain(chainId) !== null;
  const octavEnabled = useOctavEnabled();
  // Octav features are gated by both the chain-support map AND the user's
  // per-app preference. When disabled, the discover button, panel mount, and
  // panel state are all suppressed; any previously-fetched portfolio is
  // dropped so re-enabling shows a clean slate rather than stale data.
  const octavAvailable = octavSupportsChain && octavEnabled;
  useEffect(() => {
    // setState(null) is idempotent when state is already null — no need to
    // read `octavPortfolio` (which would refire the effect on every fetch).
    if (!octavEnabled) setOctavPortfolio(null);
  }, [octavEnabled]);

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
        // Preserve any USD prices already on the balances row (Octav-derived
        // or freshly fetched from CoinGecko) — otherwise the on-chain
        // balance refresh would blank the Price/Value cells until the next
        // CoinGecko round-trip completes. usdValue gets recomputed against
        // the new balance so it stays in sync if the holding moved.
        setBalances((prev) =>
          results.map((r) => {
            const prevRow = prev.find((p) => p.address.toLowerCase() === r.address.toLowerCase());
            if (prevRow?.usdPrice !== undefined) {
              const parsed = parseFloat(r.balance);
              return {
                ...r,
                usdPrice: prevRow.usdPrice,
                usdValue: Number.isFinite(parsed) ? parsed * prevRow.usdPrice : undefined,
              };
            }
            return r;
          }),
        );

        // CoinGecko's public API works without a key (rate-limited); pass
        // through whatever the user has configured for higher limits.
        fetchPrices(results, getCoinGeckoApiKey() ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch balances");
      } finally {
        setLoading(false);
      }
    }

    fetchBalances();
  }, [tokens, publicClient, safeAddress, chainId, fetchPrices]);

  // Refresh prices manually. Works without a CoinGecko key thanks to
  // the public keyless API; a key just unlocks higher rate limits.
  function handleRefreshPrices() {
    if (balances.length > 0) {
      fetchPrices(balances, getCoinGeckoApiKey() ?? "");
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
      setNewTokenInput("");
      setNewTokenAddress(undefined);
      setShowAddToken(false);
    } catch {
      setError("Failed to fetch token info. Make sure it's a valid ERC20 token.");
    }
  }

  // Enrich the Safe view with Octav. Fetches both:
  //   1. the structured portfolio (DeFi protocol positions, networth,
  //      chain breakdown) for the Octav panel that mounts above this table
  //   2. the flat wallet-token list that merges into the existing Tokens
  //      table so the Transfer + on-chain refresh flow keeps working
  // Opens the API-key modal if no key is configured.
  async function handleOctavDiscover() {
    setError(null);
    setOctavMessage(null);
    const apiKey = getOctavApiKey();
    if (!apiKey) {
      setPendingOctavDiscover(true);
      setShowApiKeyModal(true);
      return;
    }
    if (!octavSupportsChain) {
      setError(`Octav doesn't support chainId ${chainId} yet.`);
      return;
    }
    setOctavDiscovering(true);
    try {
      const portfolio = await fetchOctavPortfolio(safeAddress, chainId, apiKey);
      // The user may have toggled Octav off while the fetch was in flight —
      // drop the response so we don't mutate state for a now-disabled feature.
      if (!getOctavEnabled()) {
        setOctavDiscovering(false);
        return;
      }
      setOctavPortfolio(portfolio);
      const discovered = portfolio.walletTokens;

      // Functional setters so a manual `+ Add Token` that races this fetch
      // isn't silently dropped by reading a stale snapshot of `tokens`.
      setTokens((prev) => {
        const have = new Set(prev.map((t) => t.address.toLowerCase()));
        const toAdd: TokenInfo[] = discovered
          .filter((d) => !have.has(d.address.toLowerCase()))
          .map((d) => ({
            address: d.address,
            symbol: d.symbol,
            decimals: d.decimals,
            name: d.name,
          }));
        return toAdd.length ? [...prev, ...toAdd] : prev;
      });

      // Seed balances + USD values directly from Octav so the table populates
      // without waiting for on-chain reads or a CoinGecko fetch. Built off
      // `prev` (the latest balances) + the Octav payload so we don't lose
      // any row added while the fetch was in flight.
      const byAddr = new Map(discovered.map((d) => [d.address.toLowerCase(), d]));
      setBalances((prev) => {
        const seen = new Set<string>();
        const out: TokenBalance[] = [];
        for (const b of prev) {
          const key = b.address.toLowerCase();
          seen.add(key);
          const d = byAddr.get(key);
          out.push(d ? { ...b, balance: d.balance, usdPrice: d.usdPrice, usdValue: d.usdValue } : b);
        }
        for (const d of discovered) {
          const key = d.address.toLowerCase();
          if (seen.has(key)) continue;
          out.push({
            address: d.address,
            symbol: d.symbol,
            decimals: d.decimals,
            name: d.name,
            balance: d.balance,
            usdPrice: d.usdPrice,
            usdValue: d.usdValue,
          });
        }
        return out;
      });

      const protoCount = portfolio.protocols.length;
      setOctavMessage(
        `Enriched: ${discovered.length} wallet token${discovered.length === 1 ? "" : "s"}` +
          (protoCount > 0 ? `, ${protoCount} protocol position${protoCount === 1 ? "" : "s"}` : "") +
          `. Networth $${portfolio.networth.toLocaleString(undefined, { maximumFractionDigits: 2 })}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Octav portfolio fetch failed");
    } finally {
      setOctavDiscovering(false);
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
          {/* API settings — inline gear SVG with currentColor so the icon
           *  flips black/white with the theme just like the refresh icon. */}
          <button
            className="btn btn-outline btn-sm gap-1.5"
            onClick={() => setShowApiKeyModal(true)}
            title="Configure API keys (CoinGecko, Octav)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="square"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            API
          </button>
          {octavAvailable && (
            <div
              className="tooltip"
              data-tip={getOctavApiKey() ? "Pull tokens + DeFi positions via Octav" : "Configure Octav API Key"}
            >
              {/* Octav-branded action — red #FF1A45 + white icon + black
               *  border, inheriting daisyUI's offset-shadow from the
               *  `btn` primitive so it stays in-theme. Mirrors the
               *  "Powered by Octav" attribution in the DeFi panel. */}
              <button
                className="btn btn-sm border-base-content gap-2 font-semibold whitespace-nowrap text-white hover:opacity-90"
                style={{ backgroundColor: "#FF1A45" }}
                onClick={handleOctavDiscover}
                disabled={octavDiscovering}
              >
                <img
                  src="/octav-icon.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-4 w-4"
                  style={{ filter: "brightness(0) invert(1)" }}
                />
                {octavDiscovering ? "Enriching…" : "Enrich with Octav"}
              </button>
            </div>
          )}
          {balances.length > 0 && (
            <div className="tooltip" data-tip="Refresh Prices">
              {/* Refresh button — inherits the brutalist border + offset
               *  shadow from `btn-outline`. The SVG uses `currentColor` so
               *  the stroke flips black/white with the theme automatically;
               *  a slow spin animation runs while a refresh is in flight. */}
              <button
                className="btn btn-outline btn-sm px-2"
                onClick={handleRefreshPrices}
                disabled={fetchingPrices}
                aria-label="Refresh prices"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  strokeLinecap="square"
                  className={fetchingPrices ? "animate-spin" : ""}
                  aria-hidden="true"
                >
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                  <path d="M3 21v-5h5" />
                </svg>
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

      {showAddToken && (
        <TokensAddTokenForm
          value={newTokenInput}
          onChange={setNewTokenInput}
          onResolvedAddressChange={setNewTokenAddress}
          resolvedAddress={newTokenAddress}
          onAdd={handleAddToken}
          onCancel={() => {
            setShowAddToken(false);
            setNewTokenInput("");
            setNewTokenAddress(undefined);
            setError(null);
          }}
          error={error}
        />
      )}

      {/* CoinGecko API key is OPTIONAL — the public keyless endpoint
       *  handles low-volume usage. A key only matters for higher rate
       *  limits, so this banner just nudges instead of warning. */}
      {!getCoinGeckoApiKey() && balances.length > 0 && (
        <div className="alert alert-info mb-4 text-sm">
          <span>
            Prices use CoinGecko&apos;s public API (rate-limited).{" "}
            <button className="link link-primary" onClick={() => setShowApiKeyModal(true)}>
              Add an API key
            </button>{" "}
            for higher limits.
          </span>
        </div>
      )}

      {/* Octav auto-discover result banner */}
      {octavMessage && (
        <div className="alert alert-info mb-4 text-sm">
          <span>{octavMessage}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setOctavMessage(null)}>
            ✕
          </button>
        </div>
      )}

      <TokensTable
        balances={balances}
        loading={loading}
        hasTokens={tokens.length > 0}
        onTransfer={(row) => {
          setSelectedToken(row as TokenBalance);
          setShowTransferModal(true);
        }}
        onRemove={handleRemoveToken}
      />

      {/* Octav-derived DeFi positions panel — renders BELOW the Tokens
       *  table so wallet holdings come first, then non-wallet protocol
       *  positions (Aave/Beefy/Pendle/…). Hidden until "Enrich with
       *  Octav". Styled with the same `divider` + `table` primitives the
       *  Tokens section uses, so the active theme's offset-shadow look
       *  applies uniformly. */}
      {octavEnabled && octavPortfolio && (
        <OctavPortfolioPanel
          portfolio={octavPortfolio}
          currentChainKey={octavKeyForChain(chainId) ?? undefined}
          onDismiss={() => setOctavPortfolio(null)}
        />
      )}

      {/* Unified API Settings Modal — handles both CoinGecko and Octav.
       *  Opens via the header ⚙️ button or automatically when the user
       *  clicks "Enrich with Octav" without a key configured. */}
      <ApiKeyModal
        open={showApiKeyModal}
        onClose={() => {
          setShowApiKeyModal(false);
          // Refresh prices when modal closes — works keyless, with a key
          // if one was just added, faster.
          if (balances.length > 0) {
            fetchPrices(balances, getCoinGeckoApiKey() ?? "");
          }
          // If the user opened the modal trying to enrich, retry now that
          // they (presumably) saved a key.
          if (pendingOctavDiscover) {
            setPendingOctavDiscover(false);
            if (getOctavApiKey()) {
              void handleOctavDiscover();
            }
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

      <TokensJsonEditorModal
        open={showJsonEditor}
        value={jsonEditorValue}
        onChange={setJsonEditorValue}
        error={jsonEditorError}
        onSave={handleSaveJsonEditor}
        onClose={() => setShowJsonEditor(false)}
      />
    </div>
  );
}
