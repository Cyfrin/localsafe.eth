/**
 * Token logo helper.
 *
 * Uses `logo.octav.fi` — a free, keyless, CORS-enabled icon proxy that
 * resolves logos by contract address, symbol, CoinGecko id, or Pendle
 * PT/YT/SY address. Responses are cached at the CDN (`max-age=86400`) so
 * repeat lookups are essentially free.
 *
 * Docs: https://logo.octav.fi/docs.html
 */

const LOGO_BASE = "https://logo.octav.fi/api/icon";

export function tokenLogoUrl(address: string): string {
  return `${LOGO_BASE}/${address.toLowerCase()}.png`;
}
