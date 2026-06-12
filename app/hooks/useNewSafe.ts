"use client";

import { useCallback } from "react";
import { SafeAccount, getKnownChainSafeVersion } from "../vendor/safe";
import { getMinimalEIP1193Provider, createPredictionConfig, createConnectionConfig } from "../utils/helpers";
import { SafeConfig, SafeDeployStep, PendingSafeStatus, PayMethod } from "../utils/types";
import { waitForTransactionReceipt } from "viem/actions";
import { Chain, zeroAddress } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { useSafeWalletContext } from "../provider/SafeWalletProvider";
import { DEFAULT_DEPLOY_STEPS } from "../utils/constants";

/**
 * Custom hook to manage the creation and connection of new Safe wallets.
 *
 * @returns An object containing functions to predict, deploy, and connect Safes.
 */
export default function useNewSafe() {
  // Wagmi hooks
  const { address: signer, connector } = useAccount();
  const { switchChain } = useSwitchChain();

  // Get SafeWalletProvider context
  const { addSafe, contractNetworks, getTrustedDeployments } = useSafeWalletContext();

  // Predict the address of a new Safe without deploying it
  const predictNewSafeAddress = useCallback(
    async (
      owners: `0x${string}`[],
      threshold: number,
      chain: Chain,
      saltNonce: string,
    ): Promise<{ address: `0x${string}`; isDeployed: boolean }> => {
      let kit: SafeAccount | null = null;
      try {
        const config: SafeConfig = createPredictionConfig(
          chain.rpcUrls.default.http[0],
          signer,
          owners,
          threshold,
          saltNonce,
          contractNetworks,
        );
        kit = await SafeAccount.init({
          ...config,
          confirmedDeployments: getTrustedDeployments(String(chain.id)),
        });
        if (kit) {
          const safeAddress = await kit.getAddress();
          const isDeployed = await kit.isSafeDeployed();
          return { address: safeAddress as `0x${string}`, isDeployed };
        }
      } catch {
        return { address: zeroAddress, isDeployed: false };
      }
      return { address: zeroAddress, isDeployed: false };
    },
    [signer, contractNetworks, getTrustedDeployments],
  );

  // Deploy a new Safe on the blockchain
  const deployNewSafe = useCallback(
    async (
      owners: `0x${string}`[],
      threshold: number,
      chain: Chain,
      saltNonce: string | undefined,
      safeName: string,
      setDeploySteps: (steps: SafeDeployStep[]) => void,
    ): Promise<SafeDeployStep[]> => {
      const steps: SafeDeployStep[] = DEFAULT_DEPLOY_STEPS.map((step) => ({
        ...step,
      }));
      try {
        steps[0].status = "running";
        setDeploySteps([...steps]);
        switchChain?.({ chainId: chain.id });
        const provider = await getMinimalEIP1193Provider(connector);
        if (!provider) {
          steps[0].status = "error";
          steps[0].error = "No provider found";
          setDeploySteps([...steps]);
          return steps;
        }
        const config: SafeConfig = createPredictionConfig(
          provider,
          signer,
          owners,
          threshold,
          saltNonce,
          contractNetworks,
        );
        const kit = await SafeAccount.init({
          ...config,
          confirmedDeployments: getTrustedDeployments(String(chain.id)),
        });
        let deploymentTx, kitClient, txHash;
        try {
          deploymentTx = await kit.createSafeDeploymentTransaction();
          kitClient = kit.getWalletClient();
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
          const newKit = await SafeAccount.init({
            provider,
            signer,
            safeAddress,
            contractNetworks,
          });
          const isDeployed = await newKit.isSafeDeployed();
          if (!isDeployed) throw new Error("Safe deployment not detected");
          steps[3].status = "success";
          steps[3].txHash = txHash;
          setDeploySteps([...steps]);
          // Add to addedSafes if deployed, else to undeployedSafes
          if (isDeployed) {
            // Store deployed safe in addressBook only
            addSafe(String(chain.id), safeAddress, safeName);
          } else {
            const chainContracts = contractNetworks ? contractNetworks[String(chain.id)] : {};
            addSafe(String(chain.id), safeAddress, safeName, {
              props: {
                factoryAddress: chainContracts?.safeProxyFactoryAddress || "",
                masterCopy: chainContracts?.safeSingletonAddress || "",
                safeAccountConfig: {
                  owners,
                  threshold,
                  fallbackHandler: chainContracts?.fallbackHandlerAddress || "",
                },
                saltNonce: saltNonce || "",
                safeVersion: getKnownChainSafeVersion(chain.id) ?? "1.4.1",
              },
              status: {
                status: PendingSafeStatus.AWAITING_EXECUTION,
                type: PayMethod.PayLater,
              },
            });
          }
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
    [connector, signer, addSafe, switchChain, contractNetworks, getTrustedDeployments],
  );

  // Connect to an existing Safe and fetch its owners and threshold
  const connectNewSafe = useCallback(
    async (
      safeAddress: `0x${string}`,
      chainId: number,
    ): Promise<{ owners: string[]; threshold: number } | { error: string } | null> => {
      try {
        if (!connector || !signer || !chainId) {
          return { error: "Missing wallet connector, signer, or chainId." };
        }
        switchChain?.({ chainId });
        const provider = await getMinimalEIP1193Provider(connector);
        if (!provider) {
          return {
            error: "Could not get EIP-1193 provider for selected network.",
          };
        }
        const config = createConnectionConfig(provider, signer, safeAddress, contractNetworks);
        // Initialize the Safe connection
        let kit;
        try {
          kit = await SafeAccount.init(config);
        } catch (err) {
          return {
            error: "Failed to connect to Safe: " + (err instanceof Error ? err.message : String(err)),
          };
        }
        let deployed;
        try {
          deployed = await kit.isSafeDeployed();
        } catch (err) {
          return {
            error: "Failed to check Safe deployment: " + (err instanceof Error ? err.message : String(err)),
          };
        }
        if (!deployed) {
          return { error: "Safe is not deployed on the selected network." };
        }
        // Fetch owners and threshold from the contract
        let owners, threshold;
        try {
          owners = await kit.getOwners();
          threshold = await kit.getThreshold();
        } catch (err) {
          return {
            error: "Failed to fetch Safe owners/threshold: " + (err instanceof Error ? err.message : String(err)),
          };
        }
        return { owners, threshold };
      } catch (err) {
        return {
          error: "Unexpected error: " + (err instanceof Error ? err.message : String(err)),
        };
      }
    },
    [connector, signer, switchChain, contractNetworks],
  );

  return {
    predictNewSafeAddress,
    deployNewSafe,
    connectNewSafe,
  };
}
