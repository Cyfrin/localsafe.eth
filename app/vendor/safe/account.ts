// SafeAccount — viem-based replacement for protocol-kit's Safe class, covering exactly
// the API surface this app uses. Behavior parity is pinned by tests/parity.spec.ts.

import { createPublicClient, createWalletClient, custom, defineChain, getAddress, http } from "viem";
import type { Account, Chain, PublicClient, Transport, WalletClient } from "viem";

import { DEFAULT_SAFE_VERSION, getDefaultContractAddresses, getKnownChainSafeVersion } from "./deployments";
import {
  buildSafeDeploymentTransaction,
  encodeSetupCallData,
  predictSafeAddress,
  resolveSaltNonce,
} from "./deployment";
import {
  calculateSafeMessageLookupHash,
  calculateSafeTransactionHash,
  safeMessageTypedData,
  safeTxTypedData,
  safeVersionUsesChainId,
} from "./hashing";
import { encodeMultiSendCall } from "./multisend";
import { SafeMessage } from "./message";
import { SafeSignature, adjustVInSignature, generatePreValidatedSignature } from "./signatures";
import { SafeTransaction } from "./transaction";
import { assertDeploymentTrust } from "./trust";
import { OperationType } from "./types";

/** Wallet client with a hoisted account, so sendTransaction/writeContract need no account param. */
export type ConnectedWalletClient = WalletClient<Transport, Chain, Account>;
import type {
  ContractAddresses,
  MetaTransactionInput,
  PredictedSafeConfig,
  SafeAccountInitConfig,
  SafeMessageData,
  SafeTransactionData,
} from "./types";

