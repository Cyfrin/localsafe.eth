// Deployment trust verification for dangerous operations.
//
// Reading and signing against a deployed Safe only ever touch the Safe's own address.
// The moments a wrong infrastructure address can compromise a Safe are:
//   - batching (MultiSend/MultiSendCallOnly receive a DELEGATECALL from the Safe)
//   - Safe creation (factory/singleton/fallback handler decide what owns the funds)
// Before those operations run, every contract involved must be one of:
//   - a known deployment by address (official registry or a registered chain suite), or
//   - bytecode-verified (on-chain code hashes to an official Safe build), or
//   - explicitly confirmed by the user for this chain.
// In every case the contract must actually have code: a DELEGATECALL to an empty
// address "succeeds" silently, so a missing MultiSend must hard-fail.

import { keccak256 } from "viem";
import type { PublicClient } from "viem";
import { isOfficialDeployment } from "./deployments";
import type { ContractAddresses } from "./types";

// keccak256(eth_getCode(...)) of official Safe builds per configurable field, across
// v1.3.0/v1.4.1/v1.5.0 canonical/eip155/zksync variants. eip155 variants share the
// canonical bytecode unless listed. Source: safe-deployments assets, fetched 2026-06-12;
// convention validated against mainnet (keccak256 of live canonical v1.4.1 Safe code).
const OFFICIAL_CODE_HASHES: Partial<Record<keyof ContractAddresses, string[]>> = {
  safeSingletonAddress: [
    // Safe (L1)
    "0xbba688fbdb21ad2bb58bc320638b43d94e7d100f6f3ebaab0a4e4de6304b1c2e", // 1.3.0
    "0x551b7fdfd2dbcec4f785059e1ef6e0b40ca2e44d792158c4e825bc0b092f15e9", // 1.3.0 zksync
    "0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4", // 1.4.1
    "0xfa4d4fc0fa9f1a061571a3f3f66502464edf1a519ab1ab93dc232addf4fbe30f", // 1.4.1 zksync
    "0xdda019cbd7c867a533a2a86e5c53434fdc50b13122b5a5ddb4a8df61b31c20f2", // 1.5.0
    // SafeL2
    "0x21842597390c4c6e3c1239e434a682b054bd9548eee5e9b1d6a4482731023c0f", // 1.3.0
    "0xe2ca068330339d608367d83a0b25545efe39e619098597699ab8ff828cb1ddd8", // 1.3.0 zksync
    "0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff", // 1.4.1
    "0x520462ebe1156cd2d37b1d470c57f23e12fe0c4cda4c62502d96e03fa0cb44da", // 1.4.1 zksync
    "0x180193227186ccb85316c94db1f0d156ed932b14712cfaac78901899178572dc", // 1.5.0
  ],
  safeProxyFactoryAddress: [
    "0x337d7f54be11b6ed55fef7b667ea5488db53db8320a05d1146aa4bd169a39a9b", // 1.3.0
    "0x55daa5d390d283edbc5fa835bd53befce45179c758feaac8c149a95850d0a6b6", // 1.3.0 zksync
    "0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317", // 1.4.1
    "0xa4915e4a50124b5dce3c9adc34cce8108fc5dbda97d443534699621d6e0013ba", // 1.4.1 zksync
    "0x967dae4cda22b0c9ef7f31b010bdc1ceb0af9904b0c3dc060b5302e4c18a4529", // 1.5.0
  ],
  fallbackHandlerAddress: [
    // CompatibilityFallbackHandler
    "0x03e69f7ce809e81687c69b19a7d7cca45b6d551ffdec73d9bb87178476de1abf", // 1.3.0
    "0x017e9a83d5513f503fb85274f4d1ad1811040d7caa31772750ffb08638c28fbb", // 1.3.0 zksync
    "0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9", // 1.4.1
    "0x331ff834e83e6e1596325f04eb7d16614155e324010af21f14e9c945e7669d5f", // 1.4.1 zksync
    "0x3c6a85bcf7b563daa624b884b4e9a1b9fa5371edde7be945d998071a48f28bbc", // 1.5.0
    // ExtensibleFallbackHandler
    "0xba5bafdfba82e226b6dc8ae29bedf5026bd854ab4bee00128ca322717a5f2acf", // 1.5.0
  ],
  multiSendAddress: [
    "0x0208282bd262360d0320862c5ac70f375f5ed3b9d89a83a615b4d398415bdc83", // 1.3.0
    "0x81db0e4afdf5178583537b58c5ad403bd47a4ac7f9bde2442ef3e341d433126a", // 1.3.0 eip155
    "0xd9aa004a59b3738a108e747e578ae409b84e9f3ffd689d81b10f4d96000c5f5c", // 1.3.0 zksync
    "0x0e4f7fc66550a322d1e7688e181b75e217e662a4f3f4d6a29b22bc61217c4b77", // 1.4.1
    "0xcb372f27aba6983e7b54997ebb4a75c35876b2a279238ab914c5415de1e95137", // 1.4.1 zksync
    "0xca1147a12963172a93910c5cb2bfa5ad0e941c7f03fc7eb017dd06a8ea4e5604", // 1.5.0
  ],
  multiSendCallOnlyAddress: [
    "0xa9865ac2d9c7a1591619b188c4d88167b50df6cc0c5327fcbd1c8c75f7c066ad", // 1.3.0
    "0x064ddbf252714bcd4cb79f679e8c12df96d998ce07bbb13b3118c1dbf4a31942", // 1.3.0 zksync
    "0xecd5bd14a08c5d2122379900b2f272bdf107a7e92423c10dd5fe3254386c9939", // 1.4.1
    "0x44c70b30fed5c3a07358a52c2fb028f651031010ef99e4d8c3b45c208e88a264", // 1.4.1 zksync
    "0xcdbdcec38d2f1c7d961b0029ff8416b7e86e9974d6f0e9c9580c7d17fcfb6663", // 1.5.0
  ],
};

