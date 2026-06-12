// Safe deployment: setup encoding, salt derivation, CREATE2 address prediction, and
// deployment transaction building — parity with protocol-kit v6 (pinned by tests/parity.spec.ts).

import { concatHex, encodeAbiParameters, encodeFunctionData, getContractAddress, keccak256, pad, toHex } from "viem";
import type { PublicClient } from "viem";
import type { SafeAccountConfig, SafeDeploymentConfig } from "./types";
import { DEFAULT_SAFE_VERSION } from "./deployments";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// protocol-kit's predetermined salt seed; the chain-specific default salt nonce is
// keccak256 of this hex string ASCII-concatenated with the decimal chain id.
const PREDETERMINED_SALT_NONCE = "0xb1073742015cbcf5a3a4d9d1ae33ecf619439710b89475f92e2abd2117e90f90";

// zkSync-style chains derive CREATE2 addresses differently (EraVM bytecode hashes).
// 324 = zkSync Era, 300 = zkSync Sepolia, 232 = Lens.
export const ZKSYNC_CHAIN_IDS = [324, 300, 232];
const ZKSYNC_CREATE2_PREFIX = "0x2020dba91b30cc0006188af794c2fb30dd8520db7e2c088b7fc7c103c00ca494"; // keccak256("zksyncCreate2")
const ZKSYNC_PROXY_BYTECODE_HASH: Record<string, `0x${string}`> = {
  "1.3.0": "0x0100004124426fb9ebb25e27d670c068e52f9ba631bd383279a188be47e3f86d",
  "1.4.1": "0x0100003b6cfa15bd7d1cae1c9c022074524d7785d34859ad0576d8fab4305d4f",
};

const SAFE_SETUP_ABI = [
  {
    inputs: [
      { name: "_owners", type: "address[]" },
      { name: "_threshold", type: "uint256" },
      { name: "to", type: "address" },
      { name: "data", type: "bytes" },
      { name: "fallbackHandler", type: "address" },
      { name: "paymentToken", type: "address" },
      { name: "payment", type: "uint256" },
      { name: "paymentReceiver", type: "address" },
    ],
    name: "setup",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const PROXY_FACTORY_ABI = [
  {
    inputs: [
      { name: "_singleton", type: "address" },
      { name: "initializer", type: "bytes" },
      { name: "saltNonce", type: "uint256" },
    ],
    name: "createProxyWithNonce",
    outputs: [{ name: "proxy", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "proxyCreationCode",
    outputs: [{ name: "", type: "bytes" }],
    stateMutability: "pure",
    type: "function",
  },
] as const;

/** The Safe.setup(...) initializer calldata embedded in proxy deployment. */
export function encodeSetupCallData(config: SafeAccountConfig, fallbackHandlerAddress: string): `0x${string}` {
  return encodeFunctionData({
    abi: SAFE_SETUP_ABI,
    functionName: "setup",
    args: [
      config.owners as `0x${string}`[],
      BigInt(config.threshold),
      (config.to ?? ZERO_ADDRESS) as `0x${string}`,
      (config.data ?? "0x") as `0x${string}`,
      (config.fallbackHandler ?? fallbackHandlerAddress) as `0x${string}`,
      (config.paymentToken ?? ZERO_ADDRESS) as `0x${string}`,
      BigInt(config.payment ?? 0),
      (config.paymentReceiver ?? ZERO_ADDRESS) as `0x${string}`,
    ],
  });
}

/** Default salt nonce when the user provides none: chain-specific, protocol-kit-compatible. */
export function getChainSpecificDefaultSaltNonce(chainId: number | bigint): string {
  return keccak256(toHex(PREDETERMINED_SALT_NONCE + chainId.toString()));
}

export function resolveSaltNonce(deploymentConfig: SafeDeploymentConfig | undefined, chainId: number | bigint): string {
  return deploymentConfig?.saltNonce || getChainSpecificDefaultSaltNonce(chainId);
}

// proxyCreationCode() results, memoized per chain+factory (one eth_call each).
const proxyCreationCodeCache = new Map<string, `0x${string}`>();

async function getProxyCreationCode(
  client: PublicClient,
  chainId: number | bigint,
  factoryAddress: string,
): Promise<`0x${string}`> {
  const cacheKey = `${chainId}-${factoryAddress.toLowerCase()}`;
  const cached = proxyCreationCodeCache.get(cacheKey);
  if (cached) return cached;
  const code = await client.readContract({
    address: factoryAddress as `0x${string}`,
    abi: PROXY_FACTORY_ABI,
    functionName: "proxyCreationCode",
  });
  proxyCreationCodeCache.set(cacheKey, code);
  return code;
}

export interface PredictSafeAddressParams {
  client: PublicClient;
  chainId: number | bigint;
  factoryAddress: string;
  singletonAddress: string;
  initializer: `0x${string}`;
  saltNonce: string;
  safeVersion?: string;
}

/**
 * Counterfactual Safe address for createProxyWithNonce(singleton, initializer, saltNonce).
 *
 * Standard chains: CREATE2 over the factory's on-chain proxyCreationCode (fetched once
 * per chain). zkSync-style chains: EraVM CREATE2 with the vendored proxy bytecode hash.
 */
export async function predictSafeAddress(params: PredictSafeAddressParams): Promise<`0x${string}`> {
  const { client, chainId, factoryAddress, singletonAddress, initializer, saltNonce } = params;
  const safeVersion = params.safeVersion ?? DEFAULT_SAFE_VERSION;

  const salt = keccak256(
    concatHex([keccak256(initializer), encodeAbiParameters([{ type: "uint256" }], [BigInt(saltNonce)])]),
  );
  const input = encodeAbiParameters([{ type: "address" }], [singletonAddress as `0x${string}`]);

  if (ZKSYNC_CHAIN_IDS.includes(Number(chainId))) {
    const bytecodeHash = ZKSYNC_PROXY_BYTECODE_HASH[safeVersion];
    if (!bytecodeHash) {
      throw new Error(
        `Cannot predict Safe address on zkSync-style chain ${chainId} for Safe version ${safeVersion}; ` +
          `only versions ${Object.keys(ZKSYNC_PROXY_BYTECODE_HASH).join(", ")} are supported.`,
      );
    }
    const hash = keccak256(
      concatHex([
        ZKSYNC_CREATE2_PREFIX,
        pad(factoryAddress as `0x${string}`, { size: 32 }),
        salt,
        bytecodeHash,
        keccak256(input),
      ]),
    );
    return `0x${hash.slice(26)}` as `0x${string}`;
  }

  const proxyCreationCode = await getProxyCreationCode(client, chainId, factoryAddress);
  return getContractAddress({
    opcode: "CREATE2",
    from: factoryAddress as `0x${string}`,
    salt,
    bytecode: concatHex([proxyCreationCode, input]),
  });
}

/** The raw transaction that deploys a Safe proxy via the factory. */
export function buildSafeDeploymentTransaction(
  factoryAddress: string,
  singletonAddress: string,
  initializer: `0x${string}`,
  saltNonce: string,
): { to: string; value: string; data: string } {
  return {
    to: factoryAddress,
    value: "0",
    data: encodeFunctionData({
      abi: PROXY_FACTORY_ABI,
      functionName: "createProxyWithNonce",
      args: [singletonAddress as `0x${string}`, initializer, BigInt(saltNonce)],
    }),
  };
}
