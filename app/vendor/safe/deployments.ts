// Vendored Safe deployment registry — local replacement for @safe-global/safe-deployments.
//
// Safe contracts are deployed deterministically, so the canonical addresses below are
// identical on every standard EVM chain (including local anvil forks of the deployment
// and brand-new chains, once the contracts are deployed there). Chains that diverge
// (alternate deployers or zkSync-style CREATE2) use the eip155/zksync variants, which we
// keep for trust verification only.
//
// Source: @safe-global/safe-deployments assets (v1.3.0, v1.4.1 extracted 2026-06-11 from
// package v1.37.44; v1.5.0 extracted 2026-06-12 from the safe-deployments repo).

import type { ContractAddresses } from "./types";

export const DEFAULT_SAFE_VERSION = "1.4.1";

type DeploymentVariants = {
  canonical: string;
  eip155?: string;
  zksync?: string;
};

type VersionDeployments = {
  safeSingleton: DeploymentVariants;
  safeL2Singleton: DeploymentVariants;
  safeProxyFactory: DeploymentVariants;
  fallbackHandler: DeploymentVariants;
  multiSend: DeploymentVariants;
  multiSendCallOnly: DeploymentVariants;
  signMessageLib: DeploymentVariants;
  createCall: DeploymentVariants;
  simulateTxAccessor: DeploymentVariants;
  tokenCallbackHandler?: DeploymentVariants;
  extensibleFallbackHandler?: DeploymentVariants;
};

export const SAFE_DEPLOYMENTS: Record<string, VersionDeployments> = {
  "1.5.0": {
    safeSingleton: { canonical: "0xFf51A5898e281Db6DfC7855790607438dF2ca44b" },
    safeL2Singleton: { canonical: "0xEdd160fEBBD92E350D4D398fb636302fccd67C7e" },
    safeProxyFactory: { canonical: "0x14F2982D601c9458F93bd70B218933A6f8165e7b" },
    fallbackHandler: { canonical: "0x3EfCBb83A4A7AfcB4F68D501E2c2203a38be77f4" },
    multiSend: { canonical: "0x218543288004CD07832472D464648173c77D7eB7" },
    multiSendCallOnly: { canonical: "0xA83c336B20401Af773B6219BA5027174338D1836" },
    signMessageLib: { canonical: "0x4FfeF8222648872B3dE295Ba1e49110E61f5b5aa" },
    createCall: { canonical: "0x2Ef5ECfbea521449E4De05EDB1ce63B75eDA90B4" },
    simulateTxAccessor: { canonical: "0x07EfA797c55B5DdE3698d876b277aBb6B893654C" },
    tokenCallbackHandler: { canonical: "0x54e86d004d71a8D2112ec75FaCE57D730b0433F3" },
    extensibleFallbackHandler: { canonical: "0x85a8ca358D388530ad0fB95D0cb89Dd44Fc242c3" },
  },
  "1.4.1": {
    safeSingleton: {
      canonical: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
      zksync: "0xC35F063962328aC65cED5D4c3fC5dEf8dec68dFa",
    },
    safeL2Singleton: {
      canonical: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
      zksync: "0x610fcA2e0279Fa1F8C00c8c2F71dF522AD469380",
    },
    safeProxyFactory: {
      canonical: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
      zksync: "0xc329D02fd8CB2fc13aa919005aF46320794a8629",
    },
    fallbackHandler: {
      canonical: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
      zksync: "0x9301E98DD367135f21bdF66f342A249c9D5F9069",
    },
    multiSend: {
      canonical: "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526",
      zksync: "0x309D0B190FeCCa8e1D5D8309a16F7e3CB133E885",
    },
    multiSendCallOnly: {
      canonical: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
      zksync: "0x0408EF011960d02349d50286D20531229BCef773",
    },
    signMessageLib: {
      canonical: "0xd53cd0aB83D845Ac265BE939c57F53AD838012c9",
      zksync: "0xAca1ec0a1A575CDCCF1DC3d5d296202Eb6061888",
    },
    createCall: {
      canonical: "0x9b35Af71d77eaf8d7e40252370304687390A1A52",
      zksync: "0xAAA566Fe7978bB0fb0B5362B7ba23038f4428D8f",
    },
    simulateTxAccessor: {
      canonical: "0x3d4BA2E0884aa488718476ca2FB8Efc291A46199",
      zksync: "0xdd35026932273768A3e31F4efF7313B5B7A7199d",
    },
    tokenCallbackHandler: { canonical: "0xeDCF620325E82e3B9836eaaeFdc4283E99Dd7562" },
  },
  "1.3.0": {
    safeSingleton: {
      canonical: "0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552",
      eip155: "0x69f4D1788e39c87893C980c06EdF4b7f686e2938",
      zksync: "0xB00ce5CCcdEf57e539ddcEd01DF43a13855d9910",
    },
    safeL2Singleton: {
      canonical: "0x3E5c63644E683549055b9Be8653de26E0B4CD36E",
      eip155: "0xfb1bffC9d739B8D520DaF37dF666da4C687191EA",
      zksync: "0x1727c2c531cf966f902E5927b98490fDFb3b2b70",
    },
    safeProxyFactory: {
      canonical: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
      eip155: "0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC",
      zksync: "0xDAec33641865E4651fB43181C6DB6f7232Ee91c2",
    },
    fallbackHandler: {
      canonical: "0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4",
      eip155: "0x017062a1dE2FE6b99BE3d9d37841FeD19F573804",
      zksync: "0x2f870a80647BbC554F3a0EBD093f11B4d2a7492A",
    },
    multiSend: {
      canonical: "0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761",
      eip155: "0x998739BFdAAdde7C933B942a68053933098f9EDa",
      zksync: "0x0dFcccB95225ffB03c6FBB2559B530C2B7C8A912",
    },
    multiSendCallOnly: {
      canonical: "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D",
      eip155: "0xA1dabEF33b3B82c7814B6D82A79e50F4AC44102B",
      zksync: "0xf220D3b4DFb23C4ade8C88E526C1353AbAcbC38F",
    },
    signMessageLib: {
      canonical: "0xA65387F16B013cf2Af4605Ad8aA5ec25a2cbA3a2",
      eip155: "0x98FFBBF51bb33A056B08ddf711f289936AafF717",
      zksync: "0x357147caf9C0cCa67DfA0CF5369318d8193c8407",
    },
    createCall: {
      canonical: "0x7cbB62EaA69F79e6873cD1ecB2392971036cFAa4",
      eip155: "0xB19D6FFc2182150F8Eb585b79D4ABcd7C5640A9d",
      zksync: "0xcB8e5E438c5c2b45FbE17B02Ca9aF91509a8ad56",
    },
    simulateTxAccessor: {
      canonical: "0x59AD6735bCd8152B84860Cb256dD9e96b85F69Da",
      eip155: "0x727a77a074D1E6c4530e814F89E618a3298FC044",
      zksync: "0x4191E2e12E8BC5002424CE0c51f9947b02675a44",
    },
  },
};

