"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Chain } from "wagmi/chains";
import { WAGMI_CONFIG_NETWORKS_KEY } from "../utils/constants";
import { WagmiProvider } from "wagmi";
import { fallback, injected, unstable_connector } from "@wagmi/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, lightTheme, darkTheme, connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
  injectedWallet,
  ledgerWallet,
  oneKeyWallet,
  rabbyWallet,
  phantomWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { type Address, getAddress, defineChain } from "viem";
import {
  e2eConnector,
  createE2EProvider,
  setSigningAccount,
  setChain,
  type SigningAccountInput,
} from "@wonderland/walletless";

// Second Anvil chain for E2E multi-chain testing (only used in E2E mode)
const anvilTwo = defineChain({
  id: 31338,
  name: "Anvil Two",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8546"] },
  },
  testnet: true,
});

// BattleChain mainnet — not yet in viem/chains
const battlechain = defineChain({
  id: 626,
  name: "BattleChain",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: ["https://mainnet.battlechain.com"] },
  },
});

// Extend Window interface for E2E testing utilities
declare global {
  interface Window {
    __e2e?: {
      setSigningAccount: (account: SigningAccountInput) => Promise<void>;
      setChain: (chainId: number) => void;
      reconnect: () => Promise<void>;
    };
  }
}
import {
  mainnet,
  sepolia,
  anvil,
  gnosis,
  polygon,
  polygonZkEvm,
  bsc,
  optimism,
  base,
  linea,
  scroll,
  celo,
  avalanche,
  mantle,
  arbitrum,
  baseSepolia,
  zkSync,
  zora,
  story,
} from "wagmi/chains";
import ethereumIcon from "../assets/chainIcons/ethereum.svg";
import arbitrumIcon from "../assets/chainIcons/arbitrum.svg";
import optimismIcon from "../assets/chainIcons/optimism.svg";
import baseIcon from "../assets/chainIcons/base.svg";
import polygonIcon from "../assets/chainIcons/polygon.svg";
import zkSyncIcon from "../assets/chainIcons/zksync.svg";
import zoraIcon from "../assets/chainIcons/zora.svg";
import scrollIcon from "../assets/chainIcons/scroll.svg";
import lineaIcon from "../assets/chainIcons/linea.svg";
import gnosisIcon from "../assets/chainIcons/gnosis.svg";
import bscIcon from "../assets/chainIcons/bsc.svg";
import avalancheIcon from "../assets/chainIcons/avalanche.svg";
import celoIcon from "../assets/chainIcons/celo.svg";
import mantleIcon from "../assets/chainIcons/mantle.svg";
import storyIcon from "../assets/chainIcons/story.svg";
import battlechainIcon from "../assets/chainIcons/battlechain.svg";
import hardhatIcon from "../assets/chainIcons/hardhat.svg";

// Helper to add icon URLs to chains
const addChainIcon = (chain: Chain, iconUrl: string): Chain =>
  ({
    ...chain,
    iconUrl,
  }) as Chain;

// Helper to override chain RPC URL if env variable is set
const withOptionalRpcOverride = (chain: Chain, envRpcUrl: string | undefined): Chain => {
  if (!envRpcUrl) return chain;
  return {
    ...chain,
    rpcUrls: {
      ...chain.rpcUrls,
      default: { http: [envRpcUrl] },
    },
  };
};

