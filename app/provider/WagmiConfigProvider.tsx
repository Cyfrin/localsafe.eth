"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Chain } from "wagmi/chains";
import { WAGMI_CONFIG_NETWORKS_KEY } from "../utils/constants";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";
import {
  RainbowKitProvider,
  lightTheme,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
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
import hardhatIcon from "../assets/chainIcons/hardhat.svg";

// Helper to add icon URLs to chains
const addChainIcon = (chain: Chain, iconUrl: string): Chain => ({
  ...chain,
  iconUrl,
} as Chain);

// Default chains that should always be available with local SVG icons
const DEFAULT_CHAINS: Chain[] = [
  addChainIcon(mainnet, ethereumIcon.src),
  addChainIcon(arbitrum, arbitrumIcon.src),
  addChainIcon(optimism, optimismIcon.src),
  addChainIcon(base, baseIcon.src),
  addChainIcon(polygon, polygonIcon.src),
  addChainIcon(polygonZkEvm, polygonIcon.src), // Uses same polygon icon
  addChainIcon(zkSync, zkSyncIcon.src),
  addChainIcon(zora, zoraIcon.src),
  addChainIcon(scroll, scrollIcon.src),
  addChainIcon(linea, lineaIcon.src),
  addChainIcon(gnosis, gnosisIcon.src),
  addChainIcon(bsc, bscIcon.src),
  addChainIcon(avalanche, avalancheIcon.src),
  addChainIcon(celo, celoIcon.src),
  addChainIcon(mantle, mantleIcon.src),
  addChainIcon(sepolia, ethereumIcon.src), // Uses ethereum icon
  addChainIcon(baseSepolia, baseIcon.src), // Uses base icon
  addChainIcon(anvil, hardhatIcon.src), // Uses hardhat icon for local dev
];

export interface WagmiConfigContextType {
  configChains: Chain[];
  setConfigChains: React.Dispatch<React.SetStateAction<Chain[]>>;
  wagmiConfig: ReturnType<typeof getDefaultConfig>;
}

const WagmiConfigContext = createContext<WagmiConfigContextType | undefined>(
  undefined,
);

export const WagmiConfigProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [configChains, setConfigChains] = useState<Chain[]>(DEFAULT_CHAINS);

  const [chainsLoaded, setChainsLoaded] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Ensure we're on the client side before initializing
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Load chains from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setConfigChains(DEFAULT_CHAINS);
      const stored = localStorage.getItem(WAGMI_CONFIG_NETWORKS_KEY);
      if (stored) {
        try {
          setConfigChains(JSON.parse(stored));
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
      localStorage.setItem(
        WAGMI_CONFIG_NETWORKS_KEY,
        JSON.stringify(configChains),
      );
    }
  }, [configChains, chainsLoaded]);

  // Compute wagmi config from chains - only on client side
  const wagmiConfig = useMemo(() => {
    if (!isMounted) return null;

    // Create transports object that uses wallet provider's RPC (EIP-1193)
    // This ensures we use the user's wallet RPC instead of public RPC endpoints
    const transports = configChains.reduce((acc, chain) => {
      // http() with no URL uses the wallet's provider via window.ethereum (EIP-1193)
      // Falls back to chain's default RPC only if wallet doesn't support the chain
      acc[chain.id] = http();
      return acc;
    }, {} as Record<number, ReturnType<typeof http>>);

    return getDefaultConfig({
      appName: "localsafe.eth",
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
      chains: configChains as [typeof mainnet, ...[typeof mainnet]],
      transports,
      ssr: false,
    });
  }, [configChains, isMounted]);

  const [queryClient] = useState(() => new QueryClient());

  // Don't render providers until client-side mounted
  if (!isMounted || !wagmiConfig) {
    return null;
  }

  return (
    <WagmiConfigContext.Provider
      value={{ configChains, setConfigChains, wagmiConfig }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            theme={{
              lightMode: lightTheme({
                accentColor: "#605dff",
                accentColorForeground: "white",
              }),
              darkMode: darkTheme({
                accentColor: "#605dff",
                accentColorForeground: "white",
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
  if (!ctx)
    throw new Error(
      "useWagmiConfigContext must be used within a WagmiConfigProvider",
    );
  return ctx;
}
