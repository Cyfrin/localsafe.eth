// Types for SafeProvider helpers
import { EthSafeTransaction } from "@safe-global/protocol-kit";
import { ContractNetworks } from "./contractNetworks";
import { Chain, ChainContract } from "viem";

// Step status type
type SafeStep = {
  status: "idle" | "running" | "success" | "error";
  error?: string;
};

export type SafeConnectStep = {
  step: "pending" | "connecting" | "connected";
} & SafeStep;

export type SafeDeployStep = {
  step: "txCreated" | "txSent" | "confirmed" | "deployed";
  txHash?: string;
} & SafeStep;

// Minimal EIP-1193 Provider type
export type MinimalEIP1193Provider = {
  request: (args: unknown) => Promise<unknown>;
  on?: (...args: unknown[]) => void;
  removeListener?: (...args: unknown[]) => void;
};

// SafeConfig union type
export type SafeConfigPrediction = {
  provider: MinimalEIP1193Provider | string;
  signer: string | undefined;
  predictedSafe: {
    safeAccountConfig: { owners: `0x${string}`[]; threshold: number };
    safeDeploymentConfig?: { saltNonce: string };
  };
  contractNetworks?: ContractNetworks;
};

export type SafeConfigConnection = {
  provider: MinimalEIP1193Provider;
  signer: string | undefined;
  safeAddress: `0x${string}`;
  contractNetworks?: ContractNetworks;
};

export type SafeConfig = SafeConfigPrediction | SafeConfigConnection;

// --- SafeWallet Counterfactual Types ---
// safe-global/safe-wallet-monorepo/packages/store/src/gateway/types.ts
export enum PayMethod {
  PayNow = "PayNow",
  PayLater = "PayLater",
}

export enum PendingSafeStatus {
  AWAITING_EXECUTION = "AWAITING_EXECUTION",
  PROCESSING = "PROCESSING",
  RELAYING = "RELAYING",
}

export type UndeployedSafeStatus = {
  status: PendingSafeStatus;
  type: PayMethod;
  txHash?: string;
  taskId?: string;
  startBlock?: number;
  submittedAt?: number;
  signerAddress?: string;
  signerNonce?: number | null;
};

export type ReplayedSafeProps = {
  factoryAddress: string;
  masterCopy: string;
  safeAccountConfig: {
    threshold: number;
    owners: `0x${string}`[];
    fallbackHandler?: string;
    to?: string;
    data?: string;
    paymentToken?: string;
    payment?: number;
    paymentReceiver?: string;
  };
  saltNonce: string;
  safeVersion: string;
};

export type UndeployedSafe = {
  status: UndeployedSafeStatus;
  props: ReplayedSafeProps;
};

// SafeWalletData structure for localStorage
export interface SafeWalletData {
  version: string;
  data: {
    addressBook: {
      [chainId: string]: {
        [safeAddress: string]: string;
      };
    };
    addedSafes: {
      [chainId: string]: {
        [safeAddress: string]: {
          owners: string[];
          threshold: number;
        };
      };
    };
    undeployedSafes: {
      [chainId: string]: {
        [safeAddress: string]: UndeployedSafe;
      };
    };
    visitedSafes?: {
      [chainId: string]: { [safeAddress: string]: { lastVisited: number } };
    };
    safeConfig?: {
      [chainId: string]: {
        [safeAddress: string]: {
          multiSendAddress?: string;
          multiSendCallOnlyAddress?: string;
        };
      };
    };
  };
}

export type AbiFunctionItem = {
  type: string;
  name: string;
  inputs?: { name: string; type: string }[];
  stateMutability?: "pure" | "view" | "nonpayable" | "payable";
};

// Preview type for import
export type ImportTxPreview = EthSafeTransaction | { error: string } | null;

// DeploymentModal props
export interface DeploymentModalProps {
  open: boolean;
  steps: Array<{ step: string; status: string }>;
  stepLabels: Record<string, string>;
  txHash?: string | null;
  error?: string | null;
  selectedNetwork?: Chain;
  onClose: () => void;
  closeLabel?: string;
  onSuccess?: () => void;
  successLabel?: string;
}

// Custom Chain Input type
export interface CustomChainInput {
  id: number;
  name: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrl: string;
  blockExplorerUrl?: string;
  blockExplorerName?: string;
  contracts?: Record<string, ChainContract>;
}

// Detected Chain Result type
export type DetectedChainResult = {
  chain: Chain;
  isCustom: boolean;
};

// Form state for custom network modal
export interface NetworkFormState {
  rpcUrl: string;
  name: string;
  id: string | number;
  blockExplorerUrl?: string;
  blockExplorerName?: string;
  // Safe contract addresses (optional overrides)
  safeProxyFactoryAddress?: string;
  safeSingletonAddress?: string;
  fallbackHandlerAddress?: string;
  multiSendAddress?: string;
  multiSendCallOnlyAddress?: string;
  signMessageLibAddress?: string;
  createCallAddress?: string;
  simulateTxAccessorAddress?: string;
  tokenCallbackHandlerAddress?: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

// Default form state for custom network modal
export type FormAction =
  | { type: "update"; key: keyof NetworkFormState; value: string | number }
  | {
      type: "updateCurrency";
      currencyKey: keyof NetworkFormState["nativeCurrency"];
      currencyValue: string | number;
    }
  | { type: "reset" };
