import { encodeFunctionData, Abi } from "viem";
import { AbiFunctionItem } from "./types";

/**
 * Result of encoding calldata from ABI
 */
export type EncodeCalldataResult = { success: true; data: string } | { success: false; error: string };

/**
 * Helper to generate a function signature string
 * Format: functionName(paramType1,paramType2,...) or functionName() for no params
 *
 * @param item ABI function item
 * @returns Function signature string
 */
export function getFunctionSignature(item: AbiFunctionItem): string {
  if (item.type !== "function") return item.name;
  const paramTypes = item.inputs?.map((input) => input.type).join(",") || "";
  return `${item.name}(${paramTypes})`;
}

/**
 * Encodes function call data from ABI and input values
 *
 * @param abiJson - ABI JSON string
 * @param methodSignature - Function signature to encode (e.g., "transfer(address, uint256)" or "mint()")
 * @param inputValues - Input values mapped by parameter name
 * @returns Encoded calldata or error message
 *
 * @example
 * ```ts
 * const result = encodeCalldataFromAbi(
 *   '[{"type":"function","name":"transfer","inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}]}]',
 *   'transfer(address, uint256)',
 *   { to: '0x123...', amount: '1000' }
 * );
 * if (result.success) {
 *   console.log(result.data); // "0xa9059cbb..."
 * }
 * ```
 */
export function encodeCalldataFromAbi(
  abiJson: string,
  methodSignature: string,
  inputValues: Record<string, string>,
): EncodeCalldataResult {
  try {
    // Parse ABI
    const abi: AbiFunctionItem[] = JSON.parse(abiJson);

    // Find the method in ABI by signature (handles function overrides)
    const method = abi.find((item) => item.type === "function" && getFunctionSignature(item) === methodSignature);

    if (!method) {
      return { success: false, error: `Method "${methodSignature}" not found in ABI` };
    }

    // Build args array in the correct order matching ABI inputs
    const inputs = method.inputs ?? [];
    const args: unknown[] = [];
    for (const input of inputs) {
      const value = inputValues[input.name];

      // Check for missing required values
      if (value === undefined || value === "") {
        return {
          success: false,
          error: `Missing value for parameter: ${input.name} (${input.type})`,
        };
      }

      args.push(value);
    }

    // Encode using viem with the specific method's ABI
    const encoded = encodeFunctionData({
      abi: [method] as Abi,
      functionName: method.name,
      args,
    });

    return { success: true, data: encoded };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { success: false, error: "Invalid ABI JSON format" };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to encode calldata",
    };
  }
}
