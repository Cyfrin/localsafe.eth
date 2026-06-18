"use client";

import AppAddress from "@/app/components/AppAddress";
import AppCard from "@/app/components/AppCard";
import AppSection from "@/app/components/AppSection";
import useSafe from "@/app/hooks/useSafe";
import { DEFAULT_DEPLOY_STEPS, STEPS_DEPLOY_LABEL } from "@/app/utils/constants";
import React, { useEffect, useState, useRef } from "react";
import { useSafeTxContext } from "@/app/provider/SafeTxProvider";
import { useSafeMessageContext } from "@/app/provider/SafeMessageProvider";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAccount, usePublicClient } from "wagmi";
import { formatEther } from "viem";
import { ImportTxPreview, SafeDeployStep } from "@/app/utils/types";
import { SafeTransaction, SafeSignature, SafeMessage, verifyDeployments } from "../../vendor/safe";
import type { ContractAddresses, DeploymentTrustResult } from "../../vendor/safe";
import TrustedDeploymentsModal from "@/app/components/TrustedDeploymentsModal";
import { isTxBuilderBatch, parseTxBuilderBatch } from "@/app/utils/txBuilderBatch";
import { Link } from "react-router-dom";
import DeploymentModal from "@/app/components/DeploymentModal";
import ImportSafeTxModal from "@/app/components/ImportSafeTxModal";
import TokenBalancesSection from "@/app/components/TokenBalancesSection";
import ManageOwnersModal from "@/app/components/ManageOwnersModal";
import ConfigureMultiSendModal from "@/app/components/ConfigureMultiSendModal";
import { useSafeWalletContext } from "@/app/provider/SafeWalletProvider";
import { useToast, useConfirm } from "@/app/hooks/useToast";
import {
  connectSnap,
  createSafeKeyringAccount,
  getInstalledSnap,
  isSafeInKeyring,
  removeSafeFromKeyring,
} from "@/app/utils/snap";

type MmStatus = "checking" | "no-mm" | "uninstalled" | "not-added" | "added";

/**
 * SafeDashboardClient component that displays the dashboard for a specific safe, including its details and actions.
 *
 * @param param0 - The props object containing the safe address.
 * @returns {JSX.Element} The rendered SafeDashboardClient component.
 */
