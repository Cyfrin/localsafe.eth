import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(ROOT, "out");

function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      n += countFiles(path.join(dir, entry.name));
    } else if (entry.isFile()) {
      n++;
    }
  }
  return n;
}

function dirSize(dir) {
  let size = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) size += dirSize(full);
    else if (entry.isFile()) size += fs.statSync(full).size;
  }
  return size;
}

function bytesToHuman(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function gitInfo() {
  const run = (cmd) =>
    execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();

  const commit = run("git rev-parse HEAD");
  const shortCommit = commit.slice(0, 7);
  // Commit timestamp (ISO 8601). Using this instead of build wall-clock time
  // means the same commit always produces the same manifest — anyone can
  // rebuild from a tag and verify.
  const committedAt = run("git log -1 --format=%cI HEAD");

  let tag = null;
  try {
    tag = run("git describe --tags --exact-match");
  } catch {
    // no tag at HEAD
  }

  let branch = null;
  try {
    branch = run("git rev-parse --abbrev-ref HEAD");
    if (branch === "HEAD") branch = null;
  } catch {
    // detached
  }

  let dirty = false;
  try {
    dirty = run("git status --porcelain").length > 0;
  } catch {
    // not a git repo
  }

  return { commit, shortCommit, committedAt, tag, branch, dirty };
}

function readPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  return pkg.version || "0.0.0";
}

function build({ force = false } = {}) {
  const git = gitInfo();

  if (git.dirty && !force) {
    console.error("✗ Working tree has uncommitted changes.");
    console.error("  Release builds must come from a clean checkout — the manifest");
    console.error("  embeds the commit, so uncommitted changes break verifiability.");
    console.error("  Commit (or stash) your changes, or pass --force to override.");
    process.exit(1);
  }

  const version = readPackageVersion();

  console.log(`Building out/ from commit ${git.shortCommit}${git.dirty ? " (dirty)" : ""}…`);

  // Clean prior output so we don't accidentally pin stale files.
  fs.rmSync(OUT, { recursive: true, force: true });

  // Run the project's normal build, with IPFS-relative asset paths.
  // NEXT_BUILD_ID makes the buildId derive from the commit so reruns of the
  // same commit produce the same bundle (next.config.ts must honor this).
  execSync("pnpm run build", {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_IPFS_BUILD: "true",
      NEXT_PUBLIC_APP_VERSION: version,
      NEXT_BUILD_ID: git.commit,
    },
  });

  if (!fs.existsSync(OUT)) {
    console.error('✗ next build did not produce out/. Is `output: "export"` set?');
    process.exit(1);
  }

  const manifest = {
    name: "localsafe.eth",
    version,
    builtAt: git.committedAt,
    git,
  };

  // Inside out/ so it's pinned with the rest and verifiable from IPFS.
  fs.writeFileSync(path.join(OUT, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const totalFiles = countFiles(OUT);
  const totalSize = dirSize(OUT);
  console.log(
    `  done: ${totalFiles} files, ${bytesToHuman(totalSize)} at commit ${git.shortCommit}${git.dirty ? " (dirty)" : ""}`,
  );

  return { manifest, totalFiles, totalSize };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes("--force");
  build({ force });
}

export { build };
