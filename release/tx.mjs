import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  encodeFunctionData,
  hashTypedData,
  http as viemHttp,
  isAddressEqual,
  namehash,
} from "viem";
import { mainnet } from "viem/chains";
import { ENS_REGISTRY_ABI, RESOLVER_ABI, SAFE_ABI, SAFE_TX_TYPES } from "./abi.mjs";
import { loadEnv } from "./env.mjs";
import { calldataDigest, cidToContenthash, safeBatchChecksum } from "./lib.mjs";

const HERE = import.meta.dirname;
const TX_DATA = path.join(HERE, "tx-data");

const ENS_NAME = "localsafe.eth";
const SAFE_ADDRESS = "0x20F41376c713072937eb02Be70ee1eD0D639966C";
const CHAIN_ID = 1;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

async function readEnsState(client, name) {
  const node = namehash(name);
  const [owner, resolver] = await Promise.all([
    client.readContract({
      address: ENS_REGISTRY,
      abi: ENS_REGISTRY_ABI,
      functionName: "owner",
      args: [node],
    }),
    client.getEnsResolver({ name }),
  ]);
  return { node, owner, resolver };
}

async function readSafeState(client, address) {
  const [nonce, threshold, owners] = await Promise.all([
    client.readContract({ address, abi: SAFE_ABI, functionName: "nonce" }),
    client.readContract({ address, abi: SAFE_ABI, functionName: "getThreshold" }),
    client.readContract({ address, abi: SAFE_ABI, functionName: "getOwners" }),
  ]);
  return { nonce, threshold: Number(threshold), owners };
}

function buildSafeBatch({ resolver, node, contenthash, cid }) {
  const transactions = [
    {
      to: resolver,
      value: "0",
      data: null,
      contractMethod: {
        inputs: [
          { internalType: "bytes32", name: "node", type: "bytes32" },
          { internalType: "bytes", name: "hash", type: "bytes" },
        ],
        name: "setContenthash",
        payable: false,
      },
      contractInputsValues: { node, hash: contenthash },
    },
  ];

  const batchFile = {
    version: "1.0",
    chainId: String(CHAIN_ID),
    createdAt: Date.now(),
    meta: {
      name: `${ENS_NAME} contenthash → ${cid}`,
      description: `Set the contenthash for ${ENS_NAME} to IPFS CID ${cid}.`,
      txBuilderVersion: "1.18.0",
      createdFromSafeAddress: SAFE_ADDRESS,
      createdFromOwnerAddress: "",
      checksum: "",
    },
    transactions,
  };

  batchFile.meta.checksum = safeBatchChecksum(batchFile);
  return batchFile;
}

function buildLocalsafeTx({ resolver, calldata, nonce }) {
  return {
    tx: {
      data: {
        to: resolver,
        value: "0",
        data: calldata,
        operation: 0,
        safeTxGas: "0",
        baseGas: "0",
        gasPrice: "0",
        gasToken: ZERO_ADDR,
        refundReceiver: ZERO_ADDR,
        nonce: Number(nonce),
      },
      signatures: [],
    },
  };
}

function localsafeUrl(localsafeTx) {
  const json = JSON.stringify(localsafeTx);
  const b64 = Buffer.from(json, "utf-8").toString("base64");
  const encoded = encodeURIComponent(b64);
  return `https://localsafe.eth.limo/#/safe/${SAFE_ADDRESS}?importTx=${encoded}&chainId=${CHAIN_ID}`;
}

function safeBuilderUrl() {
  return `https://app.safe.global/apps/open?safe=eth:${SAFE_ADDRESS}&appUrl=${encodeURIComponent(
    "https://apps-portal.safe.global/tx-builder",
  )}`;
}