type KnownChainDeployment = {
  safeVersion: string;
  /** Default contract set for this chain (replaces the canonical defaults). */
  addresses: ContractAddresses;
  /** Additional addresses trusted for specific fields (alternates like SafeL2). */
  alsoTrusted: Partial<Record<keyof ContractAddresses, string[]>>;
};

/**
 * Chains where the official deterministic deployments do not exist, but a known Safe
 * suite has been deployed at chain-specific addresses. These are used as that chain's
 * defaults and treated as trusted ON THAT CHAIN ONLY.
 */
export const KNOWN_CHAIN_DEPLOYMENTS: Record<string, KnownChainDeployment> = {
  // BattleChain mainnet. Safe v1.5.0 suite deployed by Cyfrin on 2026-06-11 from EOA
  // 0x3846c3a30e62075fa916216b35ef04b8f53931f6 (broadcast: run-latest.json, commit
  // 017fbb9, 11 CREATEs, all receipts successful). Verified on-chain 2026-06-12:
  // VERSION() returns "1.5.0" on both singletons and the factory serves
  // proxyCreationCode(). NOTE: the bytecode is a custom optimized build with stripped
  // CBOR metadata — it does NOT byte-match the official Safe v1.5.0 release builds, so
  // trust here rests on the deployment provenance, not bytecode verification.
  "626": {
    safeVersion: "1.5.0",
    addresses: {
      safeSingletonAddress: "0xFF716747B4D28EAE844Dc069387C9bFC00e51737",
      safeProxyFactoryAddress: "0x8d0D56f72E266a4BfA05340f68409dEBbdbdc9e2",
      fallbackHandlerAddress: "0x2744C4f8336B6e2A8a182495FbB327Db493F303f",
      multiSendAddress: "0x28E369665036bFe0041c1E5838A608b1a818296f",
      multiSendCallOnlyAddress: "0xed4c81c91602CDD5c1e396a1AF28735E03EdA9e2",
      signMessageLibAddress: "0x95cb704BFF25b8943BcE3fAE5D1b4665f7b08115",
      createCallAddress: "0x5A499D08755a9dC90208Ef5b031a3118789EBF5A",
      tokenCallbackHandlerAddress: "0x63b920c6D0B5EC07345d9810169376192654d38F",
      // No SimulateTxAccessor in the battlechain deployment (unused by this app)
    },
    alsoTrusted: {
      safeSingletonAddress: ["0xb6524C4fBcEd314EAad98Bc750B6AD76B64d7f8A"], // SafeL2
      fallbackHandlerAddress: ["0x115b290ecDe805FD846E0C347f3419A4234Fd673"], // ExtensibleFallbackHandler
    },
  },
  // BattleChain testnet (chain 627). Safe v1.5.0 suite at chain-specific
  // addresses. Verified on-chain 2026-06-18: the singleton's VERSION() returns
  // "1.5.0" and all eight suite addresses have deployed bytecode. As with 626,
  // trust rests on deployment provenance, not bytecode byte-matching to the
  // official Safe v1.5.0 release builds.
  "627": {
    safeVersion: "1.5.0",
    addresses: {
      safeSingletonAddress: "0x71314F3E6B1D9386A1de784B644Cf5D0Dde3bB97",
      safeProxyFactoryAddress: "0x80DbD037C59521F393fDfE15504c6b6b7969F1a1",
      fallbackHandlerAddress: "0xc6B2C6982A5643b7702894D4A0901b9371dd1283",
      multiSendAddress: "0x69BEaBc6824ba1461F53800d9C3F29FFeC7cf408",
      multiSendCallOnlyAddress: "0xa6a3C9103C062429e459D263bF5EcCd31Effd56C",
      signMessageLibAddress: "0x930833004d88b8bF3208a216323aFfdf9D40C14C",
      createCallAddress: "0x670D1c4c5cc72193b352562Ed75B9ae8224E98b3",
      tokenCallbackHandlerAddress: "0x232898253fABB3a1EB585bdEE4bE2a36f6D6fd64",
    },
    alsoTrusted: {},
  },
};

