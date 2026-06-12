"use client";

import { SafeSignature, SafeTransaction } from "../vendor/safe";
import React, { createContext, useContext, useEffect, useRef } from "react";
import { SAFE_TX_STORAGE_KEY } from "../utils/constants";

export interface SafeTxContextType {
  saveTransaction: (safeAddress: string, txObj: SafeTransaction, chainId?: string) => void;
  getTransaction: (safeAddress: string, chainId?: string) => SafeTransaction | null;
  getAllTransactions: (safeAddress: string, chainId?: string) => SafeTransaction[];
  removeTransaction: (safeAddress: string, txHash?: string, nonce?: number, chainId?: string) => void;
  exportTx: (safeAddress: string, chainId?: string) => string;
  importTx: (safeAddress: string, json: string, chainId?: string) => void;
}

const SafeTxContext = createContext<SafeTxContextType | undefined>(undefined);

export const SafeTxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // In-memory map of current transactions per safeAddress (now stores arrays)
  const currentTxMapRef = useRef<{
    [safeAddress: string]: SafeTransaction[];
  }>({});

  // Hydrate all transactions from localStorage on mount
  type StoredTx = {
    data: SafeTransaction["data"];
    signatures?: SafeSignature[];
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawMap = localStorage.getItem(SAFE_TX_STORAGE_KEY);
      if (rawMap) {
        const parsedMap: Record<string, StoredTx[]> = JSON.parse(rawMap);
        Object.entries(parsedMap).forEach(([safeAddress, txArray]) => {
          const transactions: SafeTransaction[] = [];
          if (Array.isArray(txArray)) {
            txArray.forEach((parsed) => {
              if (parsed && typeof parsed === "object" && "data" in parsed) {
                const txObj = new SafeTransaction(parsed.data);
                if (parsed.signatures && Array.isArray(parsed.signatures)) {
                  parsed.signatures.forEach((sig: { signer: string; data: string; isContractSignature: boolean }) => {
                    const ethSignature = new SafeSignature(sig.signer, sig.data, sig.isContractSignature);
                    txObj.addSignature(ethSignature);
                  });
                }
                transactions.push(txObj);
              }
            });
          }
          currentTxMapRef.current[safeAddress] = transactions;
        });
      }
    } catch {
      // Ignore hydration errors
    }
  }, []);

  // Add or update a transaction for a specific safeAddress and chainId
  function saveTransaction(safeAddress: string, txObj: SafeTransaction, chainId?: string) {
    // Create composite key: safeAddress-chainId
    const key = chainId ? `${safeAddress}-${chainId}` : safeAddress;

    // Get existing transactions or initialize empty array
    const existingTxs = currentTxMapRef.current[key] || [];

    // Check if transaction with same nonce already exists
    const existingIndex = existingTxs.findIndex((tx) => tx.data.nonce === txObj.data.nonce);

    if (existingIndex >= 0) {
      // Update existing transaction
      existingTxs[existingIndex] = txObj;
    } else {
      // Add new transaction
      existingTxs.push(txObj);
    }

    // Sort by nonce
    existingTxs.sort((a, b) => Number(a.data.nonce) - Number(b.data.nonce));

    currentTxMapRef.current[key] = existingTxs;

    if (typeof window !== "undefined") {
      // Get full map, update, and save
      let map: Record<string, StoredTx[]> = {};
      const rawMap = localStorage.getItem(SAFE_TX_STORAGE_KEY);
      if (rawMap) {
        map = JSON.parse(rawMap);
      }
      map[key] = existingTxs.map((tx) => ({
        data: tx.data,
        signatures: tx.signatures ? Array.from(tx.signatures.values()) : [],
      }));
      localStorage.setItem(SAFE_TX_STORAGE_KEY, JSON.stringify(map));
    }
  }

  // Get the first transaction (lowest nonce) for a specific safeAddress and chainId
  function getTransaction(safeAddress: string, chainId?: string): SafeTransaction | null {
    const key = chainId ? `${safeAddress}-${chainId}` : safeAddress;
    const txs = currentTxMapRef.current[key];
    return txs && txs.length > 0 ? txs[0] : null;
  }

  // Get all transactions for a specific safeAddress and chainId, sorted by nonce
  function getAllTransactions(safeAddress: string, chainId?: string): SafeTransaction[] {
    const key = chainId ? `${safeAddress}-${chainId}` : safeAddress;
    return currentTxMapRef.current[key] || [];
  }

  // Remove a transaction for a specific safeAddress and chainId
  // If txHash/nonce is provided, remove only that transaction. Otherwise, remove all.
  function removeTransaction(safeAddress: string, txHash?: string, nonce?: number, chainId?: string) {
    const key = chainId ? `${safeAddress}-${chainId}` : safeAddress;

    if (!txHash && nonce === undefined) {
      // Remove all transactions
      currentTxMapRef.current[key] = [];
      if (typeof window !== "undefined") {
        let map: Record<string, StoredTx[]> = {};
        const rawMap = localStorage.getItem(SAFE_TX_STORAGE_KEY);
        if (rawMap) {
          map = JSON.parse(rawMap);
        }
        delete map[key];
        localStorage.setItem(SAFE_TX_STORAGE_KEY, JSON.stringify(map));
      }
    } else {
      // Remove specific transaction by nonce (most reliable)
      const existingTxs = currentTxMapRef.current[key] || [];

      // Filter by nonce if provided, otherwise we can't reliably remove
      const filtered = nonce !== undefined ? existingTxs.filter((tx) => Number(tx.data.nonce) !== nonce) : existingTxs;

      currentTxMapRef.current[key] = filtered;

      if (typeof window !== "undefined") {
        let map: Record<string, StoredTx[]> = {};
        const rawMap = localStorage.getItem(SAFE_TX_STORAGE_KEY);
        if (rawMap) {
          map = JSON.parse(rawMap);
        }
        if (filtered.length > 0) {
          map[key] = filtered.map((tx) => ({
            data: tx.data,
            signatures: tx.signatures ? Array.from(tx.signatures.values()) : [],
          }));
        } else {
          delete map[key];
        }
        localStorage.setItem(SAFE_TX_STORAGE_KEY, JSON.stringify(map));
      }
    }
  }

  // Export all transactions for a specific safeAddress and chainId as JSON
  function exportTx(safeAddress: string, chainId?: string): string {
    const key = chainId ? `${safeAddress}-${chainId}` : safeAddress;
    const txs = currentTxMapRef.current[key];
    if (!txs || txs.length === 0) return "";

    const txsData = txs.map((tx) => ({
      data: tx.data,
      signatures: tx.signatures
        ? Array.from(tx.signatures.values()).map((sig) => ({
            signer: sig.signer,
            data: sig.data,
            isContractSignature: sig.isContractSignature,
          }))
        : [],
    }));

    return JSON.stringify({ transactions: txsData });
  }

  // Import transaction(s) for a specific safeAddress and chainId from JSON
  function importTx(safeAddress: string, json: string, chainId?: string) {
    const key = chainId ? `${safeAddress}-${chainId}` : safeAddress;
    try {
      const obj = JSON.parse(json);
      const transactions: SafeTransaction[] = [];

      // Handle new format (array of transactions)
      if (obj.transactions && Array.isArray(obj.transactions)) {
        obj.transactions.forEach((storedTx: StoredTx) => {
          if (storedTx.data) {
            const txObj = new SafeTransaction(storedTx.data);
            if (storedTx.signatures && Array.isArray(storedTx.signatures)) {
              storedTx.signatures.forEach((sig: { signer: string; data: string; isContractSignature: boolean }) => {
                const ethSignature = new SafeSignature(sig.signer, sig.data, sig.isContractSignature);
                txObj.addSignature(ethSignature);
              });
            }
            transactions.push(txObj);
          }
        });
      }
      // Handle old format (single transaction)
      else if (obj.tx && obj.tx.data) {
        const txObj = new SafeTransaction(obj.tx.data);
        if (obj.tx.signatures && Array.isArray(obj.tx.signatures)) {
          obj.tx.signatures.forEach((sig: { signer: string; data: string; isContractSignature: boolean }) => {
            const ethSignature = new SafeSignature(sig.signer, sig.data, sig.isContractSignature);
            txObj.addSignature(ethSignature);
          });
        }
        transactions.push(txObj);
      }

      if (transactions.length > 0) {
        // Merge with existing transactions instead of replacing
        const existingTxs = currentTxMapRef.current[key] || [];
        const mergedTxs = [...existingTxs];

        // For each imported transaction, add or replace by nonce
        transactions.forEach((importedTx) => {
          const existingIndex = mergedTxs.findIndex((tx) => Number(tx.data.nonce) === Number(importedTx.data.nonce));
          if (existingIndex >= 0) {
            // Replace existing transaction with same nonce
            mergedTxs[existingIndex] = importedTx;
          } else {
            // Add new transaction
            mergedTxs.push(importedTx);
          }
        });

        // Sort by nonce
        mergedTxs.sort((a, b) => Number(a.data.nonce) - Number(b.data.nonce));

        currentTxMapRef.current[key] = mergedTxs;
        if (typeof window !== "undefined") {
          let map: Record<string, StoredTx[]> = {};
          const rawMap = localStorage.getItem(SAFE_TX_STORAGE_KEY);
          if (rawMap) {
            map = JSON.parse(rawMap);
          }
          map[key] = mergedTxs.map((tx) => ({
            data: tx.data,
            signatures: tx.signatures ? Array.from(tx.signatures.values()) : [],
          }));
          localStorage.setItem(SAFE_TX_STORAGE_KEY, JSON.stringify(map));
        }
      }
    } catch {
      // Invalid import
    }
  }

  return (
    <SafeTxContext.Provider
      value={{
        saveTransaction,
        getTransaction,
        getAllTransactions,
        removeTransaction,
        exportTx,
        importTx,
      }}
    >
      {children}
    </SafeTxContext.Provider>
  );
};

export function useSafeTxContext() {
  const ctx = useContext(SafeTxContext);
  if (!ctx) throw new Error("useSafeTxContext must be used within a SafeTxProvider");
  return ctx;
}
