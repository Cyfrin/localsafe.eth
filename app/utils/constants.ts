import { SafeDeployStep } from "./types";

// Simple random name generator (adjective + noun)
export const ADJECTIVES = [
  "Gracious",
  "Euphoric",
  "Pleasant",
  "Devoted",
  "Radiant",
  "Bold",
  "Serene",
  "Vivid",
  "Majestic",
  "Lively",
];
export const NOUNS = [
  "Safe",
  "Vault",
  "Account",
  "Multisig",
  "Guardian",
  "Fortress",
  "Sanctum",
  "Citadel",
  "Stronghold",
  "Keep",
];

// Steps for handling a Safe deployments
export const CREATE_STEPS = ["Networks", "Signers & Threshold", "Validate"];

export const STEPS_DEPLOY_LABEL = {
  txCreated: "Tx Created",
  txSent: "Tx Sent",
  confirmed: "Confirmed",
  deployed: "Deployed",
};

export const STEPS_CONNECT_LABEL = {
  pending: "Pending",
  connecting: "Connecting",
  connected: "Connected",
};

export const DEFAULT_DEPLOY_STEPS: SafeDeployStep[] = [
  { step: "txCreated", status: "idle" },
  { step: "txSent", status: "idle" },
  { step: "confirmed", status: "idle" },
  { step: "deployed", status: "idle" },
];

export const DEFAULT_SAFE_WALLET_DATA = {
  version: "3.0", // current version?
  data: {
    addressBook: {},
    addedSafes: {},
    undeployedSafes: {},
    visitedSafes: {},
  },
};

// LocalStorage keys
export const WAGMI_CONFIG_NETWORKS_KEY = "MSIG_wagmiConfigNetworks";
export const SAFE_TX_STORAGE_KEY = "MSIGUI_safeCurrentTxMap";
export const SAFE_WALLET_DATA_KEY = "MSIGUI_safeWalletData";

// Network form defaults
export const NETWORK_FORM_DEFAULTS = {
  name: "",
  id: "",
  rpcUrl: "",
  blockExplorerUrl: "",
  blockExplorerName: "",
  safeProxyFactoryAddress: "",
  safeSingletonAddress: "",
  fallbackHandlerAddress: "",
  multiSendAddress: "",
  multiSendCallOnlyAddress: "",
  signMessageLibAddress: "",
  createCallAddress: "",
  simulateTxAccessorAddress: "",
  tokenCallbackHandlerAddress: "",
  nativeCurrency: { name: "", symbol: "", decimals: 18 },
};
