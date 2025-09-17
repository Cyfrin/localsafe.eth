"use client";

import BtnCancel from "@/app/components/BtnCancel";
import AppCard from "@/app/components/AppCard";
import AppSection from "@/app/components/AppSection";
import AppAddress from "@/app/components/AppAddress";
import { useState, useEffect, useCallback } from "react";
import { useAccount, useChains } from "wagmi";
import StepSigners from "./components/StepSigners";
import StepNetworks from "./components/StepNameAndNetworks";
import SafeDetails from "../components/SafeDetails";
import Stepper from "./components/Stepper";
import { WorkflowModal } from "@/app/components/WorkflowModal";
import { isValidAddress } from "@/app/utils/helpers";
import {
  CREATE_STEPS,
  DEFAULT_DEPLOY_STEPS,
  STEPS_DEPLOY_LABEL,
} from "@/app/utils/constants";
import { useRouter } from "next/navigation";
import useNewSafe from "@/app/hooks/useNewSafe";
import {
  SafeDeployStep,
  PendingSafeStatus,
  PayMethod,
} from "@/app/utils/types";
import { Chain, zeroAddress } from "viem";
import { useSafeWalletContext } from "@/app/provider/SafeWalletProvider";
import { getRandomSafeName } from "@/app/utils/helpers";

