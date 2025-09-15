"use client";

import { useCallback } from "react";
import Safe, { SafeConfig } from "@safe-global/protocol-kit";
import {
  getMinimalEIP1193Provider,
  createPredictionConfig,
  createConnectionConfig,
} from "../utils/helpers";
import { SafeDeployStep, PendingSafeStatus, PayMethod } from "../utils/types";
import { waitForTransactionReceipt } from "viem/actions";
import { Chain, zeroAddress } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { useSafeWalletContext } from "../provider/SafeWalletProvider";

export default function useNewSafe() {
  // Wagmi hooks
  const { address: signer, connector } = useAccount();
  const { switchChain } = useSwitchChain();

  // Get SafeWalletProvider context
  const { addSafe, contractNetworks } = useSafeWalletContext();

  const predictNewSafeAddress = useCallback(
    async (
      owners: `0x${string}`[],
      threshold: number,
      chain: Chain,
      saltNonce: string,
    ): Promise<{ address: `0x${string}`; isDeployed: boolean }> => {
      let kit: Safe | null = null;
      try {
        const config: SafeConfig = createPredictionConfig(
          chain.rpcUrls.default.http[0],
          signer,
          owners,
          threshold,
          saltNonce,
          contractNetworks,
        );
        kit = await Safe.init(config);
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
    [signer, contractNetworks],
  );

  const deployNewSafe = useCallback(
    async (
      owners: `0x${string}`[],
      threshold: number,
      chain: Chain,
      saltNonce: string | undefined,
      setDeploySteps: (steps: SafeDeployStep[]) => void,
    ): Promise<SafeDeployStep[]> => {
      const steps: SafeDeployStep[] = [
        { step: "txCreated", status: "idle" },
        { step: "txSent", status: "idle" },
        { step: "confirmed", status: "idle" },
        { step: "deployed", status: "idle" },
      ];
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
          // Add to addedSafes if deployed, else to undeployedSafes
          if (isDeployed) {
            addSafe(
              String(chain.id),
              safeAddress,
              {
                owners,
                threshold,
              },
              true,
            );
          } else {
            const chainContracts = contractNetworks
              ? contractNetworks[String(chain.id)]
              : {};
            addSafe(
              String(chain.id),
              safeAddress,
              {
                props: {
                  factoryAddress: chainContracts?.safeProxyFactoryAddress || "",
                  masterCopy: chainContracts?.safeSingletonAddress || "",
                  safeAccountConfig: {
                    owners,
                    threshold,
                    fallbackHandler:
                      chainContracts?.fallbackHandlerAddress || "",
                  },
                  saltNonce: saltNonce || "",
                  safeVersion: "1.4.1", // @TODO dynamic later
                },
                status: {
                  status: PendingSafeStatus.AWAITING_EXECUTION,
                  type: PayMethod.PayLater,
                },
              },
              true,
            );
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
    [connector, signer, addSafe, switchChain, contractNetworks],
  );

  const connectNewSafe = useCallback(
    async (
      safeAddress: `0x${string}`,
      chainId: number,
    ): Promise<
      { owners: string[]; threshold: number } | { error: string } | null
    > => {
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
        const config = createConnectionConfig(
          provider,
          signer,
          safeAddress,
          contractNetworks,
        );
        // Initialize Safe SDK
        let kit;
        try {
          kit = await Safe.init(config);
        } catch (err) {
          return {
            error:
              "Failed to initialize Safe SDK: " +
              (err instanceof Error ? err.message : String(err)),
          };
        }
        let deployed;
        try {
          deployed = await kit.isSafeDeployed();
        } catch (err) {
          return {
            error:
              "Failed to check Safe deployment: " +
              (err instanceof Error ? err.message : String(err)),
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
            error:
              "Failed to fetch Safe owners/threshold: " +
              (err instanceof Error ? err.message : String(err)),
          };
        }
        return { owners, threshold };
      } catch (err) {
        return {
          error:
            "Unexpected error: " +
            (err instanceof Error ? err.message : String(err)),
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
