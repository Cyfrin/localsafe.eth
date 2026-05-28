/**
 * Presentation helpers — small, pure formatting utilities used across the
 * Octav panel and the Tokens table. Kept stateless and side-effect free
 * so the components that consume them stay easy to test.
 */

/** Formats a number as USD (always two decimals, locale-aware grouping). */
export function formatUsd(v: number): string {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formats a stringified token balance for human display.
 * - Returns the raw input for non-numeric strings (rare upstream typos).
 * - Renders very small balances in exponential notation so they don't get
 *   truncated to `0`; everything else uses up to 4 fractional digits with
 *   locale grouping.
 */
export function formatBalance(b: string): string {
  const n = Number.parseFloat(b);
  if (!Number.isFinite(n)) return b;
  if (n === 0) return "0";
  if (n < 0.0001) return n.toExponential(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/** Shortens an EVM address for inline display (0x1234…abcd). */
export function shortAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/**
 * Picks black or white text for legibility on a given hex background.
 * Uses the perceptual-luminance formula (0.299/0.587/0.114 RGB weights)
 * so high-luminance colors like Celo yellow get black text and low-
 * luminance colors like Ethereum blue get white.
 */
export function readableText(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return "#000000";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#000000" : "#FFFFFF";
}
