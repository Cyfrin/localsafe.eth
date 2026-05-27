/**
 * Octav API utilities for fetching portfolio data.
 *
 * Octav aggregates wallet token balances AND DeFi protocol positions (Aave,
 * Beefy, Pendle, etc.) with USD valuations in a single authenticated request,
 * across 20+ chains. We use it to enrich the Safe dashboard's Tokens section
 * with both the canonical token list and a structured protocol-position view.
 *
 * Endpoint: GET https://api.octav.fi/v1/portfolio?addresses=<addr>
 * Auth:     Authorization: Bearer <apiKey>
 * Docs:     https://docs.octav.fi/api/endpoints/portfolio
 *
 * The API key is opt-in and stored client-side; preserving localsafe's
 * 100% local default behavior (no calls leave the browser without a key).
 */

/** Resolved at build time. `https://api.octav.fi` by default; override via
 *  `NEXT_PUBLIC_OCTAV_API_BASE` to point at a self-hosted CORS proxy until
 *  Octav exposes browser-friendly CORS on the canonical host. Trailing
 *  slashes are normalized so both `https://x` and `https://x/` work. */
const OCTAV_API_BASE = (process.env.NEXT_PUBLIC_OCTAV_API_BASE || "https://api.octav.fi").replace(/\/+$/, "");

/**
 * Map wagmi chain IDs to Octav's `chainKey` values (lowercase chain slugs).
 * Anything not in this map is treated as unsupported by Octav and the
 * portfolio fetch silently yields no rows for that chain.
 */
const CHAIN_ID_TO_OCTAV_KEY: { [chainId: number]: string } = {
  1: "ethereum",
  10: "optimism",
  56: "bnb",
  100: "gnosis",
  137: "polygon",
  250: "fantom",
  324: "zksync",
  1101: "polygon-zkevm",
  5000: "mantle",
  8453: "base",
  42161: "arbitrum",
  42220: "celo",
  43114: "avalanche",
  59144: "linea",
  534352: "scroll",
  7777777: "zora",
  1313161554: "aurora",
};

export function octavKeyForChain(chainId: number): string | null {
  return CHAIN_ID_TO_OCTAV_KEY[chainId] ?? null;
}

/** Tolerant numeric parser — Octav returns strings like `"5.5"`, `"0"`, or
 *  occasionally null. Returns 0 instead of NaN so totals stay arithmetic. */
function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Shape of an individual asset row inside the portfolio response. */
interface OctavAsset {
  symbol?: string;
  name?: string;
  balance?: string;
  decimal?: string;
  contract?: string;
  chainKey?: string;
  chainContract?: string;
  price?: string;
  value?: string;
  imgSmall?: string;
  imgLarge?: string;
}

interface OctavRawProtocolPosition {
  assets?: OctavAsset[];
  value?: string;
  // Some protocol shapes also return supplied / borrowed / rewards arrays.
  // We keep these optional and fold them all into a flat `assets` list for
  // display since the existing Tokens table is asset-centric.
  supplied?: OctavAsset[];
  borrowed?: OctavAsset[];
  rewards?: OctavAsset[];
  dexPair?: OctavAsset[];
}

interface OctavRawChain {
  key?: string;
  name?: string;
  value?: string;
  protocolPositions?: { [positionType: string]: OctavRawProtocolPosition };
}

interface OctavRawProtocol {
  key?: string;
  name?: string;
  value?: string;
  imgSmall?: string;
  imgLarge?: string;
  chains?: { [chainKey: string]: OctavRawChain };
}

interface OctavPortfolioResponse {
  address?: string;
  networth?: string;
  assetByProtocols?: { [protocol: string]: OctavRawProtocol };
}

/** Slim, UI-ready token row used by the Tokens table merge and inside
 *  protocol-position cards. */
export interface OctavDiscoveredToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  usdPrice?: number;
  usdValue?: number;
  imgSmall?: string;
}

/** One position bucket inside a protocol (lending supplied, LP, claimable
 *  rewards, etc.). `positionType` is upstream's key — e.g. `WALLET`,
 *  `LENDING`, `STAKING`, `LP`, `BORROWING`, `CLAIMABLE_REWARDS`. */
export interface OctavPosition {
  positionType: string;
  value: number;
  assets: OctavDiscoveredToken[];
}

export interface OctavProtocolChain {
  chainKey: string;
  chainName: string;
  value: number;
  positions: OctavPosition[];
}

export interface OctavProtocolGroup {
  key: string;
  name: string;
  value: number;
  imgSmall?: string;
  chains: OctavProtocolChain[];
}

export interface OctavChainSummary {
  chainKey: string;
  chainName: string;
  value: number;
  share: number;
}

