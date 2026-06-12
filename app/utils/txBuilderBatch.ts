// Parser for Safe{Wallet} Transaction Builder batch files (txBuilderVersion exports).
//
// Format: { version, chainId, meta?, transactions: [{ to, value, data | null,
// contractMethod?, contractInputsValues? }] }. When `data` is null the calldata must be
// ABI-encoded from contractMethod + contractInputsValues.

import { encodeFunctionData, isHex } from "viem";
import type { Abi } from "viem";

interface TxBuilderInput {
  name: string;
  type: string;
  internalType?: string;
}

interface TxBuilderTransaction {
  to: string;
  value: string | null;
  data: string | null;
  contractMethod?: {
    name: string;
    inputs: TxBuilderInput[];
    payable?: boolean;
  };
  contractInputsValues?: Record<string, string>;
}

export interface TxBuilderBatch {
  version: string;
  chainId: string;
  meta?: { name?: string; description?: string; createdFromSafeAddress?: string };
  transactions: TxBuilderTransaction[];
}

export interface ParsedTxBuilderBatch {
  chainId: string;
  name?: string;
  createdFromSafeAddress?: string;
  transactions: Array<{ to: string; value: string; data: string; operation: number }>;
}

/** Whether parsed JSON looks like a Transaction Builder batch (vs this app's own export). */
export function isTxBuilderBatch(json: unknown): json is TxBuilderBatch {
  if (!json || typeof json !== "object") return false;
  const candidate = json as Record<string, unknown>;
  if (typeof candidate.chainId !== "string" || !Array.isArray(candidate.transactions)) return false;
  return candidate.transactions.every(
    (tx) =>
      tx &&
      typeof tx === "object" &&
      typeof (tx as TxBuilderTransaction).to === "string" &&
      // this app's own export format carries `data` as a SafeTx object, never string/null
      (typeof (tx as TxBuilderTransaction).data === "string" ||
        (tx as TxBuilderTransaction).data === null ||
        (tx as TxBuilderTransaction).data === undefined),
  );
}

// Transaction Builder stores every input value as a string; coerce the ones viem
// cannot take verbatim
function coerceInputValue(type: string, value: string): unknown {
  if (type.endsWith("]")) {
    return JSON.parse(value);
  }
  if (type === "bool") {
    return value === "true";
  }
  if (type.startsWith("uint") || type.startsWith("int")) {
    return BigInt(value);
  }
  return value;
}

function encodeTransaction(tx: TxBuilderTransaction, index: number): { to: string; value: string; data: string } {
  if (tx.data && isHex(tx.data)) {
    return { to: tx.to, value: tx.value || "0", data: tx.data };
  }
  const method = tx.contractMethod;
  if (!method) {
    throw new Error(`Transaction ${index + 1}: no calldata and no contract method to encode`);
  }
  const abiItem = {
    type: "function",
    name: method.name,
    stateMutability: method.payable ? "payable" : "nonpayable",
    inputs: method.inputs,
    outputs: [],
  };
  const args = method.inputs.map((input) => {
    const value = tx.contractInputsValues?.[input.name];
    if (value === undefined || value === "") {
      throw new Error(`Transaction ${index + 1}: missing value for parameter ${input.name} (${input.type})`);
    }
    return coerceInputValue(input.type, value);
  });
  const data = encodeFunctionData({ abi: [abiItem] as Abi, functionName: method.name, args });
  return { to: tx.to, value: tx.value || "0", data };
}

/** ABI-encode every entry of a Transaction Builder batch into plain Safe call inputs. */
export function parseTxBuilderBatch(batch: TxBuilderBatch): ParsedTxBuilderBatch {
  if (batch.transactions.length === 0) {
    throw new Error("Transaction Builder batch contains no transactions");
  }
  return {
    chainId: batch.chainId,
    name: batch.meta?.name,
    createdFromSafeAddress: batch.meta?.createdFromSafeAddress,
    transactions: batch.transactions.map((tx, index) => ({ ...encodeTransaction(tx, index), operation: 0 })),
  };
}
