import React from "react";
import StepLayout from "./StepLayout";
import AddressInput from "./AddressInput";

interface StepSignersProps {
  signers: string[];
  resolvedSignerAddresses: (string | undefined)[];
  threshold: number;
  addSignerField: () => void;
  removeSignerField: (idx: number) => void;
  handleSignerChange: (idx: number, value: string) => void;
  handleSignerResolvedAddressChange: (idx: number, resolvedAddress: string | undefined) => void;
  setThreshold: (value: number) => void;
  onNext: () => void;
  onBack: () => void;
}

/**
 * Component for managing signers and threshold in a multi-step process.
 * @param {string[]} signers - An array of signer addresses.
 * @param {number} threshold - The number of required signatures for transaction approval.
 * @param {Function} addSignerField - Function to add a new signer input field.
 * @param {Function} removeSignerField - Function to remove a signer input field by index.
 * @param {Function} handleSignerChange - Function to handle changes in signer input fields.
 * @param {Function} setThreshold - Function to set the threshold value.
 * @param {Function} onNext - Function to proceed to the next step.
 * @param {Function} onBack - Function to go back to the previous step.
 * @returns A component for managing signers and threshold with validation and navigation controls.
 */
export default function StepSigners({
  signers,
  resolvedSignerAddresses,
  threshold,
  addSignerField,
  removeSignerField,
  handleSignerChange,
  handleSignerResolvedAddressChange,
  setThreshold,
  onNext,
  onBack,
}: StepSignersProps) {
  // Validation logic using resolved addresses
  const addressPattern = /^0x[a-fA-F0-9]{40}$/;
  const allSignersValid =
    resolvedSignerAddresses.length > 0 && resolvedSignerAddresses.every((addr) => !!addr && addressPattern.test(addr));
  const lowerResolved = resolvedSignerAddresses.map((addr) => addr?.toLowerCase() ?? "");
  const duplicateIndexes = lowerResolved
    .map((addr, idx, arr) => (addr && arr.indexOf(addr) !== idx ? idx : -1))
    .filter((idx) => idx !== -1);
  const hasDuplicates = duplicateIndexes.length > 0;

  const getInputErrorClass = (idx: number) => {
    const resolved = resolvedSignerAddresses[idx];
    const raw = signers[idx];
    if (!raw) return "";
    const isInvalid = !resolved || !addressPattern.test(resolved);
    const isDuplicate = duplicateIndexes.includes(idx);
    return isInvalid || isDuplicate ? "input-error" : "";
  };

  const isNextDisabled =
    signers.length === 0 || !allSignersValid || hasDuplicates || threshold <= 0 || threshold > signers.length;

  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/^0+/, "");
    setThreshold(Number(val));
  };

  return (
    <StepLayout
      title="Signers and Threshold"
      description="Here you will select the signers and set the threshold for your Safe account."
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => onBack()}>
            Back to Networks
          </button>
          <button type="button" className="btn btn-primary rounded" onClick={onNext} disabled={isNextDisabled}>
            Next
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {/* Owner input fields */}
        {signers.map((owner, idx) => (
          <fieldset key={idx} className="fieldset col-span-2">
            <legend className="fieldset-legend">Owner {idx + 1}</legend>
            <div className="flex items-start gap-2">
              <AddressInput
                value={owner}
                onChange={(val) => handleSignerChange(idx, val)}
                onResolvedAddressChange={(addr) => handleSignerResolvedAddressChange(idx, addr)}
                className={`flex-1 ${getInputErrorClass(idx)}`}
                required
                testId={`signer-input-${idx}`}
              />
              {signers.length > 1 && (
                <button type="button" className="btn btn-outline btn-secondary" onClick={() => removeSignerField(idx)}>
                  -
                </button>
              )}
            </div>
          </fieldset>
        ))}
        {/* Add owner btn */}
        <button
          type="button"
          className="btn btn-secondary btn-soft w-fit"
          onClick={addSignerField}
          data-testid="add-owner-btn"
        >
          + Add Owner
        </button>
      </div>
      {/* Threshold */}
      <fieldset className="fieldset w-full">
        <legend className="fieldset-legend">Threshold</legend>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={signers.length}
            step={1}
            value={threshold}
            onChange={handleThresholdChange}
            className="input validator w-fit"
            required
            data-testid="threshold-input"
          />
          <p className="text-sm">out of {signers.length} signers required to confirm a transaction</p>
        </div>
        <p className="validator-hint">Threshold must be between 1 and {signers.length}</p>
      </fieldset>
    </StepLayout>
  );
}
