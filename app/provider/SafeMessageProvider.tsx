"use client";

import { EthSafeSignature, EthSafeMessage } from "@safe-global/protocol-kit";
import React, { createContext, useContext, useEffect, useRef } from "react";

const SAFE_MESSAGE_STORAGE_KEY = "safe-messages";

export interface SafeMessageContextType {
  saveMessage: (safeAddress: string, msgObj: EthSafeMessage, messageHash: string, chainId?: string) => void;
  getMessage: (safeAddress: string, messageHash: string, chainId?: string) => EthSafeMessage | null;
  getAllMessages: (safeAddress: string, chainId?: string) => EthSafeMessage[];
  removeMessage: (safeAddress: string, messageHash: string, chainId?: string) => void;
}

const SafeMessageContext = createContext<SafeMessageContextType | undefined>(undefined);

export const SafeMessageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // In-memory map of current messages per safeAddress
  const currentMsgMapRef = useRef<{
    [safeAddress: string]: Array<{ message: EthSafeMessage; hash: string }>;
  }>({});

  // Hydrate all messages from localStorage on mount
  type StoredMsg = {
    hash: string; // The message hash for identification
    data: string | object; // The original message (string or EIP-712 typed data)
    signatures?: { signer: string; data: string; isContractSignature: boolean }[];
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawMap = localStorage.getItem(SAFE_MESSAGE_STORAGE_KEY);
      if (rawMap) {
        const parsedMap: Record<string, StoredMsg[]> = JSON.parse(rawMap);
        Object.entries(parsedMap).forEach(([safeAddress, msgArray]) => {
          const messages: Array<{ message: EthSafeMessage; hash: string }> = [];
          if (Array.isArray(msgArray)) {
            msgArray.forEach((parsed) => {
              if (parsed && typeof parsed === "object" && "data" in parsed && "hash" in parsed) {
                const msgObj = new EthSafeMessage(parsed.data as any);
                if (parsed.signatures && Array.isArray(parsed.signatures)) {
                  parsed.signatures.forEach((sig: { signer: string; data: string; isContractSignature: boolean }) => {
                    const ethSignature = new EthSafeSignature(sig.signer, sig.data, sig.isContractSignature);
                    msgObj.addSignature(ethSignature);
                  });
                }
                messages.push({ message: msgObj, hash: parsed.hash });
              }
            });
          }
          currentMsgMapRef.current[safeAddress] = messages;
        });
      }
    } catch {
      // Ignore hydration errors
    }
  }, []);

  // Add or update a message for a specific safeAddress and chainId
  function saveMessage(safeAddress: string, msgObj: EthSafeMessage, messageHash: string, chainId?: string) {
    const key = chainId ? `${safeAddress}-${chainId}` : safeAddress;
    const existingMsgs = currentMsgMapRef.current[key] || [];

    // Check if message already exists by hash
    const existingIndex = existingMsgs.findIndex((entry) => entry.hash === messageHash);

    if (existingIndex >= 0) {
      // Update existing message with new signatures
      existingMsgs[existingIndex] = { message: msgObj, hash: messageHash };
    } else {
      // Add new message
      existingMsgs.push({ message: msgObj, hash: messageHash });
    }

    currentMsgMapRef.current[key] = existingMsgs;
    persistToLocalStorage();
  }

  // Get a specific message by hash
  function getMessage(safeAddress: string, messageHash: string, chainId?: string): EthSafeMessage | null {
    const key = chainId ? `${safeAddress}-${chainId}` : safeAddress;
    const messages = currentMsgMapRef.current[key] || [];
    const entry = messages.find((entry) => entry.hash === messageHash);
    return entry ? entry.message : null;
  }

  // Get all messages for a specific safe
  function getAllMessages(safeAddress: string, chainId?: string): EthSafeMessage[] {
    const key = chainId ? `${safeAddress}-${chainId}` : safeAddress;
    const entries = currentMsgMapRef.current[key] || [];
    return entries.map((entry) => entry.message);
  }

  // Remove a message
  function removeMessage(safeAddress: string, messageHash: string, chainId?: string) {
    const key = chainId ? `${safeAddress}-${chainId}` : safeAddress;
    const existingMsgs = currentMsgMapRef.current[key] || [];
    currentMsgMapRef.current[key] = existingMsgs.filter((entry) => entry.hash !== messageHash);
    persistToLocalStorage();
  }

  // Helper to persist to localStorage
  function persistToLocalStorage() {
    if (typeof window === "undefined") return;
    try {
      const serializable: Record<string, StoredMsg[]> = {};
      Object.entries(currentMsgMapRef.current).forEach(([key, entries]) => {
        serializable[key] = entries.map((entry) => ({
          hash: entry.hash,
          data: entry.message.data,
          signatures: Array.from(entry.message.signatures.values()).map((sig) => ({
            signer: sig.signer,
            data: sig.data,
            isContractSignature: sig.isContractSignature ?? false,
          })),
        }));
      });
      localStorage.setItem(SAFE_MESSAGE_STORAGE_KEY, JSON.stringify(serializable));
    } catch {
      // Ignore persistence errors
    }
  }

  return (
    <SafeMessageContext.Provider
      value={{
        saveMessage,
        getMessage,
        getAllMessages,
        removeMessage,
      }}
    >
      {children}
    </SafeMessageContext.Provider>
  );
};

export const useSafeMessageContext = () => {
  const ctx = useContext(SafeMessageContext);
  if (!ctx) {
    throw new Error("useSafeMessageContext must be used within SafeMessageProvider");
  }
  return ctx;
};