function renderSummary(ctx) {
  const lines = [
    `${ENS_NAME} — release transaction summary`,
    "=================================================",
    "",
    `CID:           ${ctx.cid}`,
    `Contenthash:   ${ctx.contenthash}`,
    "",
    `ENS name:      ${ENS_NAME}`,
    `ENS namehash:  ${ctx.node}`,
    `ENS owner:     ${ctx.ensOwner}${ctx.ensOwnerMatches ? " (matches Safe)" : " — does NOT match Safe"}`,
    `Resolver:      ${ctx.resolver}`,
    "",
    "Transaction:",
    `  to:          ${ctx.resolver}`,
    "  value:       0",
    "  operation:   0 (CALL)",
    `  data:        ${ctx.calldata}`,
    "",
    "  Function: setContenthash(bytes32 node, bytes hash)",
    `    param 0 (node):  ${ctx.node}`,
    `                     (namehash of ${ENS_NAME})`,
    `    param 1 (hash):  ${ctx.contenthash}`,
    `                     (IPFS contenthash for CID ${ctx.cid})`,
    "",
    `Safe:          ${SAFE_ADDRESS}`,
    `  chain:       ${CHAIN_ID} (mainnet)`,
    `  nonce:       ${ctx.safeState.nonce}`,
    `  threshold:   ${ctx.safeState.threshold} of ${ctx.safeState.owners.length}`,
    "  owners:",
    ...ctx.safeState.owners.map((o) => `    - ${o}`),
    "",
    "Verification digests (https://erc8213.eth.limo/):",
    `  ERC-8213 calldata digest:  ${ctx.cdDigest}`,
    `  EIP-712 safeTxHash:        ${ctx.safeTxHash}`,
    "",
  ];
  return lines.join("\n");
}