// Default chains that should always be available with local SVG icons
// All chains support RPC override via env vars for reliability and privacy
const DEFAULT_CHAINS: Chain[] = [
  addChainIcon(withOptionalRpcOverride(mainnet, process.env.NEXT_PUBLIC_MAINNET_RPC_URL), ethereumIcon.src),
  addChainIcon(withOptionalRpcOverride(battlechain, process.env.NEXT_PUBLIC_BATTLECHAIN_RPC_URL), battlechainIcon.src),
  addChainIcon(withOptionalRpcOverride(arbitrum, process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL), arbitrumIcon.src),
  addChainIcon(withOptionalRpcOverride(optimism, process.env.NEXT_PUBLIC_OPTIMISM_RPC_URL), optimismIcon.src),
  addChainIcon(withOptionalRpcOverride(base, process.env.NEXT_PUBLIC_BASE_RPC_URL), baseIcon.src),
  addChainIcon(withOptionalRpcOverride(polygon, process.env.NEXT_PUBLIC_POLYGON_RPC_URL), polygonIcon.src),
  addChainIcon(withOptionalRpcOverride(polygonZkEvm, process.env.NEXT_PUBLIC_POLYGON_ZKEVM_RPC_URL), polygonIcon.src),
  addChainIcon(withOptionalRpcOverride(zkSync, process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL), zkSyncIcon.src),
  addChainIcon(withOptionalRpcOverride(zora, process.env.NEXT_PUBLIC_ZORA_RPC_URL), zoraIcon.src),
  addChainIcon(withOptionalRpcOverride(scroll, process.env.NEXT_PUBLIC_SCROLL_RPC_URL), scrollIcon.src),
  addChainIcon(withOptionalRpcOverride(linea, process.env.NEXT_PUBLIC_LINEA_RPC_URL), lineaIcon.src),
  addChainIcon(withOptionalRpcOverride(gnosis, process.env.NEXT_PUBLIC_GNOSIS_RPC_URL), gnosisIcon.src),
  addChainIcon(withOptionalRpcOverride(bsc, process.env.NEXT_PUBLIC_BSC_RPC_URL), bscIcon.src),
  addChainIcon(withOptionalRpcOverride(avalanche, process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL), avalancheIcon.src),
  addChainIcon(withOptionalRpcOverride(celo, process.env.NEXT_PUBLIC_CELO_RPC_URL), celoIcon.src),
  addChainIcon(withOptionalRpcOverride(mantle, process.env.NEXT_PUBLIC_MANTLE_RPC_URL), mantleIcon.src),
  addChainIcon(withOptionalRpcOverride(story, process.env.NEXT_PUBLIC_STORY_RPC_URL), storyIcon.src),
  addChainIcon(withOptionalRpcOverride(sepolia, process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL), ethereumIcon.src),
  addChainIcon(withOptionalRpcOverride(baseSepolia, process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL), baseIcon.src),
  addChainIcon(anvil, hardhatIcon.src), // Uses hardhat icon for local dev
];

// viem's bundled default mainnet RPC. The app never sends traffic there: mainnet
// reads (ENS resolution) only happen through the connected wallet or an RPC the user
// explicitly chose (env override or network settings).
const VIEM_MAINNET_DEFAULT_RPC = mainnet.rpcUrls.default.http[0];

/** Whether the user has explicitly chosen a mainnet RPC (env override or network settings). */
export function isMainnetRpcConfigured(chains: Chain[]): boolean {
  const mainnetChain = chains.find((chain) => chain.id === mainnet.id);
  const rpcUrl = mainnetChain?.rpcUrls?.default?.http?.[0];
  return !!rpcUrl && rpcUrl !== VIEM_MAINNET_DEFAULT_RPC;
}

// One-time additive migrations for users with a persisted chain list: each step runs
// exactly once, so removing a migrated-in chain afterwards still sticks.
const CHAIN_LIST_MIGRATION_KEY = "MSIG_wagmiConfigNetworksMigration";
const CHAIN_LIST_MIGRATION = 2; // 1: add battlechain (626); 2: battlechain icon

function migrateStoredChains(stored: Chain[]): Chain[] {
  const applied = Number(localStorage.getItem(CHAIN_LIST_MIGRATION_KEY) || "0");
  if (applied >= CHAIN_LIST_MIGRATION) return stored;
  localStorage.setItem(CHAIN_LIST_MIGRATION_KEY, String(CHAIN_LIST_MIGRATION));
  const battlechainEntry = DEFAULT_CHAINS.find((chain) => chain.id === battlechain.id)!;
  const migrated = [...stored];
  if (applied < 1 && !migrated.some((chain) => chain.id === battlechain.id)) {
    const mainnetIndex = migrated.findIndex((chain) => chain.id === mainnet.id);
    migrated.splice(mainnetIndex + 1, 0, battlechainEntry);
  }
  if (applied < 2) {
    const index = migrated.findIndex((chain) => chain.id === battlechain.id);
    if (index !== -1 && !(migrated[index] as Chain & { iconUrl?: string }).iconUrl) {
      migrated[index] = addChainIcon(migrated[index], battlechainIcon.src);
    }
  }
  return migrated;
}

