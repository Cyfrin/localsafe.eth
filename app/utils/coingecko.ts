/**
 * CoinGecko API utilities for fetching token prices
 */

const PRICE_CACHE_KEY = "coingecko-price-cache";
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

interface PriceCache {
  [key: string]: {
    price: number;
    timestamp: number;
  };
}

interface CoinGeckoResponse {
  market_data?: {
    current_price?: {
      usd?: number;
    };
  };
}

// Map chain IDs to CoinGecko platform IDs
const CHAIN_ID_TO_PLATFORM: { [chainId: number]: string } = {
  1: "ethereum",
  10: "optimistic-ethereum",
  56: "binance-smart-chain",
  100: "xdai",
  137: "polygon-pos",
  250: "fantom",
  324: "zksync",
  8453: "base",
  42161: "arbitrum-one",
  43114: "avalanche",
  59144: "linea",
  534352: "scroll",
  1101: "polygon-zkevm",
  7777777: "zora",
  1313161554: "aurora",
  5000: "mantle",
  42220: "celo",
  11155111: "ethereum", // Sepolia uses same platform as mainnet
  84532: "base", // Base Sepolia
};

/**
 * Get cached price or null if expired
 */
function getCachedPrice(cacheKey: string): number | null {
  if (typeof window === "undefined") return null;

  try {
    const cacheStr = localStorage.getItem(PRICE_CACHE_KEY);
    if (!cacheStr) return null;

    const cache: PriceCache = JSON.parse(cacheStr);
    const entry = cache[cacheKey];

    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > CACHE_DURATION_MS) {
      return null; // Expired
    }

    return entry.price;
  } catch {
    return null;
  }
}

/**
 * Set cached price
 */
function setCachedPrice(cacheKey: string, price: number): void {
  if (typeof window === "undefined") return;

  try {
    const cacheStr = localStorage.getItem(PRICE_CACHE_KEY);
    const cache: PriceCache = cacheStr ? JSON.parse(cacheStr) : {};

    cache[cacheKey] = {
      price,
      timestamp: Date.now(),
    };

    localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Failed to cache price:", error);
  }
}

/**
 * Fetch token price from CoinGecko API by contract address.
 *
 * Works against the public keyless endpoint (rate-limited to ~30 calls/min
 * per IP — see https://docs.coingecko.com/docs/keyless-public-api). When
 * `apiKey` is provided we forward it as `x-cg-demo-api-key` to unlock the
 * Demo plan's higher rate ceiling; absent or empty, we omit the header and
 * fall through to the keyless tier.
 *
 * @param contractAddress - Token contract address
 * @param chainId - Chain ID
 * @param apiKey - Optional CoinGecko Demo API key for higher rate limits
 * @returns USD price or null if not found
 */
export async function fetchTokenPrice(
  contractAddress: string,
  chainId: number,
  apiKey?: string,
): Promise<number | null> {
  // Check cache first
  const cacheKey = `${chainId}-${contractAddress.toLowerCase()}`;
  const cachedPrice = getCachedPrice(cacheKey);

  if (cachedPrice !== null) {
    return cachedPrice;
  }

  // Map chainId to CoinGecko platform
  const platform = CHAIN_ID_TO_PLATFORM[chainId];
  if (!platform) {
    console.warn(`Unsupported chain ID for CoinGecko: ${chainId}`);
    return null;
  }

  try {
    const url = `https://api.coingecko.com/api/v3/coins/${platform}/contract/${contractAddress.toLowerCase()}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey && apiKey.trim()) {
      headers["x-cg-demo-api-key"] = apiKey.trim();
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.warn(`CoinGecko API error: ${response.status} for ${contractAddress}`);
      return null;
    }

    const data: CoinGeckoResponse = await response.json();
    const price = data.market_data?.current_price?.usd;

    if (typeof price === "number") {
      // Cache the price
      setCachedPrice(cacheKey, price);
      return price;
    }

    return null;
  } catch (error) {
    console.error("Failed to fetch token price from CoinGecko:", error);
    return null;
  }
}

/**
 * Clear all cached prices
 */
export function clearPriceCache(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PRICE_CACHE_KEY);
}

/**
 * Clear expired cache entries
 */
export function cleanExpiredCache(): void {
  if (typeof window === "undefined") return;

  try {
    const cacheStr = localStorage.getItem(PRICE_CACHE_KEY);
    if (!cacheStr) return;

    const cache: PriceCache = JSON.parse(cacheStr);
    const now = Date.now();
    const cleaned: PriceCache = {};

    for (const [key, entry] of Object.entries(cache)) {
      if (now - entry.timestamp <= CACHE_DURATION_MS) {
        cleaned[key] = entry;
      }
    }

    localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(cleaned));
  } catch (error) {
    console.error("Failed to clean cache:", error);
  }
}
