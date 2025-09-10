import React from "react";
import StepLayout from "./StepLayout";

interface StepSignersProps {
  signers: string[];
  threshold: number;
  addSignerField: () => void;
  removeSignerField: (idx: number) => void;
  handleSignerChange: (idx: number, value: string) => void;
  setThreshold: (value: number) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function StepSigners({
  signers,
  threshold,
  addSignerField,
  removeSignerField,
  handleSignerChange,
  setThreshold,
  onBack,
  onNext,
}: StepSignersProps) {
  // Validation logic
  const addressPattern = /^0x[a-fA-F0-9]{40}$/;
  const allSignersValid =
    signers.length > 0 && signers.every((addr) => addressPattern.test(addr));
  const lowerSigners = signers.map((addr) => addr.toLowerCase());
  const duplicateIndexes = lowerSigners
    .map((addr, idx, arr) => (arr.indexOf(addr) !== idx ? idx : -1))
    .filter((idx) => idx !== -1);
  const hasDuplicates = duplicateIndexes.length > 0;

  const getInputErrorClass = (value: string, idx: number) => {
    if (!value) return "";
    const isInvalid = !addressPattern.test(value);
    const isDuplicate = duplicateIndexes.includes(idx);
    return isInvalid || isDuplicate ? "input-error" : "";
  };

  const isNextDisabled =
    signers.length === 0 ||
    !allSignersValid ||
    hasDuplicates ||
    threshold <= 0 ||
    threshold > signers.length;

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
          <button
            type="button"
            className="btn btn-ghost btn-secondary rounded"
            onClick={onBack}
          >
            Back
          </button>
          <button
            type="button"
            className="btn btn-primary rounded"
            onClick={onNext}
            disabled={isNextDisabled}
          >
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
            <div className="flex items-center gap-2">
              <input
                id={`owner-${idx}`}
                type="text"
                value={owner}
                onChange={(e) => handleSignerChange(idx, e.target.value)}
                placeholder="0x..."
                className={`input flex-1 ${getInputErrorClass(owner, idx)}`}
                pattern="^0x[a-fA-F0-9]{40}$"
                required
              />
              {signers.length > 1 && (
                <button
                  type="button"
                  className="btn btn-outline btn-secondary"
                  onClick={() => removeSignerField(idx)}
                >
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
          />
          <p className="text-sm">
            out of {signers.length} signers required to confirm a transaction
          </p>
        </div>
        <p className="validator-hint">
          Threshold must be between 1 and {signers.length}
        </p>
      </fieldset>
    </StepLayout>
  );
}
