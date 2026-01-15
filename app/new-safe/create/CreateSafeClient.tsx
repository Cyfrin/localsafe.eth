"use client";

import BtnCancel from "@/app/components/BtnCancel";
import AppCard from "@/app/components/AppCard";
import AppSection from "@/app/components/AppSection";
import AppAddress from "@/app/components/AppAddress";
import { useState, useEffect, useCallback } from "react";
import { useAccount, useChains } from "wagmi";
import StepSigners from "@/app/components/StepSigners";
import StepNetworks from "@/app/components/StepNameAndNetworks";
import SafeDetails from "@/app/components/SafeDetails";
import Stepper from "@/app/components/Stepper";
import DeploymentModal from "@/app/components/DeploymentModal";
import { isValidAddress } from "@/app/utils/helpers";
import { CREATE_STEPS, DEFAULT_DEPLOY_STEPS, STEPS_DEPLOY_LABEL } from "@/app/utils/constants";
import { useNavigate } from "react-router-dom";
import useNewSafe from "@/app/hooks/useNewSafe";
import { SafeDeployStep, PendingSafeStatus, PayMethod } from "@/app/utils/types";
import { Chain, zeroAddress } from "viem";
import { useSafeWalletContext } from "@/app/provider/SafeWalletProvider";
import { getRandomSafeName } from "@/app/utils/helpers";
import { useToast } from "@/app/hooks/useToast";

/**
 * Deploy New Safe Client Component
 *
 * This component handles the client-side logic and UI for creating a new safe.
 * It manages the multi-step process of selecting networks, adding owners,
 * setting thresholds, predicting the safe address, and deploying the safe.
 *
 * It also store undeployed safes in local storage for later execution.
 *
 * @returns Deploy New Safe Client Component
 */