/** Full normalized portfolio used by the Octav panel + Tokens merge. */
export interface OctavPortfolio {
  networth: number;
  chainSummary: OctavChainSummary[];
  /** Free-floating wallet tokens on the requested chain. */
  walletTokens: OctavDiscoveredToken[];
  /** Non-wallet protocol positions (Aave, Beefy, Pendle, etc.) on the
   *  requested chain. Empty array when nothing was found. */
  protocols: OctavProtocolGroup[];
  /** Raw upstream response — handed back so the UI can offer a debug
   *  inspector and downstream callers can read fields we haven't typed. */
  raw: OctavPortfolioResponse;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const WALLET_PROTOCOL_KEYS = new Set(["wallet", "WALLET"]);

function normalizeAsset(a: OctavAsset): OctavDiscoveredToken | null {
  if (!a.contract) return null;
  const decimals = Number.parseInt(a.decimal ?? "0", 10);
  if (!Number.isFinite(decimals)) return null;
  return {
    address: a.contract,
    symbol: (a.symbol ?? "").toUpperCase(),
    name: a.name ?? "",
    decimals,
    balance: a.balance ?? "0",
    usdPrice: a.price ? num(a.price) : undefined,
    usdValue: a.value ? num(a.value) : undefined,
    imgSmall: a.imgSmall,
  };
}

function collectPositionAssets(p: OctavRawProtocolPosition): OctavDiscoveredToken[] {
  // Some protocol responses split rows into supplied/borrowed/rewards/LP
  // arrays instead of (or in addition to) the canonical `assets`. Fold
  // everything into one list so the panel can render uniformly.
  const buckets = [p.assets, p.supplied, p.borrowed, p.rewards, p.dexPair];
  const out: OctavDiscoveredToken[] = [];
  for (const bucket of buckets) {
    if (!bucket) continue;
    for (const a of bucket) {
      const row = normalizeAsset(a);
      if (row) out.push(row);
    }
  }
  return out;
}

/**
 * Fetch the Safe's portfolio for a specific chain via Octav. Returns both
 * the flat wallet-token list (which the Tokens table merges in) and the
 * structured protocol-position groups (which the Octav panel renders).
 *
 * Native assets (zero-address contracts) are skipped because the Safe
 * dashboard already renders the native balance separately and Octav reports
 * the same value there.
 */
export async function fetchOctavPortfolio(
  safeAddress: string,
  chainId: number,
  apiKey: string,
): Promise<OctavPortfolio> {
  const chainKey = octavKeyForChain(chainId);
  if (!chainKey) {
    throw new Error(`Octav does not support chainId ${chainId} yet.`);
  }

  const url = `${OCTAV_API_BASE}/v1/portfolio?addresses=${safeAddress}&includeImages=true`;
  const debug = typeof window !== "undefined" && localStorage.getItem("octav-debug") === "1";
  if (debug) console.log("[octav] GET", url);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Octav HTTP ${res.status}: ${body.slice(0, 200) || res.statusText}`);
  }

  const json = (await res.json()) as OctavPortfolioResponse;
  if (debug) console.log("[octav] response", json);

  const networth = num(json.networth);
  const walletTokens: OctavDiscoveredToken[] = [];
  const protocols: OctavProtocolGroup[] = [];
  const chainTotals = new Map<string, { name: string; value: number }>();

  for (const [protoKey, proto] of Object.entries(json.assetByProtocols ?? {})) {
    const protoName = proto.name ?? protoKey;
    const protoChains: OctavProtocolChain[] = [];
    let protoTotalForChain = 0;

    for (const [cKey, chain] of Object.entries(proto.chains ?? {})) {
      const cName = chain.name ?? cKey;
      const cValue = num(chain.value);

      // Aggregate cross-chain totals for the chain-summary header (these
      // include every protocol's contribution, mirroring `networth`).
      const prev = chainTotals.get(cKey) ?? { name: cName, value: 0 };
      chainTotals.set(cKey, { name: cName, value: prev.value + cValue });

      if (cKey !== chainKey) continue;

      const positions: OctavPosition[] = [];
      for (const [posType, pos] of Object.entries(chain.protocolPositions ?? {})) {
        const assets = collectPositionAssets(pos)
          .filter((a) => a.address.toLowerCase() !== ZERO_ADDRESS)
          .filter((a) => a.symbol || a.name);

        if (assets.length === 0) continue;
        const posValue = num(pos.value) || assets.reduce((s, a) => s + (a.usdValue ?? 0), 0);
        positions.push({ positionType: posType, value: posValue, assets });

        // Wallet-protocol assets get a flat copy for the Tokens-table merge.
        if (WALLET_PROTOCOL_KEYS.has(protoKey)) {
          for (const a of assets) walletTokens.push(a);
        }
      }

      if (positions.length > 0) {
        protoChains.push({ chainKey: cKey, chainName: cName, value: cValue, positions });
        protoTotalForChain += cValue;
      }
    }

    // Skip the wallet protocol in the protocols list — wallet tokens are
    // already shown in the dedicated Tokens table below.
    if (WALLET_PROTOCOL_KEYS.has(protoKey)) continue;
    if (protoChains.length === 0) continue;

    protocols.push({
      key: protoKey,
      name: protoName,
      value: protoTotalForChain,
      imgSmall: proto.imgSmall,
      chains: protoChains,
    });
  }

  // Sort protocols by value descending so high-value positions dominate.
  protocols.sort((a, b) => b.value - a.value);

  const chainSummary: OctavChainSummary[] = Array.from(chainTotals.entries())
    .map(([key, { name, value }]) => ({
      chainKey: key,
      chainName: name,
      value,
      share: networth > 0 ? value / networth : 0,
    }))
    .filter((c) => c.value > 0.01)
    .sort((a, b) => b.value - a.value);

  return {
    networth,
    chainSummary,
    walletTokens,
    protocols,
    raw: json,
  };
}
