// MultiSend batch encoding — byte-compatible with protocol-kit's encodeMultiSendData.

import { encodeFunctionData, encodePacked, size } from "viem";
import { OperationType } from "./types";
import type { MetaTransactionInput } from "./types";

export const MULTI_SEND_ABI = [
  {
    inputs: [{ internalType: "bytes", name: "transactions", type: "bytes" }],
    name: "multiSend",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

/**
 * Pack transactions for MultiSend: per tx
 * `uint8 operation ++ address to ++ uint256 value ++ uint256 dataLength ++ bytes data`,
 * concatenated without separators.
 */
export function encodeMultiSendData(transactions: MetaTransactionInput[]): `0x${string}` {
  let packed = "0x";
  for (const tx of transactions) {
    const data = (tx.data || "0x") as `0x${string}`;
    packed += encodePacked(
      ["uint8", "address", "uint256", "uint256", "bytes"],
      [tx.operation ?? OperationType.Call, tx.to as `0x${string}`, BigInt(tx.value || "0"), BigInt(size(data)), data],
    ).slice(2);
  }
  return packed as `0x${string}`;
}

/** Calldata for MultiSend.multiSend(transactions). */
export function encodeMultiSendCall(transactions: MetaTransactionInput[]): `0x${string}` {
  return encodeFunctionData({
    abi: MULTI_SEND_ABI,
    functionName: "multiSend",
    args: [encodeMultiSendData(transactions)],
  });
}
