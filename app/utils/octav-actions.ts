/**
 * Translates Octav `positionType` strings into the in-context action verbs
 * DeFi wallets show as chips inside the protocol-card header.
 *
 * Heuristic substring matches — today's `positionType` values are stable
 * upstream, but the matcher is forgiving in case Octav adds new variants
 * (a new `MARGIN_LEND` would still resolve to "Withdraw" via the LEND
 * substring rather than rendering an unknown chip).
 */
export function actionsForPositionTypes(types: string[]): string[] {
  const out = new Set<string>();
  for (const t of types) {
    const u = t.toUpperCase();
    if (u.includes("REWARD") || u === "CLAIMABLE_REWARDS" || u.includes("CLAIM")) out.add("Claim");
    else if (u.includes("BORROW") || u === "DEBT") out.add("Repay");
    else if (u.includes("LEND") || u.includes("SUPPLY") || u === "DEPOSIT") out.add("Withdraw");
    else if (u === "LP" || u.includes("LIQUIDITY") || u === "DEX") out.add("Withdraw");
    else if (u.includes("STAKE") || u === "VAULT" || u.includes("FARM") || u === "YIELD") out.add("Withdraw");
  }
  return Array.from(out);
}
