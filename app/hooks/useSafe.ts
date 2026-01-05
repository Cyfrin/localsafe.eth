import { useAccount } from "wagmi";
import { useCallback, useEffect, useState, useRef } from "react";
import { useSafeWalletContext } from "../provider/SafeWalletProvider";
import { createConnectionConfig, createPredictionConfig, getMinimalEIP1193Provider } from "../utils/helpers";
import { getAddress, encodeFunctionData, Address } from "viem";

// Cache for protocolKit instances (per chainId+safeAddress)
import { useSafeTxContext } from "../provider/SafeTxProvider";
import Safe, { EthSafeTransaction, SafeConfig } from "@safe-global/protocol-kit";
import { MinimalEIP1193Provider, SafeDeployStep } from "../utils/types";
import { DEFAULT_DEPLOY_STEPS } from "../utils/constants";
import { waitForTransactionReceipt } from "viem/actions";

// Safe contract ABI for owner management functions
const SAFE_ABI = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "_threshold", type: "uint256" },
    ],
    name: "addOwnerWithThreshold",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "prevOwner", type: "address" },
      { name: "owner", type: "address" },
      { name: "_threshold", type: "uint256" },
    ],
    name: "removeOwner",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "prevOwner", type: "address" },
      { name: "oldOwner", type: "address" },
      { name: "newOwner", type: "address" },
    ],
    name: "swapOwner",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_threshold", type: "uint256" }],
    name: "changeThreshold",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * Custom hook to manage and interact with a specific Safe wallet.
 *
 * @param {`0x${string}`} safeAddress - The address of the Safe wallet to manage.
 * @returns An object containing Safe information, loading states, and functions to interact with the Safe.
 */
