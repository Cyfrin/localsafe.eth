import fs from "node:fs";
import path from "node:path";
import { MemoryBlockstore } from "blockstore-core";
import { importer } from "ipfs-unixfs-importer";
import { loadEnv } from "./env.mjs";

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(ROOT, "out");

export function collectFiles(dir, prefix = "") {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...collectFiles(full, rel));
    } else if (entry.isFile()) {
      files.push({ path: rel, content: fs.readFileSync(full) });
    }
  }
  return files;
}

export async function computeLocalCid(files) {
  const blockstore = new MemoryBlockstore();
  let rootCid;
  for await (const entry of importer(files, blockstore, {
    cidVersion: 1,
    wrapWithDirectory: true,
  })) {
    rootCid = entry.cid;
  }
  return rootCid.toString();
}

async function pinToPinata(files, jwt) {
  const formData = new FormData();
  for (const f of files) {
    formData.append("file", new Blob([f.content]), `out/${f.path}`);
  }
  formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  formData.append(
    "pinataMetadata",
    JSON.stringify({
      name: `localsafe-${new Date().toISOString().slice(0, 10)}`,
    }),
  );

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Pinata upload failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return data.IpfsHash;
}

function bytesToHuman(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function pin() {
  if (!fs.existsSync(OUT)) {
    console.error("out/ not found. Run `pnpm build` first.");
    process.exit(1);
  }

  const env = loadEnv();

  console.log("Collecting files from out/...");
  const files = collectFiles(OUT);
  const totalBytes = files.reduce((n, f) => n + f.content.length, 0);
  console.log(`  ${files.length} files, ${bytesToHuman(totalBytes)}`);

  console.log("\nComputing local CID...");
  const localCid = await computeLocalCid(files);
  console.log(`  ${localCid}`);

  let pinataCid = null;
  if (env.PINATA_JWT) {
    console.log("\nPinning to Pinata...");
    pinataCid = await pinToPinata(files, env.PINATA_JWT);
    console.log(`  ${pinataCid}`);
    if (pinataCid !== localCid) {
      console.error("\n  ✗ CID MISMATCH");
      console.error(`    Local:  ${localCid}`);
      console.error(`    Pinata: ${pinataCid}`);
      console.error("\n  The CID set in ENS would not match what Pinata is hosting. Investigate before publishing.");
      process.exit(1);
    }
    console.log("  ✓ CIDs match");
  } else {
    console.log("\nPINATA_JWT not set in release/.env. Skipping Pinata mirror.");
    console.log("  (Set PINATA_JWT to also pin to Pinata's public service.)");
  }

  console.log("\nTo pin on your own Kubo node:");
  console.log("  ipfs add -r out/");
  console.log(`  expected CID: ${localCid}`);

  fs.writeFileSync(path.join(HERE, ".cid"), `${localCid}\n`);

  return { cid: localCid, pinataCid };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  pin().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { pin };