async function tx() {
  const env = loadEnv();

  if (!env.MAINNET_RPC_URL) {
    console.error("MAINNET_RPC_URL not set in release/.env");
    console.error("Add a mainnet RPC URL (Alchemy, Infura, llamarpc, etc.) and try again.");
    process.exit(1);
  }

  const cidPath = path.join(HERE, ".cid");
  if (!fs.existsSync(cidPath)) {
    console.error(".cid not found. Run `pnpm pin` first.");
    process.exit(1);
  }
  const cid = fs.readFileSync(cidPath, "utf-8").trim();

  const client = createPublicClient({
    chain: mainnet,
    transport: viemHttp(env.MAINNET_RPC_URL),
  });

  console.log(`CID:           ${cid}`);
  const contenthash = cidToContenthash(cid);
  console.log(`Contenthash:   ${contenthash}`);

  console.log(`\nReading ENS state for ${ENS_NAME}...`);
  const ens = await readEnsState(client, ENS_NAME);
  const ensOwnerMatches = isAddressEqual(ens.owner, SAFE_ADDRESS);
  console.log(`  namehash:    ${ens.node}`);
  console.log(`  owner:       ${ens.owner}${ensOwnerMatches ? " ✓" : ""}`);
  console.log(`  resolver:    ${ens.resolver}`);

  if (!ensOwnerMatches) {
    console.log(`\n  ⚠ ${ENS_NAME} is not yet owned by the Safe ${SAFE_ADDRESS}.`);
    console.log("    The Safe cannot execute setContenthash until ownership is transferred.");
    console.log(`    Transfer via the ENS app: https://app.ens.domains/${ENS_NAME}`);
  }

  console.log(`\nReading Safe state for ${SAFE_ADDRESS}...`);
  const safeState = await readSafeState(client, SAFE_ADDRESS);
  console.log(`  nonce:       ${safeState.nonce}`);
  console.log(`  threshold:   ${safeState.threshold} of ${safeState.owners.length}`);

  const calldata = encodeFunctionData({
    abi: RESOLVER_ABI,
    functionName: "setContenthash",
    args: [ens.node, contenthash],
  });

  const cdDigest = calldataDigest(calldata);

  const safeTxArgs = [ens.resolver, 0n, calldata, 0, 0n, 0n, 0n, ZERO_ADDR, ZERO_ADDR, BigInt(safeState.nonce)];

  const safeTxHash = hashTypedData({
    domain: { chainId: CHAIN_ID, verifyingContract: SAFE_ADDRESS },
    types: SAFE_TX_TYPES,
    primaryType: "SafeTx",
    message: {
      to: safeTxArgs[0],
      value: safeTxArgs[1],
      data: safeTxArgs[2],
      operation: safeTxArgs[3],
      safeTxGas: safeTxArgs[4],
      baseGas: safeTxArgs[5],
      gasPrice: safeTxArgs[6],
      gasToken: safeTxArgs[7],
      refundReceiver: safeTxArgs[8],
      nonce: safeTxArgs[9],
    },
  });

  // Verify our locally-computed safeTxHash against what the Safe contract
  // itself says. Catches any mismatch in SAFE_TX_TYPES (e.g. a Safe-version
  // change), so signers can trust the hash we print will match what their
  // hardware wallet shows.
  console.log("\nVerifying safeTxHash against Safe.getTransactionHash()...");
  const onChainSafeTxHash = await client.readContract({
    address: SAFE_ADDRESS,
    abi: SAFE_ABI,
    functionName: "getTransactionHash",
    args: safeTxArgs,
  });
  if (onChainSafeTxHash !== safeTxHash) {
    console.error("\n  ✗ safeTxHash mismatch — the Safe contract disagrees with our local computation.");
    console.error(`    local:    ${safeTxHash}`);
    console.error(`    on-chain: ${onChainSafeTxHash}`);
    console.error("    SAFE_TX_TYPES likely doesn't match this Safe's version. Investigate before signing.");
    process.exit(1);
  }
  console.log(`  ✓ ${safeTxHash}`);

  const batchFile = buildSafeBatch({
    resolver: ens.resolver,
    node: ens.node,
    contenthash,
    cid,
  });
  const localsafeTx = buildLocalsafeTx({
    resolver: ens.resolver,
    calldata,
    nonce: safeState.nonce,
  });

  fs.mkdirSync(TX_DATA, { recursive: true });
  const batchPath = path.join(TX_DATA, "safe-batch.json");
  const localsafePath = path.join(TX_DATA, "localsafe-tx.json");
  const summaryPath = path.join(TX_DATA, "tx-summary.txt");

  fs.writeFileSync(batchPath, `${JSON.stringify(batchFile, null, 2)}\n`);
  fs.writeFileSync(localsafePath, `${JSON.stringify(localsafeTx, null, 2)}\n`);

  const ctx = {
    cid,
    contenthash,
    ensOwner: ens.owner,
    ensOwnerMatches,
    resolver: ens.resolver,
    node: ens.node,
    calldata,
    cdDigest,
    safeTxHash,
    safeState,
  };
  fs.writeFileSync(summaryPath, renderSummary(ctx));

  console.log("\nWrote:");
  console.log(`  ${path.relative(HERE, batchPath)}      (Safe TX Builder)`);
  console.log(`  ${path.relative(HERE, localsafePath)}   (localsafe.eth)`);
  console.log(`  ${path.relative(HERE, summaryPath)}     (human-readable verification)`);

  console.log("\nFunction call (verify each on your hardware wallet):");
  console.log("  setContenthash(bytes32 node, bytes hash)");
  console.log(`  param 0 (node):  ${ens.node}`);
  console.log(`                   (namehash of ${ENS_NAME})`);
  console.log(`  param 1 (hash):  ${contenthash}`);
  console.log(`                   (IPFS contenthash for CID ${cid})`);

  console.log("\nVerification digests (https://erc8213.eth.limo/):");
  console.log(`  ERC-8213 calldata digest:  ${cdDigest}`);
  console.log(`  EIP-712 safeTxHash:        ${safeTxHash}`);

  console.log("\nDecode the calldata:");
  console.log(`  https://tools.cyfrin.io/abi-encoding?data=${calldata}`);

  console.log("\nSubmit via Safe TX Builder (load release/tx-data/safe-batch.json):");
  console.log(`  ${safeBuilderUrl()}`);

  console.log("\n…or via localsafe.eth (click to open with the tx pre-filled):");
  console.log(`  ${localsafeUrl(localsafeTx)}`);

  console.log("\nAfter the Safe transaction executes on-chain, run `pnpm release:publish` to cut a GitHub release.");

  return ctx;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  tx().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { tx };
