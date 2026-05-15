import { execSync } from "node:child_process";
import path from "node:path";
import { build } from "./build.mjs";
import { pin } from "./pin.mjs";
import { tx } from "./tx.mjs";

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, "..");

// npm version supports these. We document patch/minor/major; the rest work too.
const BUMP_TYPES = new Set(["patch", "minor", "major", "prepatch", "preminor", "premajor", "prerelease"]);

function bumpVersion(bump) {
  const status = execSync("git status --porcelain", {
    cwd: ROOT,
    encoding: "utf-8",
  });
  if (status.trim()) {
    console.error("✗ Working tree has uncommitted changes. Commit or stash before bumping.");
    process.exit(1);
  }
  console.log(`Bumping version (${bump})...\n`);
  // npm version: bumps the project's package.json, creates a commit, creates a
  // "v$VERSION" tag. Run from project root so it targets the app's package.json,
  // not release/package.json.
  execSync(`npm version ${bump}`, {
    cwd: ROOT,
    stdio: "inherit",
  });
  // Echo the new HEAD so it's obvious which commit the release will build from.
  const head = execSync("git rev-parse --short HEAD", {
    cwd: ROOT,
    encoding: "utf-8",
  }).trim();
  console.log(`\n  HEAD is now ${head}\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  const flags = argv.filter((a) => a.startsWith("--"));
  const positional = argv.filter((a) => !a.startsWith("--"));

  const force = flags.includes("--force");
  const bump = positional[0];

  console.log("=== localsafe.eth release ===\n");

  if (bump) {
    if (!BUMP_TYPES.has(bump)) {
      console.error(
        `Unknown bump: "${bump}". Expected one of: patch, minor, major (or prepatch/preminor/premajor/prerelease).`,
      );
      process.exit(1);
    }
    bumpVersion(bump);
  }

  console.log("1. Build\n");
  build({ force });

  console.log("\n2. Pin\n");
  await pin();

  console.log("\n3. Transaction\n");
  await tx();

  if (bump) {
    console.log("\nDon't forget to push the version bump + tag before running `pnpm release:publish`:");
    console.log("  git push --follow-tags");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