export default function CreateSafeClient() {
  const { address: signer, chain } = useAccount();
  const chains = useChains();
  const router = useRouter();
  const { addSafe, contractNetworks } = useSafeWalletContext();
  const { predictNewSafeAddress, deployNewSafe } = useNewSafe();

  // Local UI state for feedback
  const [isPredicting, setIsPredicting] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploySteps, setDeploySteps] =
    useState<SafeDeployStep[]>(DEFAULT_DEPLOY_STEPS);
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
  useEffect(() => {
    if (currentStep === 0 && signer) {
      setSigners((prev) => {
        // Replace first entry with new signer, keep others
        if (prev.length === 0) return [signer];
        if (prev[0] !== signer) return [signer, ...prev.slice(1)];
        return prev;
      });
    }
    // Do not update signers if not at signers selection step
  }, [signer, currentStep]);
  // Helpers to manage dynamic signer fields
  function addSignerField() {
    setSigners((prev) => [...prev, ""]);
  }
  function removeSignerField(signerIdx: number) {
    setSigners((prev) => prev.filter((_, idx) => idx !== signerIdx));
  }
  function handleSignerChange(signerIdx: number, value: string) {
    setSigners((prevSigners) =>
      prevSigners.map((owner, idx) => (idx === signerIdx ? value : owner)),
    );
  }

  // Threshold state
  const [threshold, setThreshold] = useState<number>(1);

  // Salt nonce for Safe creation (number string for SDK compatibility)
  const [saltNonce, setSaltNonce] = useState<number>(0);

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

  // Modal state for deployment progress
  const [modalOpen, setModalOpen] = useState(false);

  // Utility: Predict Safe address across chains, loop saltNonce until all match and not deployed
  const predictConsistentSafeAddressAcrossChains = useCallback(
    async (
      owners: `0x${string}`[],
      threshold: number,
      chains: Chain[],
      initialSaltNonce: string,
      maxAttempts = 20,
    ) => {
      let saltNonce = initialSaltNonce;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const predictions: Record<
          string,
          { address: `0x${string}`; isDeployed: boolean }
        > = {};
        for (const chain of chains) {
          let result = {
            address: zeroAddress as `0x${string}`,
            isDeployed: false,
          };
          try {
            result = await predictNewSafeAddress(
              owners,
              threshold,
              chain,
              saltNonce,
            );
          } catch {
            // fallback already set
          }
          predictions[chain.id] = result;
        }
        const addresses = Object.values(predictions).map((p) => p.address);
        const allMatch = addresses.every((addr) => addr === addresses[0]);
        const anyDeployed = Object.values(predictions).some(
          (p) => p.isDeployed,
        );

        if (allMatch && !anyDeployed) {
          return { safeAddress: addresses[0], saltNonce, predictions };
        }
        saltNonce = (parseInt(saltNonce) + 1).toString();
      }
      throw new Error("Could not find consistent Safe address across chains");
    },
    [predictNewSafeAddress],
  );

  // Predict Safe address for all selected chains when entering validation step
  const [predictedAddresses, setPredictedAddresses] = useState<
    Record<string, `0x${string}` | null>
  >({});
  useEffect(() => {
    let cancelled = false;
    async function runPrediction() {
      if (
        currentStep !== 2 ||
        selectedChains.length === 0 ||
        signers.filter(Boolean).length === 0 ||
        threshold === 0
      )
        return;
      setIsPredicting(true);
      setPredictError(null);
      const validSigners = signers.filter(isValidAddress);
      try {
        const { saltNonce: foundSaltNonce, predictions } =
          await predictConsistentSafeAddressAcrossChains(
            validSigners,
            threshold,
            selectedChains,
            saltNonce.toString(),
          );
        if (!cancelled) {
          setPredictedAddresses(
            Object.fromEntries(
              Object.entries(predictions).map(([id, prediction]) => [
                id,
                prediction.address,
              ]),
            ),
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

  // Deploy Safe
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
        setDeployError(
          errorStep && errorStep.error
            ? `Deployment error: ${errorStep.error}`
            : "Deployment error",
        );
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

  function handleCloseModal() {
    setModalOpen(false);
    // Deep copy to reset steps
    setDeploySteps(DEFAULT_DEPLOY_STEPS.map((step) => ({ ...step })));
  }

  async function handleValidateMultiChain() {
    const validSigners = signers.filter(isValidAddress);
    selectedChains.forEach((chain) => {
      const address = predictedAddresses[chain.id];
      if (address) {
        const chainContracts = contractNetworks
          ? contractNetworks[String(chain.id)]
          : {};
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
    router.push("/accounts");
  }

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
      <AppSection>
        <div className="grid w-full grid-cols-6 items-center">
          <div className="self-start">
            <BtnCancel href="/accounts" />
          </div>
          <Stepper steps={CREATE_STEPS} currentStep={currentStep} />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
          {currentStep === 2 ? (
            <AppCard title="Review & Validate Safe Account" className="w-full">
              <SafeDetails
                safeName={safeName.trim() || randomName}
                selectedNetworks={selectedChains}
                signers={signers}
                threshold={threshold}
              />
              <div className="divider my-0" />
              <div className="flex flex-col gap-4">
                {isPredicting ? (
                  <div className="flex items-center gap-2">
                    <span>Predicting Safe address</span>
                    <span className="loading loading-dots loading-xs" />
                  </div>
                ) : (
                  Object.keys(predictedAddresses).length > 0 && (
                    <div>
                      <p className="mb-1 text-lg font-semibold">
                        Predicted Safe Address:
                      </p>
                      <div className="flex flex-wrap gap-2 p-2">
                        <AppAddress
                          address={
                            Object.values(predictedAddresses).find(
                              (addr) => !!addr,
                            ) || "N/A"
                          }
                          className="text-sm"
                        />
                      </div>
                    </div>
                  )
                )}
                {predictError && (
                  <div className="alert alert-error">{predictError}</div>
                )}
                <div className="mt-4 flex justify-between gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setCurrentStep(1)}
                  >
                    Back to Owners
                  </button>
                  {selectedChains.length === 1 ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={
                        Object.values(predictedAddresses).some(
                          (addr) => !addr,
                        ) ||
                        isPredicting ||
                        isDeploying
                      }
                      onClick={handleDeploySafe}
                    >
                      {isDeploying ? "Deploying..." : "Create Safe"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-accent"
                      disabled={
                        selectedChains.length === 0 ||
                        Object.values(predictedAddresses).some(
                          (addr) => !addr,
                        ) ||
                        isPredicting
                      }
                      onClick={handleValidateMultiChain}
                    >
                      Add accounts
                    </button>
                  )}
                </div>
              </div>
            </AppCard>
          ) : (
            <div className="grid w-full grid-cols-12 gap-8">
              {stepContent[currentStep]}
              {/* Safe Info Card: Display Selected Networks */}
              <div className="col-span-10 col-start-2 md:col-span-5 md:col-start-auto">
                <AppCard title="Safe Account Preview">
                  <SafeDetails
                    safeName={safeName.trim() || randomName}
                    selectedNetworks={selectedChains}
                    signers={signers}
                    threshold={threshold}
                  />
                </AppCard>
              </div>
            </div>
          )}
        </div>
      </AppSection>
      {/* Modal outside of container flex */}
      <WorkflowModal
        open={modalOpen}
        steps={deploySteps}
        stepLabels={STEPS_DEPLOY_LABEL}
        txHash={deployTxHash}
        error={deployError}
        selectedNetwork={chain}
        onClose={handleCloseModal}
        closeLabel="Close"
        redirectLabel={
          isDeploySuccess(deploySteps, deployTxHash, predictedAddresses)
            ? "Go to Accounts"
            : undefined
        }
        redirectTo={
          isDeploySuccess(deploySteps, deployTxHash, predictedAddresses)
            ? "/accounts"
            : undefined
        }
      />
    </>
  );
}