export default function SafeDashboardClient({ safeAddress }: { safeAddress: `0x${string}` }) {
  // Try to get the name from addressBook for the current chain
  const { chain, address: connectedAddress } = useAccount();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    safeName,
    safeInfo,
    isLoading,
    error,
    isOwner,
    unavailable,
    kit,
    deployUndeployedSafe,
    createBatchedOwnerManagementTransaction,
    buildSafeTransaction,
  } = useSafe(safeAddress);
  // Hooks
  const { exportTx, importTx, getAllTransactions, saveTransaction, removeTransaction } = useSafeTxContext();
  const { getAllMessages, saveMessage, removeMessage } = useSafeMessageContext();
  const {
    setSafeMultiSendConfig,
    getSafeMultiSendConfig,
    contractNetworks,
    setTrustedDeployments,
    getTrustedDeployments,
  } = useSafeWalletContext();
  const publicClient = usePublicClient();
  const toast = useToast();
  const { confirm } = useConfirm();

  // Modal state for deployment
  const [modalOpen, setModalOpen] = useState(false);
  const [manageOwnersModalOpen, setManageOwnersModalOpen] = useState(false);
  const [multiSendModalOpen, setMultiSendModalOpen] = useState(false);
  const [deploySteps, setDeploySteps] = useState<SafeDeployStep[]>(DEFAULT_DEPLOY_STEPS);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployTxHash, setDeployTxHash] = useState<string | null>(null);
  const [allTxs, setAllTxs] = useState<Array<{ tx: SafeTransaction; hash: string }>>([]);
  const [allMessages, setAllMessages] = useState<Array<{ message: SafeMessage; hash: string }>>([]);
  // Import/export modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportTxPreview | { error: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processedImportRef = useRef<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [mmStatus, setMmStatus] = useState<MmStatus>("checking");
  const [mmBusy, setMmBusy] = useState(false);
  const [mmRefresh, setMmRefresh] = useState(0);

  // Derive the MetaMask snap/account status for this Safe (install -> add -> added).
  useEffect(() => {
    if (!safeInfo?.deployed) return;
    let cancelled = false;
    setMmStatus("checking");
    async function deriveMmStatus() {
      // getInstalledSnap() throws when no wallet is injected; detect that first.
      if (typeof window === "undefined" || !(globalThis as { ethereum?: unknown }).ethereum) {
        if (!cancelled) setMmStatus("no-mm");
        return;
      }
      try {
        const snap = await getInstalledSnap();
        if (cancelled) return;
        if (!snap) {
          setMmStatus("uninstalled");
          return;
        }
        const added = await isSafeInKeyring(safeAddress);
        if (!cancelled) setMmStatus(added ? "added" : "not-added");
      } catch {
        if (!cancelled) setMmStatus("uninstalled");
      }
    }
    deriveMmStatus();
    return () => {
      cancelled = true;
    };
  }, [safeInfo?.deployed, safeAddress, chain?.id, mmRefresh]);

  // Handle shared transaction or signature links
  useEffect(() => {
    if (!kit) return;

    async function handleSharedLinks() {
      const importTxParam = searchParams.get("importTx");
      const importSigParam = searchParams.get("importSig");
      const importMsgParam = searchParams.get("importMsg");
      const importMsgSigParam = searchParams.get("importMsgSig");
      const urlChainId = searchParams.get("chainId");

      // Create a unique key for this import to prevent duplicate processing
      const importKey = importTxParam || importSigParam || importMsgParam || importMsgSigParam;
      if (!importKey) return;

      // Skip if we've already processed this import
      if (processedImportRef.current === importKey) return;
      processedImportRef.current = importKey;

      if (importTxParam) {
        try {
          const decoded = atob(decodeURIComponent(importTxParam));
          const parsed = JSON.parse(decoded);

          if (parsed.tx && parsed.tx.data) {
            // Import the full transaction with signatures
            // Use chainId from URL if provided, otherwise use connected chain
            const chainId = urlChainId || (chain?.id ? String(chain.id) : undefined);
            importTx(safeAddress, JSON.stringify(parsed), chainId);
            // Clear URL parameters
            const newUrl = window.location.pathname;
            window.history.replaceState({}, "", newUrl);
            // Show success message
            toast.success(
              `Transaction imported successfully!${urlChainId && chain?.id && String(chain.id) !== urlChainId ? ` (Chain ID: ${urlChainId})` : ""}`,
            );
            // Trigger refresh of transaction list
            setRefreshCounter((c) => c + 1);
          }
        } catch (e) {
          console.error("Failed to import transaction from URL:", e);
          toast.error("Failed to import transaction from shared link");
        }
      } else if (importSigParam) {
        try {
          const decoded = atob(decodeURIComponent(importSigParam));
          const parsed = JSON.parse(decoded);

          if (parsed.signature && parsed.txHash) {
            // Find the transaction by hash
            // Use chainId from URL if provided, otherwise use connected chain
            const chainId = urlChainId || (chain?.id ? String(chain.id) : undefined);
            const allTransactions = getAllTransactions(safeAddress, chainId);

            // Search for transaction matching the hash
            let matchingTx: SafeTransaction | null = null;
            for (const tx of allTransactions) {
              if (!kit) break;
              const hash = await kit.getTransactionHash(tx);
              if (hash === parsed.txHash) {
                matchingTx = tx;
                break;
              }
            }

            if (matchingTx) {
              // Add the signature to the transaction
              const ethSignature = new SafeSignature(
                parsed.signature.signer,
                parsed.signature.data,
                parsed.signature.isContractSignature,
              );
              matchingTx.addSignature(ethSignature);
              saveTransaction(safeAddress, matchingTx);

              // Clear URL parameter
              const newUrl = window.location.pathname;
              window.history.replaceState({}, "", newUrl);
              // Show success message
              toast.success("Signature added successfully!");
              // Trigger refresh of transaction list
              setRefreshCounter((c) => c + 1);
            } else {
              toast.error("Transaction not found. Please import the full transaction first.");
            }
          }
        } catch (e) {
          console.error("Failed to import signature from URL:", e);
          toast.error("Failed to import signature from shared link");
        }
      } else if (importMsgParam) {
        try {
          const decoded = atob(decodeURIComponent(importMsgParam));
          const parsed = JSON.parse(decoded);

          if (parsed.message && parsed.message.data) {
            // Import the full message with signatures
            const chainId = urlChainId || (chain?.id ? String(chain.id) : undefined);
            const msgObj = new SafeMessage(parsed.message.data as any);
            if (parsed.message.signatures && Array.isArray(parsed.message.signatures)) {
              parsed.message.signatures.forEach(
                (sig: { signer: string; data: string; isContractSignature: boolean }) => {
                  const ethSignature = new SafeSignature(sig.signer, sig.data, sig.isContractSignature);
                  msgObj.addSignature(ethSignature);
                },
              );
            }
            // Calculate message hash
            if (!kit) {
              toast.error("Safe kit not initialized");
              return;
            }
            const messageHash = await kit.getSafeMessageHash(msgObj.data as any);
            saveMessage(safeAddress, msgObj, messageHash, chainId);
            // Clear URL parameters
            const newUrl = window.location.pathname;
            window.history.replaceState({}, "", newUrl);
            // Show success message
            toast.success(
              `Message imported successfully!${urlChainId && chain?.id && String(chain.id) !== urlChainId ? ` (Chain ID: ${urlChainId})` : ""}`,
            );
            // Trigger refresh of message list
            setRefreshCounter((c) => c + 1);
          }
        } catch (e) {
          console.error("Failed to import message from URL:", e);
          toast.error("Failed to import message from shared link");
        }
      } else if (importMsgSigParam) {
        try {
          const decoded = atob(decodeURIComponent(importMsgSigParam));
          const parsed = JSON.parse(decoded);

          if (parsed.signature && parsed.messageHash) {
            // Find the message by hash
            const chainId = urlChainId || (chain?.id ? String(chain.id) : undefined);
            const allMessages = getAllMessages(safeAddress, chainId);

            // Search for message matching the hash
            let matchingMsg: SafeMessage | null = null;
            for (const msg of allMessages) {
              if (!kit) break;
              const hash = await kit.getSafeMessageHash(msg.data as any);
              if (hash === parsed.messageHash) {
                matchingMsg = msg;
                break;
              }
            }

            if (matchingMsg) {
              // Add the signature to the message
              const ethSignature = new SafeSignature(
                parsed.signature.signer,
                parsed.signature.data,
                parsed.signature.isContractSignature,
              );
              matchingMsg.addSignature(ethSignature);
              saveMessage(safeAddress, matchingMsg, parsed.messageHash, chainId);

              // Clear URL parameter
              const newUrl = window.location.pathname;
              window.history.replaceState({}, "", newUrl);
              // Show success message
              toast.success("Signature added successfully!");
              // Trigger refresh of message list
              setRefreshCounter((c) => c + 1);
            } else {
              toast.error("Message not found. Please import the full message first.");
            }
          }
        } catch (e) {
          console.error("Failed to import signature from URL:", e);
          toast.error("Failed to import signature from shared link");
        }
      }
    }

    handleSharedLinks();
  }, [
    kit,
    searchParams,
    safeAddress,
    importTx,
    toast,
    getAllTransactions,
    saveTransaction,
    getAllMessages,
    saveMessage,
    chain,
  ]);

  // Fetch all transactions if any
  useEffect(() => {
    if (!kit || isLoading) return; // Wait for kit to be ready
    let cancelled = false;
    const safeKit = kit; // Capture kit in a const for TypeScript
    async function fetchTxs() {
      try {
        const chainId = chain?.id ? String(chain.id) : undefined;
        const transactions = getAllTransactions(safeAddress, chainId);

        if (transactions.length > 0) {
          // Get hashes for all transactions
          const txsWithHashes = await Promise.all(
            transactions.map(async (tx) => ({
              tx,
              hash: await safeKit.getTransactionHash(tx),
            })),
          );

          if (!cancelled) {
            setAllTxs(txsWithHashes);
          }
        } else {
          if (!cancelled) {
            setAllTxs([]);
          }
        }
      } catch {
        if (!cancelled) {
          setAllTxs([]);
        }
      }
    }
    fetchTxs();
    return () => {
      cancelled = true;
    };
  }, [getAllTransactions, kit, isLoading, safeAddress, chain, refreshCounter]);

  // Fetch all messages if any
  useEffect(() => {
    if (!kit || isLoading) return;
    let cancelled = false;
    const safeKit = kit;
    async function fetchMessages() {
      try {
        const chainId = chain?.id ? String(chain.id) : undefined;
        const messages = getAllMessages(safeAddress, chainId);

        if (messages.length > 0) {
          // Get hashes for all messages
          const messagesWithHashes = await Promise.all(
            messages.map(async (msg) => ({
              message: msg,
              hash: await safeKit.getSafeMessageHash(msg.data as any),
            })),
          );

          if (!cancelled) {
            setAllMessages(messagesWithHashes);
          }
        } else {
          if (!cancelled) {
            setAllMessages([]);
          }
        }
      } catch {
        if (!cancelled) {
          setAllMessages([]);
        }
      }
    }
    fetchMessages();
    return () => {
      cancelled = true;
    };
  }, [getAllMessages, kit, isLoading, safeAddress, chain, refreshCounter]);

  // Handler for deploying undeployed Safe
  async function handleDeployUndeployedSafe() {
    setModalOpen(true);
    setDeployError(null);
    // Deep copy to reset steps
    setDeploySteps(DEFAULT_DEPLOY_STEPS.map((step) => ({ ...step })));
    setDeployTxHash(null);
    try {
      const steps = await deployUndeployedSafe(setDeploySteps);
      setDeploySteps([...steps]);
      // Set txHash from any step that has it
      const txStep = steps.find((s) => s.txHash);
      if (txStep && txStep.txHash) {
        setDeployTxHash(txStep.txHash);
      }
      // If any step failed, set error and keep modal open
      if (steps.some((s) => s.status === "error")) {
        const errorStep = steps.find((s) => s.status === "error");
        setDeployError(errorStep && errorStep.error ? `Deployment error: ${errorStep.error}` : "Deployment error");
        return;
      }
    } catch {
      setDeployError("Unexpected deployment error");
    }
  }

  function handleCloseModal() {
    setModalOpen(false);
    // Deep copy to reset steps
    setDeploySteps(DEFAULT_DEPLOY_STEPS.map((step) => ({ ...step })));
  }

  function isDeploySuccess(deploySteps: SafeDeployStep[], deployTxHash: string | null) {
    return deploySteps.length > 0 && deploySteps.every((s) => s.status === "success") && !!deployTxHash;
  }

  // Handler to go to builder page
  function handleGoToBuilder() {
    navigate(`/safe/${safeAddress}/new-tx`);
  }

  // Handler to go to sign message page
  function handleGoToSignMessage() {
    navigate(`/safe/${safeAddress}/sign-message`);
  }

  // One-time: install/enable the LocalSafe snap. Not gated on isOwner.
  async function handleEnableSnap() {
    setMmBusy(true);
    try {
      await connectSnap();
      setMmRefresh((c) => c + 1);
      toast.success("Safe accounts enabled in MetaMask.");
    } catch (err) {
      toast.error(`Couldn't enable Safe accounts: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMmBusy(false);
    }
  }

  // Per-Safe: register THIS Safe as a MetaMask account. Not gated on isOwner.
  async function handleAddSafeToMetaMask() {
    if (!safeInfo) return;
    const cid = chain?.id;
    if (!cid) {
      toast.error("Connect to the Safe's network first.");
      return;
    }
    setMmBusy(true);
    try {
      await createSafeKeyringAccount({
        safeAddress,
        owners: safeInfo.owners,
        threshold: safeInfo.threshold,
        chainIds: [cid],
        companionUrl: window.location.origin,
      });
      setMmRefresh((c) => c + 1);
      toast.success("Safe added to MetaMask — select it there to connect to dApps.");
    } catch (err) {
      toast.error(`Couldn't add this Safe: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMmBusy(false);
    }
  }

  // Remove this Safe from MetaMask (e.g. so you can execute a Safe tx from this wallet).
  async function handleRemoveFromMetaMask() {
    setMmBusy(true);
    try {
      await removeSafeFromKeyring(safeAddress);
      setMmRefresh((c) => c + 1);
      toast.success("Removed this Safe from MetaMask.");
    } catch (err) {
      toast.error(`Couldn't remove from MetaMask: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMmBusy(false);
    }
  }

  // Utility to handle Safe transaction import and state update
  async function handleImportTx(importPreview: ImportTxPreview | { error: string } | null) {
    if (typeof importPreview === "object" && importPreview !== null && !("error" in importPreview)) {
      // Safe{Wallet} Transaction Builder batches carry raw calls (often with calldata
      // still to be ABI-encoded) — build them into one batched Safe transaction
      if (isTxBuilderBatch(importPreview)) {
        try {
          const parsed = parseTxBuilderBatch(importPreview);
          if (chain?.id && parsed.chainId !== String(chain.id)) {
            toast.error(`This batch is for chain ${parsed.chainId} — switch network first`);
            return;
          }
          const safeTx = await buildSafeTransaction(parsed.transactions);
          if (!safeTx) {
            toast.error("Failed to build transaction from batch");
            return;
          }
          setShowImportModal(false);
          setImportPreview(null);
          setRefreshCounter((c) => c + 1);
          toast.success(`Imported batch${parsed.name ? `: ${parsed.name}` : ""}`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to import Transaction Builder batch");
        }
        return;
      }
      try {
        const chainId = chain?.id ? String(chain.id) : undefined;
        importTx(safeAddress, JSON.stringify(importPreview), chainId);
        setShowImportModal(false);
        setImportPreview(null);
      } catch {
        // Optionally show error toast
      }
    }
  }

  // Handle owner management batch update
  async function handleOwnerManagementBatch(
    changes: Array<{ type: "add" | "remove"; address: string }>,
    newThreshold: number,
  ) {
    // Cast addresses to Address type for the hook
    const typedChanges = changes.map((c) => ({
      type: c.type,
      address: c.address as `0x${string}`,
    }));
    const txHash = await createBatchedOwnerManagementTransaction(typedChanges, newThreshold);
    if (txHash) {
      navigate(`/safe/${safeAddress}/tx/${txHash}`);
    }
  }

  // Get current MultiSend config for this Safe
  const currentMultiSendConfig = chain?.id ? getSafeMultiSendConfig(String(chain.id), safeAddress) : undefined;

  // Effective contract set for this chain (network config + per-Safe overrides)
  const effectiveContracts: ContractAddresses | null =
    chain?.id && contractNetworks
      ? {
          ...contractNetworks[String(chain.id)],
          ...(currentMultiSendConfig?.multiSendAddress && {
            multiSendAddress: currentMultiSendConfig.multiSendAddress,
          }),
          ...(currentMultiSendConfig?.multiSendCallOnlyAddress && {
            multiSendCallOnlyAddress: currentMultiSendConfig.multiSendCallOnlyAddress,
          }),
        }
      : null;

  // Verify the effective contracts on-chain: known addresses, official bytecode, or
  // user-confirmed pass; anything else is surfaced with a review prompt
  const [deploymentTrust, setDeploymentTrust] = useState<DeploymentTrustResult[]>([]);
  const [trustModalOpen, setTrustModalOpen] = useState(false);
  const trustedDeployments = chain?.id ? getTrustedDeployments(String(chain.id)) : undefined;
  const effectiveContractsKey = JSON.stringify(effectiveContracts) + JSON.stringify(trustedDeployments ?? null);
  useEffect(() => {
    if (!chain?.id || !publicClient || !effectiveContracts) {
      setDeploymentTrust([]);
      return;
    }
    let cancelled = false;
    verifyDeployments({
      client: publicClient,
      chainId: chain.id,
      contracts: effectiveContracts,
      fields: Object.keys(effectiveContracts) as Array<keyof ContractAddresses>,
      confirmed: trustedDeployments,
    })
      .then((results) => {
        if (!cancelled) setDeploymentTrust(results);
      })
      .catch(() => {
        if (!cancelled) setDeploymentTrust([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- object identities change every render; key captures content
  }, [chain?.id, publicClient, effectiveContractsKey]);

  const deploymentIssues = deploymentTrust.filter(
    (result) => result.status === "no-code" || result.status === "unverified",
  );

  // Handle MultiSend config save
  function handleSaveMultiSendConfig(multiSend?: string, multiSendCallOnly?: string) {
    if (chain?.id) {
      setSafeMultiSendConfig(String(chain.id), safeAddress, multiSend, multiSendCallOnly);
    }
  }

  // Handle transaction deletion
  async function handleDeleteTransaction(txHash: string, nonce: number) {
    const confirmed = await confirm(
      "Are you sure you want to delete this transaction? This action cannot be undone.",
      "Delete Transaction",
    );

    if (confirmed) {
      const chainId = chain?.id ? String(chain.id) : undefined;
      removeTransaction(safeAddress, txHash, nonce, chainId);
      // Filter out the deleted transaction from the current list
      const updatedTxs = allTxs.filter(({ hash }) => hash !== txHash);
      setAllTxs(updatedTxs);
      toast.success("Transaction deleted successfully");
    }
  }

  // Handle message deletion
  async function handleDeleteMessage(messageHash: string) {
    const confirmed = await confirm(
      "Are you sure you want to delete this message? This action cannot be undone.",
      "Delete Message",
    );

    if (confirmed) {
      const chainId = chain?.id ? String(chain.id) : undefined;
      removeMessage(safeAddress, messageHash, chainId);
      // Filter out the deleted message from the current list
      const updatedMessages = allMessages.filter(({ hash }) => hash !== messageHash);
      setAllMessages(updatedMessages);
      toast.success("Message deleted successfully");
    }
  }

  return (
    <AppSection>
      {deploymentIssues.length > 0 && (
        <p className="text-warning mb-4 font-mono text-xs" data-testid="untrusted-contracts-warning">
          [untrusted] safe contracts on this chain are not verified (
          {deploymentIssues.map((issue) => issue.field.replace(/Address$/, "")).join(", ")}){" — "}
          <button className="link" data-testid="review-deployments-btn" onClick={() => setTrustModalOpen(true)}>
            review
          </button>
        </p>
      )}
      {chain?.id && effectiveContracts && (
        <TrustedDeploymentsModal
          open={trustModalOpen}
          onClose={() => setTrustModalOpen(false)}
          chainId={String(chain.id)}
          contracts={effectiveContracts}
          confirmed={trustedDeployments}
          onConfirm={(addresses) => setTrustedDeployments(String(chain.id), addresses)}
        />
      )}
      {/* Stat row for key Safe data */}
      <div className="stats stats-horizontal mb-6">
        <div className="stat" data-testid="safe-dashboard-threshold">
          <div className="stat-title">Threshold</div>
          <div className="stat-value">{safeInfo?.threshold ?? "-"}</div>
        </div>
        <div className="stat" data-testid="safe-dashboard-owners">
          <div className="stat-title">Owners</div>
          <div className="stat-value">{safeInfo?.owners?.length ?? "-"}</div>
        </div>
        <div className="stat" data-testid="safe-dashboard-nonce">
          <div className="stat-title">Nonce</div>
          <div className="stat-value">{safeInfo?.nonce ?? "-"}</div>
        </div>
        <div className="stat" data-testid="safe-dashboard-balance">
          <div className="stat-title">Balance</div>
          <div className="stat-value text-primary flex gap-1">
            <p>
              {safeInfo?.balance !== undefined ? formatEther(safeInfo.balance) : "-"}{" "}
              {chain?.nativeCurrency.symbol ?? ""}
            </p>
          </div>
        </div>
      </div>
      <div className="divider" data-testid="safe-dashboard-divider">
        {safeName ? `${safeName}` : "Safe Details"}
      </div>
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 md:grid-rows-2">
        {/* Safe Info fills left column, spans two rows */}
        <AppCard title="Safe Info" className="md:col-start-1 md:row-span-2 md:row-start-1">
          <div className="mb-2" data-testid="safe-dashboard-address-row">
            <span className="font-semibold">Address:</span>
            <AppAddress address={safeAddress} className="ml-2" />
          </div>
          <div className="mb-2" data-testid="safe-dashboard-owners-row">
            <span className="font-semibold">Owners:</span>
            <ul className="ml-6 list-disc">
              {safeInfo?.owners?.length ? (
                safeInfo.owners.map((owner) => (
                  <li key={owner} data-testid={`safe-dashboard-owner-${owner}`}>
                    <AppAddress address={owner} className="text-xs" />
                  </li>
                ))
              ) : (
                <li className="text-xs text-gray-400">No owners found</li>
              )}
            </ul>
          </div>
          <div className="mb-2" data-testid="safe-dashboard-version-row">
            <span className="font-semibold">Version:</span>
            <span className="ml-2">{safeInfo?.version ?? "-"}</span>
          </div>
          {/* Manage Owners Button */}
          {safeInfo && safeInfo.deployed && isOwner && !unavailable && (
            <div className="mt-4 flex flex-col gap-2">
              <button className="btn btn-outline btn-sm w-full" onClick={() => setManageOwnersModalOpen(true)}>
                Manage Owners & Threshold
              </button>
              <button className="btn btn-outline btn-sm w-full" onClick={() => setMultiSendModalOpen(true)}>
                Configure MultiSend
              </button>
            </div>
          )}
        </AppCard>
        {/* Actions in top right cell */}
        <AppCard title="Actions" className="md:col-start-2 md:row-start-1">
          <div className="flex flex-col gap-2">
            {/* Transaction import button */}
            <div className="mb-2 flex gap-2" data-testid="safe-dashboard-actions-row">
              <button
                className="btn btn-secondary btn-outline btn-sm w-full"
                data-testid="safe-dashboard-import-tx-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Import transaction JSON from file"
                disabled={unavailable || !isOwner || !safeInfo?.deployed || !!error || isLoading}
              >
                Import Transaction
              </button>
              <input
                type="file"
                data-testid="safe-dashboard-import-tx-input"
                className="hidden"
                ref={fileInputRef}
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event: ProgressEvent<FileReader>) => {
                    try {
                      const result = event.target?.result;
                      if (typeof result === "string") {
                        const json = JSON.parse(result);
                        setImportPreview(json);
                      } else {
                        setImportPreview({ error: "Invalid file content." });
                      }
                      setShowImportModal(true);
                    } catch {
                      setImportPreview({ error: "Invalid JSON file." });
                      setShowImportModal(true);
                    }
                  };
                  reader.readAsText(file);
                  e.target.value = "";
                }}
              />
            </div>
            {/* Status and actions logic */}
            {isLoading && (
              <div className="flex h-20 items-center justify-center">
                <span className="loading loading-spinner loading-lg"></span>
              </div>
            )}
            {error && <div className="alert alert-error">{error}</div>}
            {unavailable && (
              <div className="alert alert-warning mb-4">This Safe is not available on the selected network.</div>
            )}
            {safeInfo && !safeInfo.deployed && !unavailable && (
              <>
                <div className="alert alert-warning mb-4">
                  This Safe is not deployed yet. You can deploy it now to start using multi-signature features.
                </div>
                {isOwner ? (
                  <button
                    className="btn btn-primary w-full"
                    onClick={handleDeployUndeployedSafe}
                    data-testid="deploy-safe-btn"
                  >
                    Deploy Safe
                  </button>
                ) : (
                  <div className="alert alert-info">Read-only: Only owners can deploy.</div>
                )}
              </>
            )}
            {safeInfo && safeInfo.deployed && isOwner && !isLoading && !error && !unavailable && (
              <div className="flex flex-col gap-2">
                <button
                  className="btn btn-outline btn-primary w-full"
                  onClick={handleGoToBuilder}
                  data-testid="safe-dashboard-go-to-builder-btn"
                >
                  Build New Transaction
                </button>
                <button
                  className="btn btn-outline btn-secondary w-full"
                  onClick={handleGoToSignMessage}
                  data-testid="safe-dashboard-sign-message-btn"
                >
                  Sign Message
                </button>
              </div>
            )}
            {safeInfo && safeInfo.deployed && !isLoading && !error && !unavailable && (
              <div
                className="border-base-300 bg-base-200 rounded-box mt-2 flex flex-col gap-3 border p-4"
                data-testid="safe-dashboard-metamask-section"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs tracking-wide opacity-70">METAMASK</span>
                  {mmStatus === "added" && (
                    <span className="badge badge-outline badge-sm gap-1" data-testid="safe-dashboard-mm-added-badge">
                      ✓ in MetaMask
                    </span>
                  )}
                </div>

                {mmStatus === "checking" && (
                  <div className="flex items-center gap-2 font-mono text-xs opacity-70">
                    <span className="loading loading-spinner loading-xs"></span>
                    Checking MetaMask…
                  </div>
                )}

                {mmStatus === "no-mm" && (
                  <p className="font-mono text-xs opacity-70" data-testid="safe-dashboard-mm-no-mm">
                    MetaMask not detected. Install MetaMask to use this Safe as an account.
                  </p>
                )}

                {(mmStatus === "uninstalled" || mmStatus === "not-added" || mmStatus === "added") && (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-col">
                        <span className="text-sm">Safe accounts</span>
                        <span className="font-mono text-xs opacity-60">
                          One-time: lets MetaMask manage Safe accounts.
                        </span>
                      </div>
                      {mmStatus === "uninstalled" ? (
                        <button
                          className="btn btn-outline btn-xs"
                          onClick={handleEnableSnap}
                          disabled={mmBusy}
                          data-testid="safe-dashboard-mm-enable-btn"
                        >
                          {mmBusy ? <span className="loading loading-spinner loading-xs"></span> : "Enable"}
                        </button>
                      ) : (
                        <span className="font-mono text-xs opacity-50" data-testid="safe-dashboard-mm-snap-enabled">
                          enabled
                        </span>
                      )}
                    </div>

                    <hr className="rule-dashed opacity-60" />

                    {mmStatus === "added" ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-mono text-xs opacity-60" data-testid="safe-dashboard-mm-confirmed">
                            Available in MetaMask — select it there to sign into dApps.
                          </p>
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={handleRemoveFromMetaMask}
                            disabled={mmBusy}
                            title="Remove this Safe from MetaMask (needed to sign or execute Safe transactions from this wallet)"
                            data-testid="safe-dashboard-mm-remove-btn"
                          >
                            {mmBusy ? <span className="loading loading-spinner loading-xs"></span> : "remove"}
                          </button>
                        </div>
                        <p className="font-mono text-xs opacity-50" data-testid="safe-dashboard-mm-signing-only-note">
                          Signs messages only (dApp sign-in, approvals). dApp transactions can&apos;t route through
                          MetaMask — build and execute them here in LocalSafe.
                        </p>
                        <p className="font-mono text-xs opacity-50" data-testid="safe-dashboard-mm-two-wallet-note">
                          To sign or execute this Safe&apos;s transactions, use a different owner wallet — or remove it
                          here first, then re-add anytime.
                        </p>
                      </div>
                    ) : (
                      <>
                        <button
                          className="btn btn-outline btn-sm w-full"
                          onClick={handleAddSafeToMetaMask}
                          disabled={mmBusy || mmStatus === "uninstalled"}
                          title={
                            mmStatus === "uninstalled"
                              ? "Enable Safe accounts first"
                              : "Add this Safe as a MetaMask account"
                          }
                          data-testid="safe-dashboard-add-to-metamask-btn"
                        >
                          {mmBusy ? <span className="loading loading-spinner loading-xs"></span> : "+ Add this Safe"}
                        </button>
                        {mmStatus === "not-added" && (
                          <p className="font-mono text-xs opacity-60">
                            Registers this Safe as a MetaMask account. You don&apos;t need to be an owner.
                          </p>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
            {safeInfo && safeInfo.deployed && !isOwner && !isLoading && !error && !unavailable && (
              <div className="alert alert-info">Read-only: Only owners can perform actions.</div>
            )}
            {/* If no safeInfo, show a message */}
            {!safeInfo && !isLoading && !error && !unavailable && (
              <div className="alert alert-info">
                {!connectedAddress ? (
                  <div className="flex flex-col gap-2">
                    <span className="font-semibold">Connect Wallet to Get Started</span>
                    <span className="text-sm">
                      Please connect your wallet to view Safe information and sign transactions.
                    </span>
                  </div>
                ) : (
                  "No Safe information available."
                )}
              </div>
            )}
          </div>
        </AppCard>
        {/* Current Transactions Queue in bottom right cell */}
        {allTxs.length > 0 && (
          <AppCard title="Current Transactions" testid="safe-dashboard-current-tx-card">
            <div className="flex flex-col gap-2">
              {allTxs.map(({ tx, hash }) => (
                <div key={hash} className="flex items-center gap-2">
                  <Link
                    className="btn btn-accent btn-outline flex w-full items-center justify-between gap-2 rounded text-sm"
                    data-testid={`safe-dashboard-current-tx-link-${hash}`}
                    to={`/safe/${safeAddress}/tx/${hash}`}
                    title="View transaction details"
                  >
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-semibold">Nonce:</span>
                      <span className="font-mono">{tx.data.nonce}</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-semibold">Hash:</span>
                      <span className="min-w-0 truncate font-mono text-xs" title={hash}>
                        {hash}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-semibold">Sigs:</span>
                      <span>{tx.signatures?.size ?? 0}</span>
                    </div>
                  </Link>
                  <button
                    className="btn btn-ghost btn-sm btn-square"
                    onClick={() => handleDeleteTransaction(hash, Number(tx.data.nonce))}
                    title="Delete transaction"
                    data-testid={`safe-dashboard-delete-tx-btn-${hash}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              className="btn btn-primary btn-outline btn-sm mt-2 w-full"
              data-testid="safe-dashboard-export-tx-btn"
              onClick={() => {
                try {
                  const chainId = chain?.id ? String(chain.id) : undefined;
                  const json = exportTx(safeAddress, chainId);
                  const blob = new Blob([json], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `safe-txs.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (e: unknown) {
                  console.error("Export error:", e);
                }
              }}
              title="Export all transactions JSON to file"
            >
              Export Transactions
            </button>
          </AppCard>
        )}
      </div>

      {/* Pending Messages Section */}
      {allMessages.length > 0 && (
        <div className="mt-6">
          <AppCard title="Pending Messages" testid="safe-dashboard-pending-messages-card">
            <div className="flex flex-col gap-2">
              {allMessages.map(({ message, hash }) => (
                <div key={hash} className="flex items-center gap-2">
                  <Link
                    className="btn btn-warning btn-outline flex w-full items-center justify-between gap-2 rounded text-sm"
                    data-testid={`safe-dashboard-pending-message-link-${hash}`}
                    to={`/safe/${safeAddress}/message/${hash}`}
                    title="View message details"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-semibold">Message:</span>
                      <span className="min-w-0 truncate font-mono text-xs">
                        {typeof message.data === "string" ? message.data : "EIP-712 Typed Data"}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-semibold">Hash:</span>
                      <span className="min-w-0 truncate font-mono text-xs" title={hash}>
                        {hash}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-semibold">Sigs:</span>
                      <span>
                        {message.signatures?.size ?? 0}/{safeInfo?.threshold ?? 1}
                      </span>
                    </div>
                  </Link>
                  <button
                    className="btn btn-ghost btn-sm btn-square"
                    onClick={() => handleDeleteMessage(hash)}
                    title="Delete message"
                    data-testid={`safe-dashboard-delete-message-btn-${hash}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </AppCard>
        </div>
      )}

      {/* Token Balances Section */}
      {safeInfo && safeInfo.deployed && !unavailable && chain?.id && (
        <TokenBalancesSection safeAddress={safeAddress} chainId={chain.id} />
      )}

      {/* Modal for deployment workflow */}
      <DeploymentModal
        open={modalOpen}
        steps={deploySteps}
        stepLabels={STEPS_DEPLOY_LABEL}
        txHash={deployTxHash}
        error={deployError}
        selectedNetwork={chain}
        onClose={handleCloseModal}
        closeLabel="Close"
        successLabel={isDeploySuccess(deploySteps, deployTxHash) ? "Go to Safe" : undefined}
        onSuccess={isDeploySuccess(deploySteps, deployTxHash) ? handleCloseModal : undefined}
      />
      {/* Import Modal with preview and confirmation */}
      <ImportSafeTxModal
        open={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setImportPreview(null);
        }}
        importPreview={importPreview}
        onReplace={async () => handleImportTx(importPreview)}
      />
      {/* Manage Owners Modal */}
      {safeInfo && (
        <ManageOwnersModal
          open={manageOwnersModalOpen}
          onClose={() => setManageOwnersModalOpen(false)}
          owners={safeInfo.owners}
          threshold={safeInfo.threshold}
          onBatchUpdate={handleOwnerManagementBatch}
        />
      )}
      {/* Configure MultiSend Modal */}
      <ConfigureMultiSendModal
        chainId={chain?.id}
        open={multiSendModalOpen}
        onClose={() => setMultiSendModalOpen(false)}
        currentMultiSend={currentMultiSendConfig?.multiSendAddress}
        currentMultiSendCallOnly={currentMultiSendConfig?.multiSendCallOnlyAddress}
        onSave={handleSaveMultiSendConfig}
      />
    </AppSection>
  );
}
