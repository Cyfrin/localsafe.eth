import path from "node:path";
import { createPublicClient, http as viemHttp, namehash } from "viem";
import { mainnet } from "viem/chains";
import { RESOLVER_ABI } from "./abi.mjs";
import { build } from "./build.mjs";
import { loadEnv } from "./env.mjs";
import { contenthashToCid } from "./lib.mjs";
import { collectFiles, computeLocalCid } from "./pin.mjs";

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(ROOT, "out");

const ENS_NAME = "localsafe.eth";

async function verify() {
  const env = loadEnv();
  const force = process.argv.includes("--force");

  if (!env.MAINNET_RPC_URL) {
    console.error("MAINNET_RPC_URL not set in release/.env");
    process.exit(1);
  }

  console.log("1. Rebuilding out/ from current source...\n");
  build({ force });

  console.log("\n2. Computing local CID...\n");
  const files = collectFiles(OUT);
  const localCid = await computeLocalCid(files);
  console.log(`  Local CID:    ${localCid}`);

  console.log("\n3. Reading on-chain contenthash...\n");
  const client = createPublicClient({
    chain: mainnet,
    transport: viemHttp(env.MAINNET_RPC_URL),
  });

  const node = namehash(ENS_NAME);
  const resolver = await client.getEnsResolver({ name: ENS_NAME });
  const contenthashHex = await client.readContract({
    address: resolver,
    abi: RESOLVER_ABI,
    functionName: "contenthash",
    args: [node],
  });
  const onChainCid = contenthashToCid(contenthashHex);
  console.log(`  Resolver:     ${resolver}`);
  console.log(`  Contenthash:  ${contenthashHex}`);
  console.log(`  On-chain CID: ${onChainCid ?? "(not an IPFS contenthash)"}`);

  console.log();
  if (localCid === onChainCid) {
    console.log("✓ MATCH — the current source matches what's pinned on-chain.");
    process.exit(0);
  } else {
    console.log("✗ MISMATCH — the current source does NOT match what's pinned on-chain.");
    console.log(`    Local:    ${localCid}`);
    console.log(`    On-chain: ${onChainCid ?? contenthashHex}`);
    console.log("\n  This is expected if the source has changed since the last release, or if no");
    console.log("  release has been cut for this commit yet. Run `pnpm release` to propose one.");
    process.exit(1);
  }
}

verify().catch((err) => {
  console.error(err);
  process.exit(1);
});
