import fs from "node:fs";
import path from "node:path";
import { MemoryBlockstore } from "blockstore-core";
import { importer } from "ipfs-unixfs-importer";
import { loadEnv } from "./env.mjs";

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(ROOT, "out");

// Every Pinata pin from this project shares this name prefix. After a
// successful pin, any other pin starting with this prefix is removed so
// Pinata only mirrors the current release.
const PIN_NAME_PREFIX = "localsafe-";

function readProjectVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  return pkg.version || "0.0.0";
}

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

async function pinToPinata(files, jwt, version) {
  const formData = new FormData();
  for (const f of files) {
    formData.append("file", new Blob([f.content]), `out/${f.path}`);
  }
  formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  formData.append("pinataMetadata", JSON.stringify({ name: `${PIN_NAME_PREFIX}${version}` }));

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

// Return all currently-pinned items whose metadata.name starts with our
// prefix. Paginates through Pinata's list endpoint.
async function listPriorLocalsafePins(jwt) {
  const out = [];
  const limit = 1000;
  let offset = 0;
  while (true) {
    const url = `https://api.pinata.cloud/data/pinList?status=pinned&pageLimit=${limit}&pageOffset=${offset}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) {
      throw new Error(`Pinata list failed (${res.status}): ${await res.text()}`);
    }
    const json = await res.json();
    const rows = json.rows ?? [];
    for (const r of rows) {
      if (r.metadata?.name?.startsWith(PIN_NAME_PREFIX)) {
        out.push({ hash: r.ipfs_pin_hash, name: r.metadata.name });
      }
    }
    if (rows.length < limit) break;
    offset += limit;
  }
  return out;
}

async function unpinFromPinata(jwt, hash) {
  const res = await fetch(`https://api.pinata.cloud/pinning/unpin/${hash}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (res.ok) return;
  const text = await res.text();
  // Pinata returns 200 "Unpinned" on success; treat "already not pinned" as no-op.
  if (text.toLowerCase().includes("not pinned")) return;
  throw new Error(`Pinata unpin failed (${res.status}): ${text}`);
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
    const version = readProjectVersion();
    const pinName = `${PIN_NAME_PREFIX}${version}`;
    console.log(`\nPinning to Pinata as "${pinName}"...`);
    pinataCid = await pinToPinata(files, env.PINATA_JWT, version);
    console.log(`  ${pinataCid}`);
    if (pinataCid !== localCid) {
      console.error("\n  ✗ CID MISMATCH");
      console.error(`    Local:  ${localCid}`);
      console.error(`    Pinata: ${pinataCid}`);
      console.error("\n  The CID set in ENS would not match what Pinata is hosting. Investigate before publishing.");
      process.exit(1);
    }
    console.log("  ✓ CIDs match");

    // Replace prior releases — Pinata is a mirror, not an archive. Older
    // CIDs are preserved in GitHub release notes and on whoever else is
    // pinning them (your Kubo node, eth.limo gateway cache, etc).
    const prior = await listPriorLocalsafePins(env.PINATA_JWT);
    const stale = prior.filter((p) => p.hash !== pinataCid);
    if (stale.length === 0) {
      console.log("  (no prior pins to replace)");
    } else {
      console.log(`\nReplacing ${stale.length} prior pin${stale.length === 1 ? "" : "s"}…`);
      for (const p of stale) {
        process.stdout.write(`  unpin ${p.name} (${p.hash})… `);
        try {
          await unpinFromPinata(env.PINATA_JWT, p.hash);
          console.log("ok");
        } catch (err) {
          console.log("FAILED");
          console.error(`    ${err.message}`);
        }
      }
    }
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
