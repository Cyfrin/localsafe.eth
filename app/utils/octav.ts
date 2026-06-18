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

/**
 * Brand color per Octav `chainKey`, used to tint the panel's chain-filter
 * boxes. Falls back to a neutral gray for any chain we haven't mapped.
 */
const CHAIN_COLORS: { [chainKey: string]: string } = {
  ethereum: "#627EEA",
  optimism: "#FF0420",
  arbitrum: "#28A0F0",
  base: "#0052FF",
  polygon: "#8247E5",
  "polygon-zkevm": "#8247E5",
  bnb: "#F0B90B",
  gnosis: "#04795B",
  fantom: "#1969FF",
  zksync: "#8C8DFC",
  mantle: "#65B3AE",
  celo: "#FCFF52",
  avalanche: "#E84142",
  linea: "#61DFFF",
  scroll: "#EBC28E",
  zora: "#2B5DF0",
  aurora: "#70D44B",
};

export function chainColor(chainKey: string): string {
  return CHAIN_COLORS[chainKey.toLowerCase()] ?? "#6B7280";
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

/** Loose typing for Octav's response shape — assets show up in several
 *  parallel bucket arrays (assets / rewardAssets / supplyAssets / …) and
 *  position trees nest a level or two deeper than the docs sample, so we
 *  traverse defensively rather than forcing a strict schema. */
interface OctavRawPosition {
  name?: string;
  key?: string;
  value?: string;
  totalValue?: string;
  // Flat asset arrays at this level. Real-world responses use these exact
  // names — see Beefy `YIELD.protocolPositions[].assets` + Pendle V2
  // `LIQUIDITYPOOL.protocolPositions[].rewardAssets` for proof.
  assets?: OctavAsset[];
  rewardAssets?: OctavAsset[];
  supplyAssets?: OctavAsset[];
  borrowAssets?: OctavAsset[];
  dexAssets?: OctavAsset[];
  marginAssets?: OctavAsset[];
  baseAssets?: OctavAsset[];
  quoteAssets?: OctavAsset[];
  collateralizeNFTAssets?: OctavAsset[];
  // Per-instance position metadata (Beefy vault, Pendle LP, IPOR vault, …).
  poolAddress?: string;
  vaultAddress?: string;
  siteUrl?: string;
  // Nested positions — array of per-instance positions. Older docs showed
  // a keyed-map shape too, kept for forward-compat.
  protocolPositions?: OctavRawPosition[] | { [k: string]: OctavRawPosition };
}

interface OctavRawChain {
  key?: string;
  name?: string;
  value?: string;
  totalValue?: string;
  imgSmall?: string;
  protocolPositions?: { [positionType: string]: OctavRawPosition };
}

interface OctavRawProtocol {
  key?: string;
  name?: string;
  value?: string;
  totalValue?: string;
  imgSmall?: string;
  imgLarge?: string;
  chains?: { [chainKey: string]: OctavRawChain };
}

/** Top-level summary chain entry (next to assetByProtocols). Already
 *  pre-aggregated so we don't have to sum per-protocol contributions
 *  ourselves. */
interface OctavRawSummaryChain {
  key?: string;
  name?: string;
  chainId?: string;
  value?: string;
  imgSmall?: string;
}

interface OctavPortfolioResponse {
  address?: string;
  networth?: string;
  netWorth?: string;
  totalValue?: string;
  assetByProtocols?: { [protocol: string]: OctavRawProtocol };
  chains?: { [chainKey: string]: OctavRawSummaryChain };
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

/** One concrete position inside a protocol — e.g. a single Beefy vault, a
 *  single Pendle LP, a single Aave reserve. Replaces the older "bucket"
 *  shape so multiple instances under the same `positionType` (e.g. two
 *  MSETH/WETH vaults under YIELD) render as distinct rows with their own
 *  names + pool addresses, mirroring Octav's own UI. */
export interface OctavPosition {
  /** Display name from upstream (LP pair like "MSETH / WETH", vault name
   *  like "rETH Liquity LP Carry", etc.). Falls back to a humanized
   *  `positionType` when Octav doesn't supply one (e.g. WALLET). */
  name: string;
  /** Upstream position-type bucket. Used for action-chip derivation and
   *  as a fallback label. */
  positionType: string;
  value: number;
  /** Principal tokens for the position (LP underlying, lending supplied,
   *  vault deposits, plain wallet holdings). */
  assets: OctavDiscoveredToken[];
  /** Claimable rewards/incentives — broken out separately so the UI can
   *  label them ("Rewards: 0.76 PENDLE = $1.24"). */
  rewardAssets: OctavDiscoveredToken[];
  poolAddress?: string;
  vaultAddress?: string;
  siteUrl?: string;
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
  /** Non-wallet protocol positions (Aave, Beefy, Pendle, etc.) across ALL
   *  chains the Safe holds value on — the panel filters these by chain.
   *  Empty array when nothing was found. */
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

/** Collect only the principal-asset buckets from one position node — does
 *  NOT include rewards (those get pulled separately so the UI can label
 *  them). Doesn't recurse into nested positions either; the parser walks
 *  those itself to preserve per-position grouping. */
function collectPrincipalAssets(p: OctavRawPosition): OctavDiscoveredToken[] {
  const out: OctavDiscoveredToken[] = [];
  const buckets = [
    p.assets,
    p.supplyAssets,
    p.borrowAssets,
    p.dexAssets,
    p.marginAssets,
    p.baseAssets,
    p.quoteAssets,
    p.collateralizeNFTAssets,
  ];
  for (const bucket of buckets) {
    if (!bucket) continue;
    for (const a of bucket) {
      const row = normalizeAsset(a);
      if (row) out.push(row);
    }
  }
  return out;
}

function collectRewardAssets(p: OctavRawPosition): OctavDiscoveredToken[] {
  if (!p.rewardAssets) return [];
  return p.rewardAssets.map(normalizeAsset).filter((x): x is OctavDiscoveredToken => x !== null);
}

function humanizePositionType(t: string): string {
  return t.replaceAll("_", " ").toLowerCase();
}

/** Convert one nested `protocolPositions[i]` entry into our normalized
 *  `OctavPosition`. Drops the row entirely if it has no assets and no
 *  declared USD value (avoids ghost rows from sparse protocols). */
function buildPosition(raw: OctavRawPosition, positionType: string, fallbackName: string): OctavPosition | null {
  const principalAssets = collectPrincipalAssets(raw).filter((a) => a.address.toLowerCase() !== ZERO_ADDRESS);
  const rewardAssets = collectRewardAssets(raw).filter((a) => a.address.toLowerCase() !== ZERO_ADDRESS);

  const declared = pickValue(raw);
  const sumAssets = principalAssets.reduce((s, a) => s + (a.usdValue ?? 0), 0);
  const sumRewards = rewardAssets.reduce((s, a) => s + (a.usdValue ?? 0), 0);
  const value = declared || sumAssets + sumRewards;

  if (principalAssets.length === 0 && rewardAssets.length === 0 && value <= 0) return null;

  return {
    name: raw.name?.trim() || fallbackName,
    positionType,
    value,
    assets: principalAssets,
    rewardAssets,
    poolAddress: raw.poolAddress || undefined,
    vaultAddress: raw.vaultAddress || undefined,
    siteUrl: raw.siteUrl || undefined,
  };
}

/** Octav uses `value` on some shapes and `totalValue` on others; both are
 *  USD strings. Pick whichever is present. */
function pickValue(o: { value?: string; totalValue?: string } | undefined): number {
  if (!o) return 0;
  return num(o.totalValue ?? o.value);
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

  const parsed = await res.json();
  if (debug) console.log("[octav] response", parsed);

  // Octav returns a one-element ARRAY at the top level — unwrap it.
  // Tolerate the documented object shape too so we don't break if they
  // ever change posture.
  const json: OctavPortfolioResponse = (Array.isArray(parsed) ? parsed[0] : parsed) ?? {};

  // Top-level networth — field name has appeared as `networth`, `netWorth`,
  // and `totalValue` across response variants.
  let networth = num(json.networth ?? json.netWorth ?? json.totalValue);

  const walletTokens: OctavDiscoveredToken[] = [];
  const protocols: OctavProtocolGroup[] = [];

  // Prefer the pre-aggregated top-level `chains` map for the chain summary
  // (saves us from accumulating per-protocol-per-chain values, which can
  // double-count or undercount depending on how a protocol reports).
  const chainSummary: OctavChainSummary[] = Object.entries(json.chains ?? {})
    .map(([key, c]) => ({
      chainKey: key,
      chainName: c.name ?? key,
      value: num(c.value),
      share: 0, // filled below once networth is finalized
    }))
    .filter((c) => c.value > 0.01)
    .sort((a, b) => b.value - a.value);

  for (const [protoKey, proto] of Object.entries(json.assetByProtocols ?? {})) {
    const protoName = proto.name ?? protoKey;
    const protoChains: OctavProtocolChain[] = [];
    let protoTotal = 0;

    // Parse positions across ALL chains so the panel's chain-filter can
    // surface cross-chain positions. (The Tokens table stays connected-chain
    // only — wallet-token extraction below is gated to `chainKey`.)
    for (const [cKey, chain] of Object.entries(proto.chains ?? {})) {
      const cName = chain.name ?? cKey;
      const cValue = pickValue(chain);

      const positions: OctavPosition[] = [];
      for (const [posType, wrapper] of Object.entries(chain.protocolPositions ?? {})) {
        // Each `protocolPositions[posType]` entry can hold EITHER its own
        // direct assets (WALLET-style — one logical position) OR a nested
        // `protocolPositions[]` array where each entry is a real instance
        // (Beefy vault, Pendle LP, IPOR vault…). Walk whichever applies.
        const nested = Array.isArray(wrapper.protocolPositions) ? wrapper.protocolPositions : [];

        if (nested.length > 0) {
          for (const inst of nested) {
            const p = buildPosition(inst, posType, humanizePositionType(posType));
            if (p) positions.push(p);
          }
        } else {
          const p = buildPosition(wrapper, posType, wrapper.name?.trim() || humanizePositionType(posType));
          if (p) positions.push(p);
        }

        // Wallet-protocol assets still get a flat copy for the Tokens-table
        // merge. Pulled directly from the wrapper since WALLET never nests.
        if (WALLET_PROTOCOL_KEYS.has(protoKey) && cKey === chainKey) {
          const walletAssets = collectPrincipalAssets(wrapper).filter((a) => a.address.toLowerCase() !== ZERO_ADDRESS);
          for (const a of walletAssets) walletTokens.push(a);
        }
      }

      if (positions.length > 0) {
        protoChains.push({ chainKey: cKey, chainName: cName, value: cValue, positions });
        protoTotal += cValue || positions.reduce((s, p) => s + p.value, 0);
      }
    }

    // Skip the wallet protocol in the protocols list — wallet tokens are
    // already shown in the dedicated Tokens table below.
    if (WALLET_PROTOCOL_KEYS.has(protoKey)) continue;
    if (protoChains.length === 0) continue;

    protocols.push({
      key: protoKey,
      name: protoName,
      value: protoTotal,
      imgSmall: proto.imgSmall,
      chains: protoChains,
    });
  }

  // Sort protocols by value descending so high-value positions dominate.
  protocols.sort((a, b) => b.value - a.value);

  // Fall back to summing chain totals if the top-level networth field
  // wasn't present — keeps the header from rendering $0 when the rest of
  // the payload clearly has value.
  if (networth <= 0) {
    networth = chainSummary.reduce((s, c) => s + c.value, 0);
  }
  for (const c of chainSummary) {
    c.share = networth > 0 ? c.value / networth : 0;
  }

  return {
    networth,
    chainSummary,
    walletTokens,
    protocols,
    raw: json,
  };
}