export interface WagmiConfigContextType {
  configChains: Chain[];
  setConfigChains: React.Dispatch<React.SetStateAction<Chain[]>>;
  wagmiConfig: ReturnType<typeof createConfig>;
}

const WagmiConfigContext = createContext<WagmiConfigContextType | undefined>(undefined);

export const WagmiConfigProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [configChains, setConfigChains] = useState<Chain[]>(DEFAULT_CHAINS);

  const [chainsLoaded, setChainsLoaded] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isE2E, setIsE2E] = useState(false);

  // Refs to hold E2E provider and config for use in window.__e2e
  const e2eProviderRef = useRef<ReturnType<typeof createE2EProvider> | null>(null);
  const e2eConfigRef = useRef<ReturnType<typeof createConfig> | null>(null);

  // Ensure we're on the client side before initializing
  useEffect(() => {
    setIsMounted(true);
    // Check for E2E mode on mount (set by Playwright's addInitScript before page load)
    setIsE2E(typeof window !== "undefined" && window.localStorage.getItem("E2E_MODE") === "true");
  }, []);

  // Load chains from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setConfigChains(DEFAULT_CHAINS);
      const stored = localStorage.getItem(WAGMI_CONFIG_NETWORKS_KEY);
      if (stored) {
        try {
          setConfigChains(migrateStoredChains(JSON.parse(stored)));
        } catch {
          setConfigChains(DEFAULT_CHAINS);
        }
      } else {
        setConfigChains(DEFAULT_CHAINS);
      }
      setChainsLoaded(true);
    }
  }, []);

  // Save chains to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== "undefined" && chainsLoaded) {
      localStorage.setItem(WAGMI_CONFIG_NETWORKS_KEY, JSON.stringify(configChains));
    }
  }, [configChains, chainsLoaded]);

  // Compute wagmi config from chains - only on client side
  const wagmiConfig = useMemo(() => {
    if (!isMounted) return null;

    // Create transports object that uses wallet provider's RPC (EIP-1193)
    // This ensures we use the user's wallet RPC instead of public RPC endpoints
    const mainnetConfigured = isMainnetRpcConfigured(configChains);
    const transports = configChains.reduce(
      (acc, chain) => {
        // Fallback to the chain's RPC if the connector doesn't respond — except
        // mainnet, where viem's bundled public RPC is never used implicitly: ENS
        // reads go through the wallet or an RPC the user explicitly configured
        const useHttpFallback = chain.id !== mainnet.id || mainnetConfigured;
        acc[chain.id] = fallback([unstable_connector(injected), ...(useHttpFallback ? [http()] : [])]);
        return acc;
      },
      {} as Record<number, ReturnType<typeof fallback>>,
    );

    // In E2E mode, use the walletless e2eConnector for automated testing
    if (isE2E) {
      // Only create provider and config once, then reuse from refs
      // This ensures we always use the same instance even when useMemo re-runs
      if (!e2eProviderRef.current || !e2eConfigRef.current) {
        // Create the provider directly so we can store a reference for tests
        // and pass it to the connector so both use the same provider instance
        // Include anvilTwo for multi-chain E2E testing
        const e2eProvider = createE2EProvider({
          chains: [anvil, anvilTwo],
          rpcUrls: {
            [anvil.id]: "http://127.0.0.1:8545",
            [anvilTwo.id]: "http://127.0.0.1:8546",
          },
          debug: true,
        });

        // Add anvilTwo to chains for E2E mode (not in DEFAULT_CHAINS to avoid cluttering prod UI)
        const e2eChains = [...configChains, addChainIcon(anvilTwo, hardhatIcon.src)];

        // Build transports for E2E chains including anvilTwo
        const e2eMainnetConfigured = isMainnetRpcConfigured(e2eChains);
        const e2eTransports = e2eChains.reduce(
          (acc, chain) => {
            if (chain.id === anvilTwo.id) {
              acc[chain.id] = fallback([http("http://127.0.0.1:8546")]);
            } else {
              const useHttpFallback = chain.id !== mainnet.id || e2eMainnetConfigured;
              acc[chain.id] = fallback([unstable_connector(injected), ...(useHttpFallback ? [http()] : [])]);
            }
            return acc;
          },
          {} as Record<number, ReturnType<typeof fallback>>,
        );

        const e2eWagmiConfig = createConfig({
          chains: e2eChains as [typeof mainnet, ...[typeof mainnet]],
          connectors: [
            e2eConnector({
              provider: e2eProvider,
            }),
          ],
          transports: e2eTransports,
          ssr: false,
        });

        e2eProviderRef.current = e2eProvider;
        e2eConfigRef.current = e2eWagmiConfig;
      }

      // Return the config from ref to ensure we always use the same instance
      return e2eConfigRef.current;
    }

    // Configure wallets explicitly to exclude Coinbase Wallet (which phones home)
    const connectors = connectorsForWallets(
      [
        {
          groupName: "Popular",
          wallets: [metaMaskWallet, rabbyWallet, rainbowWallet, phantomWallet],
        },
        {
          groupName: "Hardware",
          wallets: [ledgerWallet, oneKeyWallet],
        },
        {
          groupName: "More",
          wallets: [walletConnectWallet, injectedWallet],
        },
      ],
      {
        appName: "localsafe.eth",
        projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
      },
    );

    return createConfig({
      chains: configChains as [typeof mainnet, ...[typeof mainnet]],
      connectors,
      transports,
      ssr: false,
    });
  }, [configChains, isMounted, isE2E]);

  const [queryClient] = useState(() => new QueryClient());

  // Set up window.__e2e for Playwright tests - must be in useEffect to access current refs
  useEffect(() => {
    if (!isE2E || typeof window === "undefined") return;

    window.__e2e = {
      setSigningAccount: async (account: SigningAccountInput) => {
        const provider = e2eProviderRef.current;

        if (!provider) {
          console.error("[E2E] Provider not initialized");
          return;
        }

        // Update the provider's signing account
        // This will emit accountsChanged event which the connector listens to
        // and forwards to wagmi via config.emitter.emit("change", { accounts })
        setSigningAccount(provider, account);

        // Get the new address for logging
        const newAddresses = await provider.request<Address[]>({ method: "eth_accounts" });
        if (newAddresses && newAddresses.length > 0) {
          const checksummedAddress = getAddress(newAddresses[0]);
          console.log("[E2E] Account changed to:", checksummedAddress);
        }
      },
      setChain: (chainId: number) => {
        const provider = e2eProviderRef.current;

        if (!provider) {
          console.error("[E2E] Provider not initialized");
          return;
        }

        // Switch the provider's active chain
        // This will emit chainChanged event which wagmi listens to
        setChain(provider, chainId);
        console.log("[E2E] Chain switched to:", chainId);
      },
      reconnect: async () => {
        // No-op for now
      },
    };
  }, [isE2E]);

  // Don't render providers until client-side mounted
  if (!isMounted || !wagmiConfig) {
    return null;
  }

  return (
    <WagmiConfigContext.Provider value={{ configChains, setConfigChains, wagmiConfig }}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            theme={{
              lightMode: lightTheme({
                accentColor: "#0a0908",
                accentColorForeground: "#f1ece0",
                borderRadius: "none",
                fontStack: "system",
                overlayBlur: "none",
              }),
              darkMode: darkTheme({
                accentColor: "#f1ece0",
                accentColorForeground: "#0a0908",
                borderRadius: "none",
                fontStack: "system",
                overlayBlur: "none",
              }),
            }}
          >
            {children}
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </WagmiConfigContext.Provider>
  );
};

export function useWagmiConfigContext() {
  const ctx = useContext(WagmiConfigContext);
  if (!ctx) throw new Error("useWagmiConfigContext must be used within a WagmiConfigProvider");
  return ctx;
}