/** Safe version of a registered chain-specific suite (e.g. 1.5.0 on battlechain). */
export function getKnownChainSafeVersion(chainId: number | string): string | undefined {
  return KNOWN_CHAIN_DEPLOYMENTS[String(chainId)]?.safeVersion;
}

/**
 * Default contract addresses for a chain: a known chain-specific suite if one is
 * registered (e.g. battlechain), otherwise the canonical deterministic deployment for
 * the given Safe version — identical on every standard EVM chain.
 */
export function getDefaultContractAddresses(
  chainId?: number | string,
  safeVersion: string = DEFAULT_SAFE_VERSION,
): ContractAddresses {
  const known = chainId !== undefined ? KNOWN_CHAIN_DEPLOYMENTS[String(chainId)] : undefined;
  if (known) {
    return { ...known.addresses };
  }
  const deployments = SAFE_DEPLOYMENTS[safeVersion] ?? SAFE_DEPLOYMENTS[DEFAULT_SAFE_VERSION];
  return {
    safeSingletonAddress: deployments.safeSingleton.canonical,
    safeProxyFactoryAddress: deployments.safeProxyFactory.canonical,
    fallbackHandlerAddress: deployments.fallbackHandler.canonical,
    multiSendAddress: deployments.multiSend.canonical,
    multiSendCallOnlyAddress: deployments.multiSendCallOnly.canonical,
    signMessageLibAddress: deployments.signMessageLib.canonical,
    createCallAddress: deployments.createCall.canonical,
    simulateTxAccessorAddress: deployments.simulateTxAccessor.canonical,
  };
}

// Map ContractAddresses keys to the registry roles they may legitimately hold.
const ROLE_BY_FIELD: Record<keyof ContractAddresses, Array<keyof VersionDeployments>> = {
  safeSingletonAddress: ["safeSingleton", "safeL2Singleton"],
  safeProxyFactoryAddress: ["safeProxyFactory"],
  fallbackHandlerAddress: ["fallbackHandler", "extensibleFallbackHandler"],
  multiSendAddress: ["multiSend"],
  multiSendCallOnlyAddress: ["multiSendCallOnly"],
  signMessageLibAddress: ["signMessageLib"],
  createCallAddress: ["createCall"],
  simulateTxAccessorAddress: ["simulateTxAccessor"],
  tokenCallbackHandlerAddress: ["tokenCallbackHandler"],
};

/**
 * Whether an address is a known-good Safe deployment for the given contract role:
 * an official Safe-team deployment (canonical/eip155/zksync variant, any supported
 * version, trusted on every chain) or a registered chain-specific suite entry
 * (trusted only on its chain). Anything else is user-supplied and should be surfaced
 * as untrusted in the UI.
 */
export function isOfficialDeployment(
  field: keyof ContractAddresses,
  address: string,
  chainId?: number | string,
): boolean {
  const needle = address.toLowerCase();
  for (const version of Object.keys(SAFE_DEPLOYMENTS)) {
    for (const role of ROLE_BY_FIELD[field]) {
      const variants = SAFE_DEPLOYMENTS[version][role];
      if (!variants) continue;
      for (const candidate of [variants.canonical, variants.eip155, variants.zksync]) {
        if (candidate && candidate.toLowerCase() === needle) return true;
      }
    }
  }
  const known = chainId !== undefined ? KNOWN_CHAIN_DEPLOYMENTS[String(chainId)] : undefined;
  if (known) {
    const defaultAddress = known.addresses[field];
    if (defaultAddress && defaultAddress.toLowerCase() === needle) return true;
    if (known.alsoTrusted[field]?.some((candidate) => candidate.toLowerCase() === needle)) return true;
  }
  return false;
}

/**
 * Names of contracts in an effective address set that are NOT known-good Safe
 * deployments for the given chain. Used by the UI to flag untrusted configurations.
 */
export function getUntrustedContracts(
  addresses: ContractAddresses,
  chainId?: number | string,
): Array<keyof ContractAddresses> {
  const untrusted: Array<keyof ContractAddresses> = [];
  for (const [field, address] of Object.entries(addresses) as Array<[keyof ContractAddresses, string | undefined]>) {
    if (address && !isOfficialDeployment(field, address, chainId)) {
      untrusted.push(field);
    }
  }
  return untrusted;
}