export type DeploymentTrustStatus =
  | "trusted" // known deployment by address (registry or registered chain suite)
  | "verified-bytecode" // on-chain code hashes to an official Safe build
  | "user-confirmed" // explicitly confirmed by the user for this chain
  | "no-code" // nothing deployed at the address
  | "unverified"; // has code, but nothing vouches for it

export interface DeploymentTrustResult {
  field: keyof ContractAddresses;
  address: string;
  status: DeploymentTrustStatus;
}

export class SafeDeploymentTrustError extends Error {
  readonly issues: DeploymentTrustResult[];

  constructor(chainId: number | string, issues: DeploymentTrustResult[]) {
    const detail = issues
      .map((issue) =>
        issue.status === "no-code"
          ? `${issue.field.replace(/Address$/, "")} has no code at ${issue.address}`
          : `${issue.field.replace(/Address$/, "")} at ${issue.address} is not a verified Safe deployment`,
      )
      .join("; ");
    super(
      `Unverified Safe deployments on chain ${chainId}: ${detail}. ` +
        `Review and trust this chain's deployments from the Safe dashboard before continuing.`,
    );
    this.name = "SafeDeploymentTrustError";
    this.issues = issues;
  }
}

// eth_getCode results, memoized per chain+address (code is immutable for our purposes)
const codeHashCache = new Map<string, `0x${string}` | "none">();

async function getCodeHash(
  client: PublicClient,
  chainId: number | string,
  address: string,
): Promise<`0x${string}` | "none"> {
  const cacheKey = `${chainId}:${address.toLowerCase()}`;
  const cached = codeHashCache.get(cacheKey);
  if (cached) return cached;
  const code = await client.getCode({ address: address as `0x${string}` });
  const result = !code || code === "0x" ? "none" : keccak256(code);
  codeHashCache.set(cacheKey, result);
  return result;
}

export interface VerifyDeploymentsParams {
  client: PublicClient;
  chainId: number | string;
  contracts: ContractAddresses;
  fields: Array<keyof ContractAddresses>;
  /** User-confirmed deployment set for this chain (from wallet data). */
  confirmed?: ContractAddresses;
}

/** Trust status for each requested field. Fields without a configured address are skipped. */
export async function verifyDeployments(params: VerifyDeploymentsParams): Promise<DeploymentTrustResult[]> {
  const { client, chainId, contracts, fields, confirmed } = params;
  const results: DeploymentTrustResult[] = [];
  for (const field of fields) {
    const address = contracts[field];
    if (!address) continue;

    const codeHash = await getCodeHash(client, chainId, address);
    if (codeHash === "none") {
      results.push({ field, address, status: "no-code" });
      continue;
    }
    if (isOfficialDeployment(field, address, chainId)) {
      results.push({ field, address, status: "trusted" });
      continue;
    }
    if (OFFICIAL_CODE_HASHES[field]?.includes(codeHash)) {
      results.push({ field, address, status: "verified-bytecode" });
      continue;
    }
    if (confirmed?.[field]?.toLowerCase() === address.toLowerCase()) {
      results.push({ field, address, status: "user-confirmed" });
      continue;
    }
    results.push({ field, address, status: "unverified" });
  }
  return results;
}

/** Throw SafeDeploymentTrustError unless every requested contract is trustworthy. */
export async function assertDeploymentTrust(params: VerifyDeploymentsParams): Promise<void> {
  const results = await verifyDeployments(params);
  const issues = results.filter((result) => result.status === "no-code" || result.status === "unverified");
  if (issues.length > 0) {
    throw new SafeDeploymentTrustError(params.chainId, issues);
  }
}