export default function CreateSafeClient() {
  // Hooks
  const { address: signer, chain } = useAccount();
  const chains = useChains();
  const navigate = useNavigate();
  const { addSafe, contractNetworks } = useSafeWalletContext();
  const { predictNewSafeAddress, deployNewSafe } = useNewSafe();
  const toast = useToast();

  // Local UI state for feedback
  const [isPredicting, setIsPredicting] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploySteps, setDeploySteps] = useState<SafeDeployStep[]>(DEFAULT_DEPLOY_STEPS);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployTxHash, setDeployTxHash] = useState<string | null>(null);

  // Step management
  const [currentStep, setCurrentStep] = useState(0);

  // Safe name state
  const [safeName, setSafeName] = useState<string>("");
  const [randomName] = useState(() => getRandomSafeName());

  // Multi-chain selection
  const [selectedChains, setSelectedChains] = useState<Chain[]>([]);

  // Owners state with auto-fill of connected wallet
  const [signers, setSigners] = useState<string[]>([""]);
  // Threshold state
  const [threshold, setThreshold] = useState<number>(1);
  // Salt nonce for Safe creation (number string for SDK compatibility)
  const [saltNonce, setSaltNonce] = useState<number>(0);
  // Modal state for deployment progress
  const [modalOpen, setModalOpen] = useState(false);
  // Predict Safe address for all selected chains when entering validation step
  const [predictedAddresses, setPredictedAddresses] = useState<Record<string, `0x${string}` | null>>({});

  /**
   * Auto-fill first signer with connected wallet address when available
   * and on step 0 (chain selection step)
   */
  useEffect(() => {
    if (currentStep === 0 && signer) {
      setSigners((prev) => {
        // Replace first entry with new signer, keep others
        if (prev.length === 0) return [signer];
        if (prev[0] !== signer) return [signer, ...prev.slice(1)];
        return prev;
      });
    }
  }, [signer, currentStep]);

  /**
   * Owners management functions
   *
   * Add, remove, and update signer fields in the owners list.
   */
  function addSignerField() {
    setSigners((prev) => [...prev, ""]);
  }

  /**
   * Remove a signer field by index
   *
   * @param signerIdx Index of the signer field to remove
   */
  function removeSignerField(signerIdx: number) {
    setSigners((prev) => prev.filter((_, idx) => idx !== signerIdx));
  }

  /**
   * Update a signer field by index
   *
   * @param signerIdx Index of the signer field to update
   * @param value New value for the signer field
   */
  function handleSignerChange(signerIdx: number, value: string) {
    setSigners((prevSigners) => prevSigners.map((owner, idx) => (idx === signerIdx ? value : owner)));
  }

  // Step content as components (now with StepNetworks)
  const stepContent = [
    // Step 0: Chain selection + Safe name input
    <StepNetworks
      key="chains"
      chains={chains}
      selectedChains={selectedChains}
      setSelectedChains={setSelectedChains}
      onNext={() => setCurrentStep(1)}
      safeName={safeName}
      setSafeName={setSafeName}
      placeholder={randomName}
    />,
    // Step 1: Owners/Threshold
    <StepSigners
      key="signers"
      signers={signers}
      threshold={threshold}
      addSignerField={addSignerField}
      removeSignerField={removeSignerField}
      handleSignerChange={handleSignerChange}
      setThreshold={setThreshold}
      onNext={() => setCurrentStep(2)}
      onBack={() => setCurrentStep(0)}
    />,
    null,
  ];

  /**
   * Predict Safe address for all selected chains with the same owners,
   * threshold, and salt nonce, ensuring consistency across chains.
   *
   * If a consistent address cannot be found within maxAttempts,
   * an error is thrown.
   *
   * @param owners List of owner addresses
   * @param threshold Number of required confirmations
   * @param chains List of selected chains
   * @param initialSaltNonce Initial salt nonce to start with
   * @param maxAttempts Maximum number of attempts to find a consistent address
   * @returns Object containing the consistent safe address, used salt nonce, and predictions per chain
   */
  const predictConsistentSafeAddressAcrossChains = useCallback(
    async (owners: `0x${string}`[], threshold: number, chains: Chain[], initialSaltNonce: string, maxAttempts = 20) => {
      let saltNonce = initialSaltNonce;
      // Try up to maxAttempts to find a consistent address
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const predictions: Record<string, { address: `0x${string}`; isDeployed: boolean }> = {};
        for (const chain of chains) {
          let result = {
            address: zeroAddress as `0x${string}`,
            isDeployed: false,
          };
          try {
            result = await predictNewSafeAddress(owners, threshold, chain, saltNonce);
          } catch {
            // fallback already set
          }
          predictions[chain.id] = result;
        }
        // Check if all predicted addresses match, none are deployed, and none are zero address
        const addresses = Object.values(predictions).map((p) => p.address);
        const allMatch = addresses.every((addr) => addr === addresses[0]);
        const anyDeployed = Object.values(predictions).some((p) => p.isDeployed);
        const anyZeroAddress = addresses.some((addr) => addr === zeroAddress);

        // If all match, none deployed, and no zero addresses, return the result
        if (allMatch && !anyDeployed && !anyZeroAddress) {
          return { safeAddress: addresses[0], saltNonce, predictions };
        }
        saltNonce = (parseInt(saltNonce) + 1).toString();
      }
      throw new Error("Could not find consistent Safe address across chains");
    },
    [predictNewSafeAddress],
  );

  /**
   * Effect to predict Safe address when entering step 2 (review & validate)
   * with valid data: at least one selected chain, at least one valid signer,
   * and a threshold greater than 0.
   *
   * Updates predictedAddresses state with the results.
   * Handles loading and error states.
   *
   * Cleans up by cancelling any ongoing prediction if dependencies change
   * or component unmounts.
   */
  useEffect(() => {
    let cancelled = false;
    async function runPrediction() {
      // Only run prediction when entering step 2 with valid data
      if (currentStep !== 2 || selectedChains.length === 0 || signers.filter(Boolean).length === 0 || threshold === 0)
        return;
      // Reset previous prediction state
      setIsPredicting(true);
      setPredictError(null);
      const validSigners = signers.filter(isValidAddress);
      try {
        // Predict consistent Safe address across selected chains
        const { saltNonce: foundSaltNonce, predictions } = await predictConsistentSafeAddressAcrossChains(
          validSigners,
          threshold,
          selectedChains,
          saltNonce.toString(),
        );
        if (!cancelled) {
          setPredictedAddresses(
            Object.fromEntries(Object.entries(predictions).map(([id, prediction]) => [id, prediction.address])),
          );
          setSaltNonce(Number(foundSaltNonce));
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const errorMessage =
            typeof err === "object" && err !== null && "message" in err
              ? String((err as { message?: unknown }).message)
              : "Prediction error";
          setPredictError(errorMessage);
          setPredictedAddresses({});
        }
      } finally {
        if (!cancelled) setIsPredicting(false);
      }
    }
    runPrediction();
    return () => {
      cancelled = true;
    };
  }, [
    currentStep,
    selectedChains,
    signers,
    threshold,
    saltNonce,
    predictNewSafeAddress,
    predictConsistentSafeAddressAcrossChains,
  ]);

  /**
   * Handle Safe deployment for single-chain Safes.
   *
   * Sets up modal and deployment state, calls deployNewSafe,
   * and updates deployment steps and error states accordingly.
   *
   * @returns Promise<void>
   */
  async function handleDeploySafe() {
    setModalOpen(true);
    setIsDeploying(true);
    setDeployError(null);
    // Deep copy to reset steps
    setDeploySteps(DEFAULT_DEPLOY_STEPS.map((step) => ({ ...step })));
    setDeployTxHash(null);
    try {
      const validSigners = signers.filter(isValidAddress);
      const steps = await deployNewSafe(
        validSigners,
        threshold,
        selectedChains[0],
        saltNonce.toString(),
        safeName.trim() || randomName,
        setDeploySteps,
      );
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
    } catch (e: unknown) {
      const errorMessage =
        typeof e === "object" && e !== null && "message" in e
          ? String((e as { message?: unknown }).message)
          : "Unexpected deployment error";
      setDeployError(errorMessage);
    } finally {
      setIsDeploying(false);
      setSaltNonce(0);
    }
  }

  /**
   * Handle closing the deployment modal
   *
   * Resets modal state and deployment steps.
   */
  function handleCloseModal() {
    setModalOpen(false);
    // Deep copy to reset steps
    setDeploySteps(DEFAULT_DEPLOY_STEPS.map((step) => ({ ...step })));
  }

  /**
   * Handle adding multi-chain Safe accounts to local storage for later deployment.
   *
   * Loops through selected chains, adds each safe to local storage with
   * PendingSafeStatus.AWAITING_EXECUTION status, and navigates to /accounts page.
   *
   * @returns Promise<void>
   */
  async function handleValidateMultiChain() {
    // Check if we have valid predicted addresses before proceeding
    const validPredictions = selectedChains.filter((chain) => predictedAddresses[chain.id]);
    if (validPredictions.length === 0) {
      toast.error("Could not predict Safe address. Please check your network connection and try again.");
      return;
    }

    const validSigners = signers.filter(isValidAddress);
    // Add each selected chain safe to local storage
    selectedChains.forEach((chain) => {
      const address = predictedAddresses[chain.id];
      if (address) {
        const chainContracts = contractNetworks ? contractNetworks[String(chain.id)] : {};
        addSafe(String(chain.id), address, safeName.trim() || randomName, {
          props: {
            // The Safe Proxy Factory contract is used to deploy new Safe contracts
            factoryAddress: chainContracts?.safeProxyFactoryAddress || "",
            // The Safe Singleton contract is the implementation logic for all Safes
            masterCopy: chainContracts?.safeSingletonAddress || "",
            safeAccountConfig: {
              owners: validSigners,
              threshold,
              // The fallback handler is used for modules and contract calls
              fallbackHandler: chainContracts?.fallbackHandlerAddress || "",
            },
            saltNonce: saltNonce.toString(),
            // Safe version for this chain (should match contract deployment)
            safeVersion: "1.4.1", // @TODO dynamic later
          },
          status: {
            status: PendingSafeStatus.AWAITING_EXECUTION,
            type: PayMethod.PayLater,
          },
        });
      }
    });
    toast.success("Safe configuration saved. Deploy on each chain when ready.");
    navigate("/accounts?view=undeployed");
  }

  /**
   * Check if deployment was successful based on steps, txHash, and predicted addresses.
   *
   * @param deploySteps Array of deployment steps
   * @param deployTxHash Transaction hash of the deployment
   * @param predictedAddresses Record of predicted addresses per chain
   * @returns True if deployment was successful, false otherwise
   */
  function isDeploySuccess(
    deploySteps: SafeDeployStep[],
    deployTxHash: string | null,
    predictedAddresses: Record<string, `0x${string}` | null>,
  ) {
    return (
      deploySteps.length > 0 &&
      deploySteps.every((s) => s.status === "success") &&
      !!deployTxHash &&
      !!Object.values(predictedAddresses).every((addr) => !!addr)
    );
  }

  return (
    <>
      <AppSection data-testid="create-safe-section">
        {/* Header with Stepper and Cancel button */}
        <div className="grid w-full grid-cols-6 items-center">
          <div className="self-start">
            <BtnCancel to="/accounts" data-testid="cancel-create-safe-btn" />
          </div>
          <Stepper steps={CREATE_STEPS} currentStep={currentStep} data-testid="create-safe-stepper" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
          {/* Review & Validate */}
          {currentStep === 2 ? (
            <AppCard title="Review & Validate Safe Account" className="w-full" data-testid="review-safe-card">
              <SafeDetails
                safeName={safeName.trim() || randomName}
                selectedNetworks={selectedChains}
                signers={signers}
                threshold={threshold}
              />
              <div className="divider my-0" />
              <div className="flex flex-col gap-4">
                {isPredicting ? (
                  <div className="flex items-center gap-2" data-testid="safe-predicting-indicator">
                    <span>Predicting Safe address</span>
                    <span className="loading loading-dots loading-xs" />
                  </div>
                ) : (
                  Object.keys(predictedAddresses).length > 0 && (
                    <div data-testid="predicted-safe-address">
                      <p className="mb-1 text-lg font-semibold">Predicted Safe Address:</p>
                      <div className="flex flex-wrap gap-2 p-2">
                        <AppAddress
                          address={Object.values(predictedAddresses).find((addr) => !!addr) || "N/A"}
                          className="text-sm"
                          testid="predicted-safe-address-value"
                        />
                      </div>
                    </div>
                  )
                )}
                {predictError && (
                  <div className="alert alert-error" data-testid="safe-predict-error">
                    {predictError}
                  </div>
                )}
                <div className="mt-4 flex justify-between gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setCurrentStep(1)}
                    data-testid="back-to-owners-btn"
                  >
                    Back to Owners
                  </button>
                  {selectedChains.length === 1 ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={
                        Object.keys(predictedAddresses).length === 0 ||
                        Object.values(predictedAddresses).some((addr) => !addr) ||
                        isPredicting ||
                        isDeploying
                      }
                      onClick={handleDeploySafe}
                      data-testid="create-safe-btn"
                    >
                      {isDeploying ? "Deploying..." : "Deploy New Safe"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-accent"
                      disabled={
                        selectedChains.length === 0 ||
                        Object.keys(predictedAddresses).length === 0 ||
                        Object.values(predictedAddresses).some((addr) => !addr) ||
                        isPredicting
                      }
                      onClick={handleValidateMultiChain}
                      data-testid="add-accounts-btn"
                    >
                      Save Configuration
                    </button>
                  )}
                </div>
              </div>
            </AppCard>
          ) : (
            // Other steps: Chain selection and Owners/Threshold
            <div className="grid w-full grid-cols-12 gap-8">
              {/* Step content: pass testid via props if possible */}
              {stepContent[currentStep]}
              {/* Safe Info Card: Display Selected Networks */}
              <div className="col-span-10 col-start-2 md:col-span-5 md:col-start-auto">
                <AppCard title="Safe Account Preview" data-testid="safe-preview-card">
                  <SafeDetails
                    safeName={safeName.trim() || randomName}
                    selectedNetworks={selectedChains}
                    signers={signers}
                    threshold={threshold}
                    data-testid="safe-preview-details"
                  />
                </AppCard>
              </div>
            </div>
          )}
        </div>
      </AppSection>
      {/* Modal outside of container flex */}
      <DeploymentModal
        open={modalOpen}
        steps={deploySteps}
        stepLabels={STEPS_DEPLOY_LABEL}
        txHash={deployTxHash}
        error={deployError}
        selectedNetwork={chain}
        onClose={handleCloseModal}
        closeLabel="Close"
        successLabel={isDeploySuccess(deploySteps, deployTxHash, predictedAddresses) ? "Go to Accounts" : undefined}
        onSuccess={
          isDeploySuccess(deploySteps, deployTxHash, predictedAddresses) ? () => navigate("/accounts") : undefined
        }
      />
    </>
  );
}