const SAFE_READ_ABI = [
  {
    inputs: [],
    name: "getOwners",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getThreshold",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "nonce", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "VERSION", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" },
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "isOwner",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const SAFE_EXEC_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "signatures", type: "bytes" },
    ],
    name: "execTransaction",
    outputs: [{ name: "success", type: "bool" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * A connection to one Safe (deployed or counterfactual) on one chain.
 *
 * Construct with {@link SafeAccount.init}. Instances are cheap: state is the resolved
 * chain id, contract addresses, and Safe version — all reads go straight to the RPC.
 */
export class SafeAccount {
  readonly publicClient: PublicClient;
  readonly chainId: number;
  readonly contracts: ContractAddresses;
  readonly safeAddress?: `0x${string}`;
  readonly predictedSafe?: PredictedSafeConfig;

  #walletClient?: ConnectedWalletClient;
  #signerAddress?: `0x${string}`;
  #version: string;
  #confirmedDeployments?: ContractAddresses;

  private constructor(params: {
    publicClient: PublicClient;
    chainId: number;
    contracts: ContractAddresses;
    version: string;
    safeAddress?: `0x${string}`;
    predictedSafe?: PredictedSafeConfig;
    walletClient?: ConnectedWalletClient;
    signerAddress?: `0x${string}`;
    confirmedDeployments?: ContractAddresses;
  }) {
    this.publicClient = params.publicClient;
    this.chainId = params.chainId;
    this.contracts = params.contracts;
    this.#version = params.version;
    this.safeAddress = params.safeAddress;
    this.predictedSafe = params.predictedSafe;
    this.#walletClient = params.walletClient;
    this.#signerAddress = params.signerAddress;
    this.#confirmedDeployments = params.confirmedDeployments;
  }

  static async init(config: SafeAccountInitConfig): Promise<SafeAccount> {
    if (!config.safeAddress && !config.predictedSafe) {
      throw new Error("SafeAccount.init requires either safeAddress or predictedSafe");
    }
    const transport = typeof config.provider === "string" ? http(config.provider) : custom(config.provider);
    const publicClient = createPublicClient({ transport });
    const chainId = await publicClient.getChainId();

    // Synthetic chain object so wallet actions work on chains unknown to viem (e.g. 626)
    const chain: Chain = defineChain({
      id: chainId,
      name: `Chain ${chainId}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: typeof config.provider === "string" ? [config.provider] : [] } },
    });

    const signerAddress = config.signer ? getAddress(config.signer) : undefined;
    const walletClient = signerAddress ? createWalletClient({ account: signerAddress, chain, transport }) : undefined;

    const contracts: ContractAddresses = {
      ...getDefaultContractAddresses(chainId),
      ...config.contractNetworks?.[String(chainId)],
    };

    let version: string;
    if (config.safeAddress) {
      const code = await publicClient.getCode({ address: config.safeAddress });
      if (!code || code === "0x") {
        throw new Error(`Safe ${config.safeAddress} is not deployed on chain ${chainId}`);
      }
      try {
        version = await publicClient.readContract({
          address: config.safeAddress,
          abi: SAFE_READ_ABI,
          functionName: "VERSION",
        });
      } catch {
        // protocol-kit parity: unreadable VERSION falls back to 1.3.0
        version = "1.3.0";
      }
    } else {
      version =
        config.predictedSafe?.safeDeploymentConfig?.safeVersion ??
        getKnownChainSafeVersion(chainId) ??
        DEFAULT_SAFE_VERSION;
    }

    return new SafeAccount({
      publicClient,
      chainId,
      contracts,
      version,
      safeAddress: config.safeAddress,
      predictedSafe: config.predictedSafe,
      walletClient,
      signerAddress,
      confirmedDeployments: config.confirmedDeployments,
    });
  }

  // --- accessors ---

  getSignerAddress(): `0x${string}` | undefined {
    return this.#signerAddress;
  }

  /** The signing/sending client (replaces protocol-kit's getSafeProvider().getExternalSigner()). */
  getWalletClient(): ConnectedWalletClient | undefined {
    return this.#walletClient;
  }

  getContractVersion(): string {
    return this.#version;
  }

  #requireSupportedVersion(): void {
    if (!safeVersionUsesChainId(this.#version)) {
      throw new Error(
        `Safe version ${this.#version} is not supported; this app requires Safe >= 1.3.0. ` +
          `Use the official Safe{Wallet} app to manage this Safe.`,
      );
    }
  }

  #requireWallet(): { walletClient: ConnectedWalletClient; signerAddress: `0x${string}` } {
    if (!this.#walletClient || !this.#signerAddress) {
      throw new Error("No signer connected; connect a wallet first");
    }
    return { walletClient: this.#walletClient, signerAddress: this.#signerAddress };
  }

  async getAddress(): Promise<`0x${string}`> {
    if (this.safeAddress) return this.safeAddress;
    const predicted = this.predictedSafe;
    if (!predicted) throw new Error("SafeAccount has neither safeAddress nor predictedSafe");
    const { factoryAddress, singletonAddress, fallbackHandlerAddress } = this.#deploymentAddresses();
    return predictSafeAddress({
      client: this.publicClient,
      chainId: this.chainId,
      factoryAddress,
      singletonAddress,
      initializer: encodeSetupCallData(predicted.safeAccountConfig, fallbackHandlerAddress),
      saltNonce: resolveSaltNonce(predicted.safeDeploymentConfig, this.chainId),
      safeVersion: this.#version,
    });
  }

  async isSafeDeployed(): Promise<boolean> {
    const address = await this.getAddress();
    const code = await this.publicClient.getCode({ address });
    return !!code && code !== "0x";
  }

  async getOwners(): Promise<string[]> {
    if (this.predictedSafe) return [...this.predictedSafe.safeAccountConfig.owners];
    const owners = await this.publicClient.readContract({
      address: this.safeAddress!,
      abi: SAFE_READ_ABI,
      functionName: "getOwners",
    });
    return [...owners];
  }

  async getThreshold(): Promise<number> {
    if (this.predictedSafe) return this.predictedSafe.safeAccountConfig.threshold;
    const threshold = await this.publicClient.readContract({
      address: this.safeAddress!,
      abi: SAFE_READ_ABI,
      functionName: "getThreshold",
    });
    return Number(threshold);
  }

  async getNonce(): Promise<number> {
    if (this.predictedSafe) return 0;
    const nonce = await this.publicClient.readContract({
      address: this.safeAddress!,
      abi: SAFE_READ_ABI,
      functionName: "nonce",
    });
    return Number(nonce);
  }

  async getBalance(): Promise<bigint> {
    return this.publicClient.getBalance({ address: await this.getAddress() });
  }

  async isOwner(address: string): Promise<boolean> {
    if (this.predictedSafe) {
      return this.predictedSafe.safeAccountConfig.owners.some((owner) => owner.toLowerCase() === address.toLowerCase());
    }
    return this.publicClient.readContract({
      address: this.safeAddress!,
      abi: SAFE_READ_ABI,
      functionName: "isOwner",
      args: [getAddress(address)],
    });
  }

  // --- transactions ---

  /**
   * Build a SafeTransaction. A single input becomes a plain SafeTx; multiple inputs are
   * batched through MultiSendCallOnly (delegatecalls are rejected, matching protocol-kit's
   * onlyCalls default). Gas fields default to "0"; nonce comes from the chain unless given.
   */
  async createTransaction(params: {
    transactions: MetaTransactionInput[];
    options?: { nonce?: number };
  }): Promise<SafeTransaction> {
    this.#requireSupportedVersion();
    const { transactions, options } = params;
    if (transactions.length === 0) {
      throw new Error("Invalid empty array of transactions");
    }

    const normalized = transactions.map((tx) => ({
      to: tx.to,
      value: tx.value || "0",
      data: tx.data || "0x",
      operation: tx.operation ?? OperationType.Call,
    }));

    let base: MetaTransactionInput;
    if (normalized.length === 1) {
      base = normalized[0];
    } else {
      if (normalized.some((tx) => tx.operation === OperationType.DelegateCall)) {
        throw new Error("At least one transaction uses DELEGATECALL; batches may only contain CALL operations");
      }
      const multiSendCallOnlyAddress = this.contracts.multiSendCallOnlyAddress;
      if (!multiSendCallOnlyAddress) {
        throw new Error(`No MultiSendCallOnly address configured for chain ${this.chainId}`);
      }
      // Batches DELEGATECALL into MultiSendCallOnly — refuse unknown or codeless targets
      await assertDeploymentTrust({
        client: this.publicClient,
        chainId: this.chainId,
        contracts: this.contracts,
        fields: ["multiSendCallOnlyAddress"],
        confirmed: this.#confirmedDeployments,
      });
      base = {
        to: multiSendCallOnlyAddress,
        value: "0",
        data: encodeMultiSendCall(normalized),
        operation: OperationType.DelegateCall,
      };
    }

    const nonce = options?.nonce ?? (await this.getNonce());
    const data: SafeTransactionData = {
      to: base.to,
      value: base.value,
      data: base.data,
      operation: base.operation ?? OperationType.Call,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: ZERO_ADDRESS,
      refundReceiver: ZERO_ADDRESS,
      nonce: Number(nonce),
    };
    return new SafeTransaction(data);
  }

  async getTransactionHash(safeTx: SafeTransaction): Promise<string> {
    return calculateSafeTransactionHash(await this.getAddress(), safeTx.data, this.#version, this.chainId);
  }

  /** Sign via eth_signTypedData_v4 and return a new SafeTransaction carrying all signatures. */
  async signTransaction(safeTx: SafeTransaction): Promise<SafeTransaction> {
    this.#requireSupportedVersion();
    const { walletClient, signerAddress } = this.#requireWallet();
    if (!(await this.isOwner(signerAddress))) {
      throw new Error("Transactions can only be signed by Safe owners");
    }
    const typedData = safeTxTypedData(await this.getAddress(), safeTx.data, this.#version, this.chainId);
    const signature = await walletClient.signTypedData({
      account: signerAddress,
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    });

    const signedTx = new SafeTransaction({ ...safeTx.data });
    safeTx.signatures.forEach((sig) => signedTx.addSignature(sig));
    signedTx.addSignature(new SafeSignature(signerAddress, adjustVInSignature(signature)));
    return signedTx;
  }

  /**
   * Augment with a pre-validated signature when the connected OWNER executes a tx that is
   * one signature short (the owner approves implicitly as msg.sender).
   */
  async #withExecutableSignatures(safeTx: SafeTransaction, threshold: number): Promise<SafeTransaction> {
    const augmented = new SafeTransaction({ ...safeTx.data });
    safeTx.signatures.forEach((sig) => augmented.addSignature(sig));
    const signer = this.#signerAddress;
    if (
      signer &&
      augmented.signatures.size < threshold &&
      !augmented.signatures.has(signer.toLowerCase()) &&
      (await this.isOwner(signer))
    ) {
      augmented.addSignature(generatePreValidatedSignature(signer));
    }
    return augmented;
  }

  #execTransactionArgs(safeTx: SafeTransaction) {
    return [
      safeTx.data.to as `0x${string}`,
      BigInt(safeTx.data.value),
      safeTx.data.data as `0x${string}`,
      safeTx.data.operation,
      BigInt(safeTx.data.safeTxGas),
      BigInt(safeTx.data.baseGas),
      BigInt(safeTx.data.gasPrice),
      safeTx.data.gasToken as `0x${string}`,
      safeTx.data.refundReceiver as `0x${string}`,
      safeTx.encodedSignatures() as `0x${string}`,
    ] as const;
  }

  /** Simulate execTransaction via eth_call; false on any revert (missing sigs included). */
  async isValidTransaction(safeTx: SafeTransaction): Promise<boolean> {
    if (!this.safeAddress) return false;
    try {
      const threshold = await this.getThreshold();
      const augmented = await this.#withExecutableSignatures(safeTx, threshold);
      if (augmented.signatures.size < threshold) return false;
      const { result } = await this.publicClient.simulateContract({
        address: this.safeAddress,
        abi: SAFE_EXEC_ABI,
        functionName: "execTransaction",
        args: this.#execTransactionArgs(augmented),
        account: this.#signerAddress,
      });
      return result;
    } catch {
      return false;
    }
  }

  /** Broadcast execTransaction. Returns the L1 transaction hash. */
  async executeTransaction(safeTx: SafeTransaction): Promise<{ hash: `0x${string}` }> {
    this.#requireSupportedVersion();
    if (!this.safeAddress) {
      throw new Error("Safe is not deployed");
    }
    const { walletClient, signerAddress } = this.#requireWallet();

    const threshold = await this.getThreshold();
    const augmented = await this.#withExecutableSignatures(safeTx, threshold);
    if (threshold > augmented.signatures.size) {
      const missing = threshold - augmented.signatures.size;
      throw new Error(`There ${missing > 1 ? `are ${missing} signatures` : `is ${missing} signature`} missing`);
    }

    if (BigInt(safeTx.data.value) > BigInt(0)) {
      const balance = await this.getBalance();
      if (BigInt(safeTx.data.value) > balance) {
        throw new Error("Not enough Ether funds");
      }
    }

    const args = this.#execTransactionArgs(augmented);
    const gas = await this.publicClient.estimateContractGas({
      address: this.safeAddress,
      abi: SAFE_EXEC_ABI,
      functionName: "execTransaction",
      args,
      account: signerAddress,
    });
    const hash = await walletClient.writeContract({
      address: this.safeAddress,
      abi: SAFE_EXEC_ABI,
      functionName: "execTransaction",
      args,
      account: signerAddress,
      chain: walletClient.chain,
      gas,
    });
    return { hash };
  }

  // --- messages ---

  createMessage(message: SafeMessageData): SafeMessage {
    return new SafeMessage(message);
  }

  /**
   * The message identity hash used for storage keys, routes, and share links.
   * See calculateSafeMessageLookupHash for the protocol-kit compatibility quirk.
   */
  async getSafeMessageHash(message: SafeMessageData): Promise<string> {
    return calculateSafeMessageLookupHash(await this.getAddress(), message, this.#version, this.chainId);
  }

  /** Sign the canonical SafeMessage typed data; returns a new SafeMessage with all signatures. */
  async signMessage(safeMessage: SafeMessage): Promise<SafeMessage> {
    this.#requireSupportedVersion();
    const { walletClient, signerAddress } = this.#requireWallet();
    if (!(await this.isOwner(signerAddress))) {
      throw new Error("Messages can only be signed by Safe owners");
    }
    const typedData = safeMessageTypedData(await this.getAddress(), safeMessage.data, this.#version, this.chainId);
    const signature = await walletClient.signTypedData({
      account: signerAddress,
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    });

    const signedMessage = new SafeMessage(safeMessage.data);
    safeMessage.signatures.forEach((sig) => signedMessage.addSignature(sig));
    signedMessage.addSignature(new SafeSignature(signerAddress, adjustVInSignature(signature)));
    return signedMessage;
  }

  // --- deployment ---

  #deploymentAddresses(): { factoryAddress: string; singletonAddress: string; fallbackHandlerAddress: string } {
    const { safeProxyFactoryAddress, safeSingletonAddress, fallbackHandlerAddress } = this.contracts;
    if (!safeProxyFactoryAddress || !safeSingletonAddress || !fallbackHandlerAddress) {
      throw new Error(`Safe deployment contracts are not configured for chain ${this.chainId}`);
    }
    return {
      factoryAddress: safeProxyFactoryAddress,
      singletonAddress: safeSingletonAddress,
      fallbackHandlerAddress,
    };
  }

  /** The factory transaction that deploys this counterfactual Safe. */
  async createSafeDeploymentTransaction(): Promise<{ to: string; value: string; data: string }> {
    const predicted = this.predictedSafe;
    if (!predicted) {
      throw new Error("createSafeDeploymentTransaction requires a predictedSafe configuration");
    }
    const { owners, threshold } = predicted.safeAccountConfig;
    if (owners.length === 0) throw new Error("Owner list must have at least one owner");
    if (threshold < 1 || threshold > owners.length) {
      throw new Error("Threshold must be between 1 and the number of owners");
    }
    // The factory deploys it, the singleton owns the logic, the fallback handler extends
    // it — refuse unknown or codeless contracts for any of them
    await assertDeploymentTrust({
      client: this.publicClient,
      chainId: this.chainId,
      contracts: this.contracts,
      fields: ["safeProxyFactoryAddress", "safeSingletonAddress", "fallbackHandlerAddress"],
      confirmed: this.#confirmedDeployments,
    });
    if (await this.isSafeDeployed()) {
      throw new Error("Safe already deployed");
    }
    const { factoryAddress, singletonAddress, fallbackHandlerAddress } = this.#deploymentAddresses();
    return buildSafeDeploymentTransaction(
      factoryAddress,
      singletonAddress,
      encodeSetupCallData(predicted.safeAccountConfig, fallbackHandlerAddress),
      resolveSaltNonce(predicted.safeDeploymentConfig, this.chainId),
    );
  }
}
