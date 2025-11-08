"use client";

/**
 * SafeProvider Context for Safe ProtocolKit SDK
 *
 * This context uses React's useCallback to memoize context functions (initSafe, connectSafe, resetSafe).
 * Memoization ensures that the context value remains stable between renders, preventing unnecessary re-renders
 * in consumers and optimizing performance, especially in large or deeply nested React apps.
 *
 * If you refactor this file, keep useCallback for context functions unless you have a specific reason to remove it.
 * For more details, see: https://react.dev/reference/react/useCallback
 */
import React, { createContext, useState, useEffect, useContext } from "react";
import type { SafeWalletData, UndeployedSafe } from "../utils/types";
import { buildContractNetworks } from "../utils/contractNetworks";
import type { ContractNetworks } from "../utils/contractNetworks";
import { useChains } from "wagmi";
import { DEFAULT_SAFE_WALLET_DATA, SAFE_WALLET_DATA_KEY } from "../utils/constants";

// -- Interfaces and Context --
export interface SafeWalletContextType {
  safeWalletData: SafeWalletData;
  setSafeWalletData: React.Dispatch<React.SetStateAction<SafeWalletData>>;
  contractNetworks: ContractNetworks | undefined;
  addSafe: (chainId: string, safeAddress: string, safeName: string, safeConfig?: UndeployedSafe) => void;
  removeSafe: (chainId: string, safeAddress: string, deployed?: boolean) => void;
  setSafeMultiSendConfig: (
    chainId: string,
    safeAddress: string,
    multiSendAddress?: string,
    multiSendCallOnlyAddress?: string,
  ) => void;
  getSafeMultiSendConfig: (
    chainId: string,
    safeAddress: string,
  ) => { multiSendAddress?: string; multiSendCallOnlyAddress?: string } | undefined;
}

export const SafeWalletContext = createContext<SafeWalletContextType | undefined>(undefined);

// -- Provider Component --

export const SafeWalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Wagmi hooks (if needed for actions)
  const chains = useChains();

  const [contractNetworks, setContractNetworks] = useState<ContractNetworks | undefined>();

  const [safeWalletData, setSafeWalletData] = useState<SafeWalletData>(() => ({
    ...DEFAULT_SAFE_WALLET_DATA,
  }));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(SAFE_WALLET_DATA_KEY);
      if (stored) {
        try {
          setSafeWalletData(JSON.parse(stored));
        } catch {
          setSafeWalletData({
            ...DEFAULT_SAFE_WALLET_DATA,
          });
        }
      }
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem(SAFE_WALLET_DATA_KEY, JSON.stringify(safeWalletData));
    }
  }, [safeWalletData, loaded]);
  // Build contractNetworks whenever chains change
  useEffect(() => {
    buildContractNetworks([...chains])
      .then(setContractNetworks)
      .catch(() => setContractNetworks(undefined));
  }, [chains]);

  const addSafe = (chainId: string, safeAddress: string, safeName: string, safeConfig?: UndeployedSafe) => {
    setSafeWalletData((prev) => {
      const data = { ...prev.data };
      if (safeConfig) {
        if (!data.undeployedSafes[chainId]) data.undeployedSafes[chainId] = {};
        // Only accept UndeployedSafe for undeployed
        data.undeployedSafes[chainId][safeAddress] = safeConfig;
      }
      // Store safe in addressBook with name
      if (!data.addressBook[chainId]) data.addressBook[chainId] = {};
      data.addressBook[chainId][safeAddress] = safeName;
      return { ...prev, data };
    });
  };

  const removeSafe = (chainId: string, safeAddress: string, deployed = false) => {
    setSafeWalletData((prev) => {
      const data = { ...prev.data };
      if (deployed) {
        if (data.addressBook[chainId]) {
          delete data.addressBook[chainId][safeAddress];
        }
      } else {
        if (data.undeployedSafes[chainId]) {
          delete data.undeployedSafes[chainId][safeAddress];
        }
      }
      return { ...prev, data };
    });
  };

  const setSafeMultiSendConfig = (
    chainId: string,
    safeAddress: string,
    multiSendAddress?: string,
    multiSendCallOnlyAddress?: string,
  ) => {
    setSafeWalletData((prev) => {
      const data = { ...prev.data };
      if (!data.safeConfig) data.safeConfig = {};
      if (!data.safeConfig[chainId]) data.safeConfig[chainId] = {};

      // If both are empty/undefined, remove the config entry
      if (!multiSendAddress && !multiSendCallOnlyAddress) {
        delete data.safeConfig[chainId][safeAddress];
        // Clean up empty chain object
        if (Object.keys(data.safeConfig[chainId]).length === 0) {
          delete data.safeConfig[chainId];
        }
      } else {
        data.safeConfig[chainId][safeAddress] = {
          multiSendAddress,
          multiSendCallOnlyAddress,
        };
      }

      return { ...prev, data };
    });
  };

  const getSafeMultiSendConfig = (chainId: string, safeAddress: string) => {
    return safeWalletData?.data?.safeConfig?.[chainId]?.[safeAddress];
  };

  return (
    <SafeWalletContext.Provider
      value={{
        safeWalletData,
        setSafeWalletData,
        contractNetworks,
        addSafe,
        removeSafe,
        setSafeMultiSendConfig,
        getSafeMultiSendConfig,
      }}
    >
      {children}
    </SafeWalletContext.Provider>
  );
};

export function useSafeWalletContext() {
  const ctx = useContext(SafeWalletContext);
  if (!ctx) throw new Error("useSafeWalletContext must be used within a SafeWalletProvider");
  return ctx;
}
