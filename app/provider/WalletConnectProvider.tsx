"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { IWalletKit } from "@reown/walletkit";
import type { SessionTypes, ProposalTypes, SignClientTypes } from "@walletconnect/types";

const WC_PROJECT_ID_STORAGE_KEY = "walletconnect-project-id";
const DEFAULT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export interface WalletConnectContextType {
  web3wallet: IWalletKit | null;
  sessions: SessionTypes.Struct[];
  pendingProposal: ProposalTypes.Struct | null;
  pendingRequest: SignClientTypes.EventArguments["session_request"] | null;
  pair: (uri: string) => Promise<void>;
  approveSession: (namespaces: Record<string, any>) => Promise<void>;
  rejectSession: () => Promise<void>;
  disconnectSession: (topic: string) => Promise<void>;
  approveRequest: (topic: string, response: any) => Promise<void>;
  rejectRequest: (topic: string, error: any, requestId?: number) => Promise<void>;
  clearPendingRequest: () => void;
  error: Error | null;
  isInitialized: boolean;
  projectId: string | null;
  setProjectId: (projectId: string) => void;
}

const WalletConnectContext = createContext<WalletConnectContextType | undefined>(undefined);

export const WalletConnectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [web3wallet, setWeb3wallet] = useState<IWalletKit | null>(null);
  const [sessions, setSessions] = useState<SessionTypes.Struct[]>([]);
  const [pendingProposal, setPendingProposal] = useState<ProposalTypes.Struct | null>(null);
  const [pendingRequest, setPendingRequest] = useState<SignClientTypes.EventArguments["session_request"] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [projectId, setProjectIdState] = useState<string | null>(null);
  const isInitializing = useRef(false);

  // Load project ID from localStorage on mount, or use default
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedProjectId = localStorage.getItem(WC_PROJECT_ID_STORAGE_KEY);
      if (storedProjectId) {
        setProjectIdState(storedProjectId);
      } else if (DEFAULT_PROJECT_ID) {
        setProjectIdState(DEFAULT_PROJECT_ID);
      }
    }
  }, []);

  // Save project ID to localStorage
  const setProjectId = useCallback((newProjectId: string) => {
    setProjectIdState(newProjectId);
    if (typeof window !== "undefined") {
      localStorage.setItem(WC_PROJECT_ID_STORAGE_KEY, newProjectId);
    }
  }, []);

  // Initialize Web3Wallet when projectId is available
  useEffect(() => {
    if (!projectId || isInitializing.current || isInitialized) return;

    async function initializeWallet() {
      if (isInitializing.current) return;
      isInitializing.current = true;

      try {
        const { Core } = await import("@walletconnect/core");
        const { WalletKit } = await import("@reown/walletkit");

        const core = new Core({
          projectId: projectId!,
        });

        const wallet = await WalletKit.init({
          core,
          metadata: {
            name: "LocalSafe Wallet",
            description: "Local multisig wallet powered by Safe",
            url: typeof window !== "undefined" ? window.location.origin : "https://localsafe.eth",
            icons: ["https://avatars.githubusercontent.com/u/37784886"],
          },
        });

        setWeb3wallet(wallet);

        // Get active sessions
        const activeSessions = wallet.getActiveSessions();
        setSessions(Object.values(activeSessions));

        // Set up event listeners
        wallet.on("session_proposal", (args: any) => {
          setPendingProposal(args.params);
          setError(null);
        });

        wallet.on("session_request", (request: any) => {
          setPendingRequest(request);
        });

        wallet.on("session_delete", ({ topic }: { topic: string }) => {
          const activeSessions = wallet.getActiveSessions();
          setSessions(Object.values(activeSessions));
        });

        setIsInitialized(true);
        setError(null);
      } catch (err) {
        console.error("Failed to initialize Web3Wallet:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        isInitializing.current = false;
      }
    }

    initializeWallet();
  }, [projectId, isInitialized]);

  const pair = useCallback(
    async (uri: string) => {
      if (!web3wallet) {
        throw new Error("Web3Wallet not initialized");
      }
      try {
        await web3wallet.pair({ uri });
        setError(null);
      } catch (err) {
        console.error("Failed to pair:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },
    [web3wallet],
  );

  const approveSession = useCallback(
    async (namespaces: Record<string, any>) => {
      if (!web3wallet || !pendingProposal) {
        throw new Error("No pending proposal");
      }
      try {
        const session = await web3wallet.approveSession({
          id: pendingProposal.id,
          namespaces,
        });

        // Update sessions
        const activeSessions = web3wallet.getActiveSessions();
        setSessions(Object.values(activeSessions));

        setPendingProposal(null);
        setError(null);
      } catch (err) {
        console.error("Failed to approve session:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },
    [web3wallet, pendingProposal],
  );

  const rejectSession = useCallback(async () => {
    if (!web3wallet || !pendingProposal) {
      throw new Error("No pending proposal");
    }
    try {
      await web3wallet.rejectSession({
        id: pendingProposal.id,
        reason: {
          code: 5000,
          message: "User rejected",
        },
      });
      setPendingProposal(null);
      setError(null);
    } catch (err) {
      console.error("Failed to reject session:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }, [web3wallet, pendingProposal]);

  const disconnectSession = useCallback(
    async (topic: string) => {
      if (!web3wallet) {
        throw new Error("Web3Wallet not initialized");
      }
      try {
        await web3wallet.disconnectSession({
          topic,
          reason: {
            code: 6000,
            message: "User disconnected",
          },
        });

        // Update sessions
        const activeSessions = web3wallet.getActiveSessions();
        setSessions(Object.values(activeSessions));

        setError(null);
      } catch (err) {
        console.error("Failed to disconnect session:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },
    [web3wallet],
  );

  const approveRequest = useCallback(
    async (topic: string, response: any) => {
      if (!web3wallet || !pendingRequest) {
        throw new Error("No pending request");
      }
      try {
        await web3wallet.respondSessionRequest({
          topic,
          response,
        });

        setPendingRequest(null);
        setError(null);
      } catch (err) {
        console.error("Failed to approve request:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },
    [web3wallet, pendingRequest],
  );

  const rejectRequest = useCallback(
    async (topic: string, error: any, requestId?: number) => {
      if (!web3wallet) {
        throw new Error("Web3Wallet not initialized");
      }

      // Use provided requestId or fall back to pendingRequest.id
      const id = requestId ?? pendingRequest?.id;
      if (!id) {
        throw new Error("No request ID available");
      }

      try {
        const response = {
          id,
          jsonrpc: "2.0",
          error,
        };

        await web3wallet.respondSessionRequest({
          topic,
          response,
        });

        setPendingRequest(null);
        setError(null);
      } catch (err) {
        console.error("Failed to reject request:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },
    [web3wallet, pendingRequest],
  );

  const clearPendingRequest = useCallback(() => {
    setPendingRequest(null);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("wc-pending-request");
    }
  }, []);

  return (
    <WalletConnectContext.Provider
      value={{
        web3wallet,
        sessions,
        pendingProposal,
        pendingRequest,
        pair,
        approveSession,
        rejectSession,
        disconnectSession,
        approveRequest,
        rejectRequest,
        clearPendingRequest,
        error,
        isInitialized,
        projectId,
        setProjectId,
      }}
    >
      {children}
    </WalletConnectContext.Provider>
  );
};

export function useWalletConnect() {
  const ctx = useContext(WalletConnectContext);
  if (!ctx) {
    throw new Error("useWalletConnect must be used within a WalletConnectProvider");
  }
  return ctx;
}