export default function useSafe(safeAddress: `0x${string}`) {
  const { address: signer, chain, connector, isConnected } = useAccount();

  const { safeWalletData, contractNetworks, addSafe, removeSafe, getSafeMultiSendConfig } = useSafeWalletContext();
  const { saveTransaction, getTransaction } = useSafeTxContext();

  // Get Safe name from addressBook for current chain
  const chainId = chain?.id ? String(chain.id) : undefined;
  let safeName = "";
  if (chainId && safeWalletData.data.addressBook[chainId]?.[safeAddress as `0x${string}`]) {
    safeName = safeWalletData.data.addressBook[chainId]?.[safeAddress as `0x${string}`];
  }

  const [safeInfo, setSafeInfo] = useState<{
    owners: `0x${string}`[];
    balance: bigint;
    threshold: number;
    version: string;
    chainId: string;
    deployed: boolean;
    nonce: number;
    undeployedConfig?: Record<string, unknown>;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  // Get Safe info from context
  const deployedSafe = chainId && safeWalletData.data.addressBook[chainId]?.[safeAddress as `0x${string}`];
  const undeployedSafe = chainId && safeWalletData.data.undeployedSafes[chainId]?.[safeAddress as `0x${string}`];

  // Store the current kit instance in a ref
  const kitRef = useRef<Safe>(null);

  // Helper to (re)connect and cache a SafeKit instance
  const connectSafe = useCallback(
    async (safeAddress: `0x${string}`, provider: MinimalEIP1193Provider, signer: `0x${string}`): Promise<Safe> => {
      // Ensure signer address is properly checksummed
      const checksummedSigner = getAddress(signer);
      const config: SafeConfig = createConnectionConfig(provider, checksummedSigner, safeAddress, contractNetworks);
      let kit = await Safe.init(config);
      kit = await kit.connect(config);
      return kit;
    },
    [contractNetworks],
  );

  // Effect 1: Fetch Safe info from blockchain or local context
  useEffect(() => {
    if (!isConnected) {
      setSafeInfo(null);
      kitRef.current = null;
      setIsOwner(false);
      setUnavailable(false);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    async function fetchSafeInfo() {
      setIsLoading(true);
      setError(null);
      if (!safeAddress || !chainId) {
        setSafeInfo(null);
        kitRef.current = null;
        setIsOwner(false);
        setUnavailable(true);
        setIsLoading(false);
        return;
      }
      if (undeployedSafe) {
        setSafeInfo({
          owners: undeployedSafe.props.safeAccountConfig.owners as `0x${string}`[],
          balance: BigInt(0),
          threshold: undeployedSafe.props.safeAccountConfig.threshold,
          version: undeployedSafe.props.safeVersion || "1.4.1",
          chainId,
          deployed: false,
          nonce: 0,
          undeployedConfig: undeployedSafe.props,
        });
        kitRef.current = null;
        // Checksum signer for comparison with owners
        const checksummedSigner = signer ? getAddress(signer) : null;
        setIsOwner(
          checksummedSigner
            ? undeployedSafe.props.safeAccountConfig.owners.includes(checksummedSigner as `0x${string}`)
            : false,
        );
        setUnavailable(false);
      } else if (deployedSafe) {
        try {
          const provider = await getMinimalEIP1193Provider(connector);
          if (!provider) throw new Error("No provider available");
          // Always reconnect kit with current signer and provider
          const kit = await connectSafe(safeAddress as `0x${string}`, provider, signer as `0x${string}`);
          kitRef.current = kit;
          const [owners, threshold, version, balance, nonce] = await Promise.all([
            kit.getOwners(),
            kit.getThreshold(),
            kit.getContractVersion(),
            kit.getBalance(),
            kit.getNonce(),
          ]);
          if (cancelled) return;
          setSafeInfo({
            owners: owners as `0x${string}`[],
            balance: BigInt(balance),
            threshold,
            version,
            chainId,
            deployed: true,
            nonce,
          });
          setIsOwner(await kit.isOwner(signer as `0x${string}`));
          setUnavailable(false);
        } catch (e: unknown) {
          if (e instanceof Error) {
            setError(e.message);
          } else {
            setError("Failed to fetch Safe data from chain");
          }
          setSafeInfo(null);
          kitRef.current = null;
          setIsOwner(false);
          setUnavailable(true);
        }
      } else {
        // Safe not in local storage - try to fetch directly from blockchain
        try {
          const provider = await getMinimalEIP1193Provider(connector);
          if (!provider) throw new Error("No provider available");
          // Try to connect to the Safe directly
          const kit = await connectSafe(safeAddress as `0x${string}`, provider, signer as `0x${string}`);
          kitRef.current = kit;
          const [owners, threshold, version, balance, nonce] = await Promise.all([
            kit.getOwners(),
            kit.getThreshold(),
            kit.getContractVersion(),
            kit.getBalance(),
            kit.getNonce(),
          ]);
          if (cancelled) return;
          setSafeInfo({
            owners: owners as `0x${string}`[],
            balance: BigInt(balance),
            threshold,
            version,
            chainId,
            deployed: true,
            nonce,
          });
          setIsOwner(await kit.isOwner(signer as `0x${string}`));
          setUnavailable(false);
        } catch (e: unknown) {
          if (e instanceof Error) {
            setError(e.message);
          } else {
            setError("Failed to fetch Safe data from chain");
          }
          setSafeInfo(null);
          kitRef.current = null;
          setIsOwner(false);
          setUnavailable(true);
        }
      }
      setIsLoading(false);
    }
    fetchSafeInfo();
    return () => {
      cancelled = true;
    };
  }, [
    safeAddress,
    chainId,
    signer,
    deployedSafe,
    undeployedSafe,
    contractNetworks,
    connector,
    connectSafe,
    isConnected,
  ]);

  // Deploy an undeployed Safe using its config from SafeWalletData
  const deployUndeployedSafe = useCallback(
    async (setDeploySteps: (steps: Array<SafeDeployStep>) => void): Promise<Array<SafeDeployStep>> => {
      if (!undeployedSafe || !connector || !signer || !chainId) {
        return [
          {
            step: "txCreated",
            status: "error",
            error: "Missing Safe config, wallet connector, signer, or chainId.",
          },
        ];
      }
      const steps: SafeDeployStep[] = DEFAULT_DEPLOY_STEPS.map((step) => ({
        ...step,
      }));
      try {
        steps[0].status = "running";
        setDeploySteps([...steps]);
        const provider = await getMinimalEIP1193Provider(connector);
        if (!provider) {
          steps[0].status = "error";
          steps[0].error = "No provider found";
          setDeploySteps([...steps]);
          return steps;
        }
        // Build SafeConfig using helper for ProtocolKit compatibility
        // Ensure signer address is properly checksummed
        const checksummedSigner = signer ? getAddress(signer) : undefined;

        // Merge custom multiSend config if available
        let mergedContractNetworks = contractNetworks;
        if (chainId && contractNetworks) {
          const customMultiSend = getSafeMultiSendConfig(chainId, safeAddress as `0x${string}`);
          if (customMultiSend && (customMultiSend.multiSendAddress || customMultiSend.multiSendCallOnlyAddress)) {
            mergedContractNetworks = {
              ...contractNetworks,
              [chainId]: {
                ...contractNetworks[chainId],
                ...(customMultiSend.multiSendAddress && { multiSendAddress: customMultiSend.multiSendAddress }),
                ...(customMultiSend.multiSendCallOnlyAddress && {
                  multiSendCallOnlyAddress: customMultiSend.multiSendCallOnlyAddress,
                }),
              },
            };
          }
        }

        const config: SafeConfig = createPredictionConfig(
          provider,
          checksummedSigner,
          undeployedSafe.props.safeAccountConfig.owners,
          undeployedSafe.props.safeAccountConfig.threshold,
          undeployedSafe.props.saltNonce,
          mergedContractNetworks,
        );
        const kit = await Safe.init(config);
        let deploymentTx, kitClient, txHash;
        try {
          deploymentTx = await kit.createSafeDeploymentTransaction();
          kitClient = await kit.getSafeProvider().getExternalSigner();
          steps[0].status = "success";
          steps[1].status = "running";
          setDeploySteps([...steps]);
        } catch (err) {
          steps[0].status = "error";
          steps[0].error = err instanceof Error ? err.message : String(err);
          setDeploySteps([...steps]);
          return steps;
        }
        try {
          txHash = await kitClient!.sendTransaction({
            to: deploymentTx.to as `0x${string}`,
            value: BigInt(deploymentTx.value),
            data: deploymentTx.data as `0x${string}`,
            chain: chain,
          });
          steps[1].status = "success";
          steps[1].txHash = txHash;
          steps[2].status = "running";
          setDeploySteps([...steps]);
        } catch (err) {
          steps[1].status = "error";
          steps[1].error = err instanceof Error ? err.message : String(err);
          setDeploySteps([...steps]);
          return steps;
        }
        try {
          if (txHash) {
            // Wait for confirmation (replace with your preferred method)
            await waitForTransactionReceipt(kitClient!, { hash: txHash });
            steps[2].status = "success";
            steps[2].txHash = txHash;
            steps[3].status = "running";
            setDeploySteps([...steps]);
          }
        } catch (err) {
          steps[2].status = "error";
          steps[2].error = err instanceof Error ? err.message : String(err);
          setDeploySteps([...steps]);
          return steps;
        }
        try {
          const safeAddress = await kit.getAddress();
          const newKit = await kit.connect({ safeAddress });
          const isDeployed = await newKit.isSafeDeployed();
          if (!isDeployed) throw new Error("Safe deployment not detected");
          steps[3].status = "success";
          steps[3].txHash = txHash;
          setDeploySteps([...steps]);
          // Update SafeWalletData: move from undeployed to deployed
          addSafe(chainId, safeAddress as `0x${string}`, safeName);
          removeSafe(chainId, safeAddress as `0x${string}`, false);
        } catch (err) {
          steps[3].status = "error";
          steps[3].error = err instanceof Error ? err.message : String(err);
          steps[3].txHash = txHash;
          setDeploySteps([...steps]);
          return steps;
        }
      } catch (err) {
        steps[0].status = "error";
        steps[0].error = err instanceof Error ? err.message : String(err);
        setDeploySteps([...steps]);
      }
      return steps;
    },
    [undeployedSafe, connector, signer, chain, chainId, addSafe, removeSafe, safeName, contractNetworks],
  );

  // ProtocolKit helpers
  // Build a SafeTransaction
  const buildSafeTransaction = useCallback(
    async (
      txs: Array<{
        to: string;
        value: string;
        data: string;
        operation?: number;
      }>,
      nonce?: number,
    ): Promise<EthSafeTransaction | null> => {
      const kit = kitRef.current;
      if (!kit) return null;
      try {
        // Normalize transactions to ensure value is never empty string
        const normalizedTxs = txs.map((tx) => ({
          ...tx,
          value: tx.value || "0",
          data: tx.data || "0x",
        }));

        const options: {
          transactions: Array<{ to: string; value: string; data: string; operation?: number }>;
          options?: { nonce: number };
        } = {
          transactions: normalizedTxs,
        };

        // Add nonce if provided
        if (nonce !== undefined) {
          options.options = { nonce };
        }

        const safeTx = await kit.createTransaction(options);
        // txHash no longer needed
        saveTransaction(safeAddress, safeTx, chainId);
        return safeTx;
      } catch (err) {
        console.error("Error building SafeTransaction:", err);
        return null;
      }
    },
    [saveTransaction, safeAddress, chainId],
  );

  // Validate a SafeTransaction
  const validateSafeTransaction = useCallback(async (safeTx: EthSafeTransaction): Promise<boolean> => {
    const kit = kitRef.current;
    if (!kit) return false;
    return kit.isValidTransaction(safeTx);
  }, []);

  // Get transaction hash
  const getSafeTransactionHash = useCallback(async (safeTx: EthSafeTransaction): Promise<string> => {
    const kit = kitRef.current;
    if (!kit) return "";
    return kit.getTransactionHash(safeTx);
  }, []);

  // Sign a SafeTransaction
  const signSafeTransaction = useCallback(
    async (safeTx: EthSafeTransaction): Promise<EthSafeTransaction | null> => {
      try {
        const kit = kitRef.current;
        if (!kit || !signer) return null;
        const checksummedSigner = getAddress(signer);
        // Get the actual account from the provider
        const provider = await getMinimalEIP1193Provider(connector);

        // Re-connect the kit with the current signer to ensure proper context
        const reconnectedKit = await connectSafe(safeAddress, provider!, checksummedSigner as `0x${string}`);

        // Normalize the transaction data to fix empty string values
        // This handles existing transactions that were created before validation fix
        const normalizedTxData = {
          ...safeTx.data,
          value: safeTx.data.value || "0",
          data: safeTx.data.data || "0x",
        };

        // Create a new transaction with normalized data
        const normalizedSafeTx = new EthSafeTransaction(normalizedTxData);
        // Copy signatures if any exist
        if (safeTx.signatures) {
          safeTx.signatures.forEach((sig) => {
            normalizedSafeTx.addSignature(sig);
          });
        }
        const signedTx = await reconnectedKit.signTransaction(normalizedSafeTx);
        saveTransaction(safeAddress, signedTx, chainId);
        setHasSigned(true);
        return signedTx;
      } catch (err) {
        console.error("Error signing SafeTransaction:", err);
        return null;
      }
    },
    [saveTransaction, safeAddress, signer, connector, connectSafe, chainId],
  );

  // Broadcast a SafeTransaction
  const broadcastSafeTransaction = useCallback(async (safeTx: EthSafeTransaction) => {
    const kit = kitRef.current;
    if (!kit) return null;
    return kit.executeTransaction(safeTx);
  }, []);

  // Reconstruct SafeTransaction from provider data (current only)
  const getSafeTransactionCurrent = useCallback(async (): Promise<EthSafeTransaction | null> => {
    const kit = kitRef.current;
    if (!kit) return null;
    const safeTx = getTransaction(safeAddress);
    if (!safeTx) return null;
    // Check if current owner has already signed
    // Safe SDK stores signatures with lowercase addresses
    let signed = false;
    if (safeTx.signatures && signer) {
      const checksummedSigner = getAddress(signer);
      signed = safeTx.signatures.has(checksummedSigner.toLowerCase());
    }
    setHasSigned(signed);
    return safeTx;
  }, [getTransaction, signer, safeAddress]);

  // Create transaction to add a new owner
  const createAddOwnerTransaction = useCallback(
    async (newOwner: Address, newThreshold: number): Promise<string | null> => {
      if (!safeInfo) return null;

      try {
        // Encode the addOwnerWithThreshold function call
        const data = encodeFunctionData({
          abi: SAFE_ABI,
          functionName: "addOwnerWithThreshold",
          args: [newOwner, BigInt(newThreshold)],
        });

        // Build the Safe transaction
        const safeTx = await buildSafeTransaction([
          {
            to: safeAddress,
            value: "0",
            data,
            operation: 0, // Call operation
          },
        ]);

        if (!safeTx) {
          throw new Error("Failed to build transaction");
        }

        // Get the transaction hash
        const txHash = await getSafeTransactionHash(safeTx);
        return txHash;
      } catch (err) {
        console.error("Error creating add owner transaction:", err);
        throw err;
      }
    },
    [safeInfo, safeAddress, buildSafeTransaction, getSafeTransactionHash],
  );

  // Create transaction to remove an owner
  const createRemoveOwnerTransaction = useCallback(
    async (ownerToRemove: Address, newThreshold: number): Promise<string | null> => {
      if (!safeInfo) return null;

      try {
        const owners = safeInfo.owners;
        const ownerIndex = owners.findIndex((o) => o.toLowerCase() === ownerToRemove.toLowerCase());

        if (ownerIndex === -1) {
          throw new Error("Owner not found");
        }

        // Get the previous owner in the linked list
        // If removing the first owner, prevOwner is the sentinel address
        const prevOwner =
          ownerIndex === 0 ? ("0x0000000000000000000000000000000000000001" as Address) : owners[ownerIndex - 1];

        // Encode the removeOwner function call
        const data = encodeFunctionData({
          abi: SAFE_ABI,
          functionName: "removeOwner",
          args: [prevOwner, ownerToRemove, BigInt(newThreshold)],
        });

        // Build the Safe transaction
        const safeTx = await buildSafeTransaction([
          {
            to: safeAddress,
            value: "0",
            data,
            operation: 0, // Call operation
          },
        ]);

        if (!safeTx) {
          throw new Error("Failed to build transaction");
        }

        // Get the transaction hash
        const txHash = await getSafeTransactionHash(safeTx);
        return txHash;
      } catch (err) {
        console.error("Error creating remove owner transaction:", err);
        throw err;
      }
    },
    [safeInfo, safeAddress, buildSafeTransaction, getSafeTransactionHash],
  );

  // Create transaction to change threshold
  const createChangeThresholdTransaction = useCallback(
    async (newThreshold: number): Promise<string | null> => {
      if (!safeInfo) return null;

      try {
        // Encode the changeThreshold function call
        const data = encodeFunctionData({
          abi: SAFE_ABI,
          functionName: "changeThreshold",
          args: [BigInt(newThreshold)],
        });

        // Build the Safe transaction
        const safeTx = await buildSafeTransaction([
          {
            to: safeAddress,
            value: "0",
            data,
            operation: 0, // Call operation
          },
        ]);

        if (!safeTx) {
          throw new Error("Failed to build transaction");
        }

        // Get the transaction hash
        const txHash = await getSafeTransactionHash(safeTx);
        return txHash;
      } catch (err) {
        console.error("Error creating change threshold transaction:", err);
        throw err;
      }
    },
    [safeInfo, safeAddress, buildSafeTransaction, getSafeTransactionHash],
  );

  // Create batched transaction for owner management (add/remove owners + change threshold)
  const createBatchedOwnerManagementTransaction = useCallback(
    async (
      changes: Array<{ type: "add" | "remove"; address: Address }>,
      newThreshold: number,
    ): Promise<string | null> => {
      if (!safeInfo) return null;

      try {
        const transactions: Array<{
          to: string;
          value: string;
          data: string;
          operation: number;
        }> = [];

        // Process removals first (order matters in Safe's linked list)
        const removals = changes.filter((c) => c.type === "remove");
        const additions = changes.filter((c) => c.type === "add");

        // Get current owners list
        let currentOwners = [...safeInfo.owners];

        // Check if we can use swapOwner (1 removal + 1 addition)
        if (removals.length === 1 && additions.length === 1) {
          // Use swapOwner instead of removeOwner + addOwnerWithThreshold
          const removal = removals[0];
          const addition = additions[0];

          const ownerIndex = currentOwners.findIndex((o) => o.toLowerCase() === removal.address.toLowerCase());

          if (ownerIndex === -1) {
            throw new Error(`Owner ${removal.address} not found`);
          }

          // Get the previous owner in the linked list
          const prevOwner =
            ownerIndex === 0
              ? ("0x0000000000000000000000000000000000000001" as Address)
              : currentOwners[ownerIndex - 1];

          // Encode the swapOwner function call
          const data = encodeFunctionData({
            abi: SAFE_ABI,
            functionName: "swapOwner",
            args: [prevOwner, removal.address, addition.address],
          });

          transactions.push({
            to: safeAddress,
            value: "0",
            data,
            operation: 0,
          });

          // Update our local owners list
          currentOwners = currentOwners.filter((_, i) => i !== ownerIndex);
          currentOwners.push(addition.address);
        } else {
          // Use separate removeOwner and addOwnerWithThreshold transactions
          // Create remove transactions
          for (const removal of removals) {
            const ownerIndex = currentOwners.findIndex((o) => o.toLowerCase() === removal.address.toLowerCase());

            if (ownerIndex === -1) {
              throw new Error(`Owner ${removal.address} not found`);
            }

            // Get the previous owner in the linked list
            const prevOwner =
              ownerIndex === 0
                ? ("0x0000000000000000000000000000000000000001" as Address)
                : currentOwners[ownerIndex - 1];

            // For removals, we use current threshold (will be changed later)
            const data = encodeFunctionData({
              abi: SAFE_ABI,
              functionName: "removeOwner",
              args: [prevOwner, removal.address, BigInt(safeInfo.threshold)],
            });

            transactions.push({
              to: safeAddress,
              value: "0",
              data,
              operation: 0,
            });

            // Update our local owners list for the next iteration
            currentOwners = currentOwners.filter((_, i) => i !== ownerIndex);
          }

          // Create add transactions
          for (const addition of additions) {
            const data = encodeFunctionData({
              abi: SAFE_ABI,
              functionName: "addOwnerWithThreshold",
              args: [addition.address, BigInt(safeInfo.threshold)],
            });

            transactions.push({
              to: safeAddress,
              value: "0",
              data,
              operation: 0,
            });

            // Update our local owners list
            currentOwners.push(addition.address);
          }
        }

        // Finally, change threshold if it's different
        if (newThreshold !== safeInfo.threshold) {
          const data = encodeFunctionData({
            abi: SAFE_ABI,
            functionName: "changeThreshold",
            args: [BigInt(newThreshold)],
          });

          transactions.push({
            to: safeAddress,
            value: "0",
            data,
            operation: 0,
          });
        }

        // Build the batched Safe transaction
        const safeTx = await buildSafeTransaction(transactions);

        if (!safeTx) {
          throw new Error("Failed to build transaction");
        }

        // Get the transaction hash
        const txHash = await getSafeTransactionHash(safeTx);
        return txHash;
      } catch (err) {
        console.error("Error creating batched owner management transaction:", err);
        throw err;
      }
    },
    [safeInfo, safeAddress, buildSafeTransaction, getSafeTransactionHash],
  );

  return {
    safeInfo,
    safeName,
    isLoading,
    error,
    isOwner,
    hasSigned,
    unavailable,
    buildSafeTransaction,
    validateSafeTransaction,
    getSafeTransactionHash,
    signSafeTransaction,
    broadcastSafeTransaction,
    getSafeTransactionCurrent,
    deployUndeployedSafe,
    addSafe,
    contractNetworks,
    safeWalletData,
    kit: kitRef.current,
    createAddOwnerTransaction,
    createRemoveOwnerTransaction,
    createChangeThresholdTransaction,
    createBatchedOwnerManagementTransaction,
  };
}
