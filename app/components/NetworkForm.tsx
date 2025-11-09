import React, { useEffect, useRef, useReducer, useState, memo, useMemo, useCallback } from "react";
import { FormAction, NetworkFormState } from "../utils/types";
import { sanitizeUserInput } from "../utils/helpers";
import { useChainManager } from "../hooks/useChainManager";
import { NETWORK_FORM_DEFAULTS } from "../utils/constants";

export interface NetworkFormProps {
  setShowForm: React.Dispatch<React.SetStateAction<null | "add" | "edit">>;
  onSubmit: (state: NetworkFormState) => void;
  initialState?: NetworkFormState | null;
  onCancel?: () => void;
}

export type NetworkFormErrors = Partial<Record<keyof NetworkFormState, string>> & {
  decimals?: string;
  symbol?: string;
};

/**
 * Network Form Component
 *
 * This component provides a form for adding or editing blockchain network configurations.
 * It includes fields for RPC URL, chain ID, name, block explorer URL, and native currency details.
 * The form handles validation, error states, and auto-detection of chain information based on the provided RPC URL.
 *
 * @param {NetworkFormProps} props - The properties for the NetworkForm component.
 * @returns The NetworkForm component.
 */
export default function NetworkForm({ setShowForm, onSubmit, initialState, onCancel }: NetworkFormProps) {
  // useReducer for form state management
  function formReducer(state: NetworkFormState, action: FormAction): NetworkFormState {
    switch (action.type) {
      case "update":
        return { ...state, [action.key!]: action.value };
      case "updateCurrency":
        return {
          ...state,
          nativeCurrency: {
            ...state.nativeCurrency,
            [action.currencyKey!]: action.currencyValue,
          },
        };
      case "reset":
        return NETWORK_FORM_DEFAULTS;
      default:
        return state;
    }
  }

  const [state, dispatch] = useReducer(formReducer, initialState ?? NETWORK_FORM_DEFAULTS);
  const [errors, setErrors] = useState<NetworkFormErrors>({});
  const [touched, setTouched] = useState<Partial<Record<string, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [rpcError, setRpcError] = useState<string>("");
  const { detectChain, detectedChain, detecting } = useChainManager();
  const [suggested, setSuggested] = useState<Partial<NetworkFormState> | null>(null);
  // Debounce for RPC URL detection
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  /**
   * Effect to update suggested chain info when detectedChain changes.
   * Prefills form fields with detected values if available.
   */
  useEffect(() => {
    if (detectedChain && detectedChain.chain) {
      // Only auto-suggest if chainId is present
      const chain = detectedChain.chain;
      setSuggested({
        id: chain.id ?? "",
        name: chain.name ?? "",
        nativeCurrency: chain.nativeCurrency ?? {
          name: "",
          symbol: "",
          decimals: 18,
        },
        blockExplorerUrl: chain.blockExplorers?.default?.url ?? "",
      });
    } else {
      setSuggested(null);
    }
  }, [detectedChain]);

  /**
   * Handle blur event for form fields to mark them as touched.
   *
   * @param {string} field - The name of the form field that lost focus.
   * @returns void
   */
  const handleBlur = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  /**
   * Debounced function to detect chain information from the provided RPC URL.
   *
   * @param {string} rpcUrl - The RPC URL to detect chain information from.
   * @returns void
   */
  const debouncedDetectChain = useCallback(
    (rpcUrl: string) => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
      debounceTimeout.current = setTimeout(() => {
        detectChain(rpcUrl);
      }, 1500);
    },
    [detectChain],
  );

  /**
   * Handle changes to the RPC URL field with validation and debounced chain detection.
   *
   * @param {string} value - The new RPC URL value.
   * @returns void
   */
  const handleRpcChange = useCallback(
    async (value: string) => {
      const sanitized = sanitizeUserInput(value);
      dispatch({ type: "update", key: "rpcUrl", value: sanitized });
      setTouched((prev) => ({ ...prev, rpcUrl: true }));
      setLoading(true);
      setRpcError("");
      setSuggested(null);
      if (!sanitized.startsWith("http")) {
        setRpcError("RPC URL must start with http(s)");
        setLoading(false);
        return;
      }
      debouncedDetectChain(sanitized);
      setLoading(false);
    },
    [debouncedDetectChain],
  );

  /**
   * Handle changes to form fields with validation.
   *
   * @param {K} key - The key of the form field to update.
   * @param {string | number} value - The new value for the form field.
   * @returns void
   */
  const handleChange = useCallback(<K extends keyof NetworkFormState>(key: K, value: string | number): void => {
    const sanitized = typeof value === "string" ? sanitizeUserInput(value) : value;
    let error = "";
    if (key === "id" && sanitized !== "" && isNaN(Number(sanitized))) {
      error = "Chain ID must be a number";
    }
    if (key === "name" && typeof sanitized === "string" && sanitized.length < 2) {
      error = "Name must be at least 2 characters";
    }
    setErrors((prev) => ({ ...prev, [key]: error }));
    dispatch({ type: "update", key, value: sanitized });
  }, []);

  // Handle changes to native currency fields with validation.
  const handleCurrencyChange = useCallback(
    <K extends keyof NetworkFormState["nativeCurrency"]>(key: K, value: string | number): void => {
      const sanitized = typeof value === "string" ? sanitizeUserInput(value) : value;
      let error = "";
      if (key === "symbol" && typeof sanitized === "string" && sanitized.length < 1) {
        error = "Symbol required";
      }
      if (key === "decimals" && (isNaN(Number(sanitized)) || Number(sanitized) < 0)) {
        error = "Decimals must be a positive number";
      }
      setErrors((prev) => ({ ...prev, [key]: error }));
      dispatch({
        type: "updateCurrency",
        currencyKey: key,
        currencyValue: sanitized,
      });
    },
    [],
  );

  /**
   * Suggestion Component
   *
   * A memoized component to display a suggestion button for auto-filling form fields.
   *
   * @param {keyof NetworkFormState | keyof NetworkFormState["nativeCurrency"]} field - The field to update when the suggestion is clicked.
   * @param {string | number} value - The suggested value to use.
   * @param {boolean} [isCurrency] - Whether the field is part of the native currency object.
   * @returns A button that, when clicked, updates the corresponding form field with the suggested value.
   */
  const Suggestion = memo(function Suggestion({
    field,
    value,
    isCurrency,
  }: {
    field: keyof NetworkFormState | keyof NetworkFormState["nativeCurrency"];
    value: string | number;
    isCurrency?: boolean;
  }) {
    return (
      <span className="flex items-center gap-1">
        Use suggested:{" "}
        <button
          className="btn btn-link p-0 text-xs"
          onClick={() => {
            if (isCurrency) {
              dispatch({
                type: "updateCurrency",
                currencyKey: field as keyof NetworkFormState["nativeCurrency"],
                currencyValue: value,
              });
            } else {
              dispatch({
                type: "update",
                key: field as keyof NetworkFormState,
                value,
              });
            }
          }}
        >
          {value}
        </button>
      </span>
    );
  });

  // Memoized derived values for optimization
  const isFormComplete = useMemo(() => {
    return (
      state.name.trim().length > 0 &&
      state.rpcUrl.trim().length > 0 &&
      state.nativeCurrency.symbol.trim().length > 0 &&
      state.nativeCurrency.name.trim().length > 0 &&
      state.id !== "" &&
      !isNaN(Number(state.id))
    );
  }, [state.name, state.rpcUrl, state.nativeCurrency.symbol, state.nativeCurrency.name, state.id]);

  // Extracted and memoized chain IDs for comparison
  const chainIdFromRpc = useMemo(() => {
    return suggested?.id && Number(suggested?.id) !== 0 ? Number(suggested?.id) : undefined;
  }, [suggested]);
  const chainIdInput = useMemo(() => {
    return !isNaN(Number(state.id)) && Number(state.id) !== 0 ? Number(state.id) : undefined;
  }, [state.id]);
  const chainIdMismatch = useMemo(() => {
    return chainIdFromRpc !== undefined && chainIdInput !== undefined && chainIdFromRpc !== chainIdInput;
  }, [chainIdFromRpc, chainIdInput]);

  /**
   * Handle form submission.
   *
   * @param e - Form submit event
   * @returns void
   */
  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormComplete || !!chainIdMismatch) return;
    onSubmit(state);
    // If editing, reset to initialState; if adding, reset to defaults
    dispatch({ type: "reset" });
    setShowForm(null);
  }

  return (
    <form className="space-y-4" onSubmit={handleFormSubmit}>
      <fieldset className="fieldset">
        <legend className="fieldset-legend">RPC URL</legend>
        <input
          id="networkform-rpcurl"
          className={`input input-bordered w-full ${rpcError && touched.rpcUrl ? "input-error" : ""}`}
          value={state.rpcUrl}
          onChange={(e) => handleRpcChange(e.target.value)}
          onBlur={() => handleBlur("rpcUrl")}
          required
        />
        {(loading || detecting) && <p className="mt-1 text-xs opacity-60">Detecting chain info...</p>}
        {rpcError && touched.rpcUrl && <p className="text-error mt-1 text-xs">{rpcError}</p>}
      </fieldset>
      <div className="flex flex-wrap gap-4">
        <fieldset className="fieldset flex-1">
          <legend className="fieldset-legend">Name</legend>
          <input
            id="networkform-name"
            className={`input input-bordered w-full ${errors.name && touched.name ? "input-error" : ""}`}
            value={state.name}
            onChange={(e) => handleChange("name", e.target.value)}
            onBlur={() => handleBlur("name")}
            required
          />
          {errors.name && touched.name && <p className="text-error mt-1 text-xs">{errors.name}</p>}
          {suggested?.name && <Suggestion field="name" value={suggested.name} />}
        </fieldset>
        <fieldset className={`fieldset flex-1${chainIdMismatch ? "border-warning" : ""}`}>
          <legend className="fieldset-legend">Chain ID</legend>
          <input
            id="networkform-id"
            className={`input input-bordered w-full ${errors.id && touched.id ? "input-error" : ""} ${chainIdMismatch ? "border-warning" : ""}`}
            value={state.id}
            onChange={(e) => handleChange("id", e.target.value)}
            onBlur={() => handleBlur("id")}
            required
          />
          {errors.id && touched.id && <p className="text-error mt-1 text-xs">{errors.id}</p>}
          {chainIdMismatch && (
            <p className="text-warning mt-1 text-xs">
              Mismatch: RPC <span className="font-bold">{chainIdFromRpc}</span> vs input{" "}
              <span className="font-bold">{chainIdInput}</span>
            </p>
          )}
          {suggested?.id && <Suggestion field="id" value={suggested.id} />}
        </fieldset>
      </div>
      <fieldset className="fieldset flex-1">
        <legend className="fieldset-legend">Block Explorer URL</legend>
        <input
          id="networkform-blockexplorerurl"
          className="input input-bordered w-full"
          value={state.blockExplorerUrl}
          onChange={(e) => handleChange("blockExplorerUrl", e.target.value)}
          onBlur={() => handleBlur("blockExplorerUrl")}
        />
        {suggested?.blockExplorerUrl && <Suggestion field="blockExplorerUrl" value={suggested.blockExplorerUrl} />}
      </fieldset>
      <fieldset className="fieldset">
        <legend className="fieldset-legend">Currency Name</legend>
        <input
          id="networkform-currencyname"
          className="input input-bordered w-full"
          value={state.nativeCurrency.name}
          onChange={(e) => handleCurrencyChange("name", e.target.value)}
          onBlur={() => handleBlur("currencyName")}
        />
        {suggested?.nativeCurrency?.name && (
          <Suggestion field="name" value={suggested.nativeCurrency.name} isCurrency />
        )}
      </fieldset>
      <div className="flex gap-4">
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Currency Decimals</legend>
          <input
            id="networkform-decimals"
            className={`input input-bordered w-full ${errors.decimals && touched.decimals ? "input-error" : ""}`}
            type="number"
            value={state.nativeCurrency.decimals}
            onChange={(e) => handleCurrencyChange("decimals", e.target.value)}
            onBlur={() => handleBlur("decimals")}
          />
          {errors.decimals && touched.decimals && <p className="text-error mt-1 text-xs">{errors.decimals}</p>}
          {suggested?.nativeCurrency?.decimals && (
            <Suggestion field="decimals" value={suggested.nativeCurrency.decimals} isCurrency />
          )}
        </fieldset>
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Currency Symbol</legend>
          <input
            id="networkform-symbol"
            className={`input input-bordered w-full ${errors.symbol && touched.symbol ? "input-error" : ""}`}
            value={state.nativeCurrency.symbol}
            onChange={(e) => handleCurrencyChange("symbol", e.target.value)}
            onBlur={() => handleBlur("symbol")}
          />
          {errors.symbol && touched.symbol && <p className="text-error mt-1 text-xs">{errors.symbol}</p>}
          {suggested?.nativeCurrency?.symbol && (
            <Suggestion field="symbol" value={suggested.nativeCurrency.symbol} isCurrency />
          )}
        </fieldset>
      </div>

      {/* Advanced Settings - Safe Contract Configuration */}
      <details className="collapse-arrow bg-base-200 collapse">
        <summary className="collapse-title text-sm font-medium">Advanced Settings (Optional)</summary>
        <div className="collapse-content space-y-4">
          <p className="mb-2 text-xs text-gray-400">
            Configure Safe contract addresses for this network. Leave empty to use Safe SDK defaults.
          </p>

          <div className="divider text-xs">Core Contracts</div>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Safe Proxy Factory (Optional)</legend>
            <input
              id="networkform-safeproxyfactory"
              className="input input-bordered w-full"
              value={state.safeProxyFactoryAddress || ""}
              onChange={(e) => handleChange("safeProxyFactoryAddress", e.target.value)}
              placeholder="0x... (optional)"
            />
            <label className="label">
              <span className="label-text-alt">Factory contract for deploying new Safe proxies</span>
            </label>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Safe Singleton (Optional)</legend>
            <input
              id="networkform-safesingleton"
              className="input input-bordered w-full"
              value={state.safeSingletonAddress || ""}
              onChange={(e) => handleChange("safeSingletonAddress", e.target.value)}
              placeholder="0x... (optional)"
            />
            <label className="label">
              <span className="label-text-alt">Master copy contract for Safe logic</span>
            </label>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Fallback Handler (Optional)</legend>
            <input
              id="networkform-fallbackhandler"
              className="input input-bordered w-full"
              value={state.fallbackHandlerAddress || ""}
              onChange={(e) => handleChange("fallbackHandlerAddress", e.target.value)}
              placeholder="0x... (optional)"
            />
            <label className="label">
              <span className="label-text-alt">Handler for fallback calls and message signatures</span>
            </label>
          </fieldset>

          <div className="divider text-xs">Transaction Batching</div>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">MultiSend (Optional)</legend>
            <input
              id="networkform-multisend"
              className="input input-bordered w-full"
              value={state.multiSendAddress || ""}
              onChange={(e) => handleChange("multiSendAddress", e.target.value)}
              placeholder="0x... (optional)"
            />
            <label className="label">
              <span className="label-text-alt">Used for batching multiple transactions together</span>
            </label>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">MultiSend Call Only (Optional)</legend>
            <input
              id="networkform-multisendcallonly"
              className="input input-bordered w-full"
              value={state.multiSendCallOnlyAddress || ""}
              onChange={(e) => handleChange("multiSendCallOnlyAddress", e.target.value)}
              placeholder="0x... (optional)"
            />
            <label className="label">
              <span className="label-text-alt">Used for call-only (no delegatecall) batched transactions</span>
            </label>
          </fieldset>
        </div>
      </details>

      <div className="mt-4 flex flex-col items-center justify-center gap-2">
        <div className="flex items-center gap-4">
          <button type="submit" className="btn btn-primary btn-sm" disabled={!isFormComplete || !!chainIdMismatch}>
            Save
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-ghost btn-sm"
            onClick={() => {
              dispatch({ type: "reset" });
              setShowForm(null);
              if (onCancel) onCancel();
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
