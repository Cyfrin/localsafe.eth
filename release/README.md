# Release

Pins the [localsafe.eth](../) app to IPFS and updates the `localsafe.eth` ENS contenthash via the Safe at [`0x20F4…66C`](https://etherscan.io/address/0x20F41376c713072937eb02Be70ee1eD0D639966C).

The whole flow runs from your terminal — no CI required. The existing GitHub Actions workflow at `.github/workflows/deploy-ipfs.yml` is kept as a fallback.

## Setup

```bash
cd release
pnpm install
cp .env.example .env
# fill in MAINNET_RPC_URL (required) and PINATA_JWT (optional)
```

`pnpm` is required because `.npmrc` enforces a 7-day minimum release age on every dependency. npm doesn't honor this setting.

## How to cut a release

> Pre-requisite: your working tree is on the commit you intend to release from. Releases must come from a **clean** checkout — `build.mjs` refuses to run with uncommitted changes (override with `--force` for local iteration).

### 1. Bump version, build, pin, propose the transaction

```bash
pnpm release patch    # 0.2.10 -> 0.2.11
pnpm release minor    # 0.2.10 -> 0.3.0
pnpm release major    # 0.2.10 -> 1.0.0
pnpm release          # no bump — release the current commit as-is
```

If you pass a bump, the script runs `npm version` first — bumping the project's `package.json`, creating a commit `v<new-version>`, and tagging it. The rest of the flow then builds from that new HEAD. You can also pass `prepatch`/`preminor`/`premajor`/`prerelease` for pre-release versions.

After bumping, three steps run:

1. **Build** — `next build` with `NEXT_PUBLIC_IPFS_BUILD=true` produces `../out/`. Embeds the commit + commit timestamp into `out/release-manifest.json`. Sets `NEXT_BUILD_ID` to the commit SHA so the same commit always produces the same bundle.
2. **Pin** — computes the IPFS CID locally (via `ipfs-unixfs-importer`). If `PINATA_JWT` is set, mirrors to Pinata and fails if Pinata's returned CID doesn't match the local one. Prints `ipfs add -r out/` for users running their own Kubo node.
3. **Transaction** — reads ENS owner + Safe state from mainnet, encodes `setContenthash(...)` calldata, computes the EIP-712 `safeTxHash`, and cross-checks it against `Safe.getTransactionHash()` on-chain. Writes three files to `tx-data/`.

After this finishes, push the bump:

```bash
git push --follow-tags
```

### 2. Submit the transaction to the Safe

The script prints two options at the end:

- **Safe TX Builder** — open the printed URL, click "Load batch", upload `tx-data/safe-batch.json`.
- **localsafe.eth** — click the printed URL; the transaction is pre-filled via the URL fragment.

### 3. Each signer verifies on their hardware wallet

The script prints these values for cross-check against what the wallet displays:

| Value | What to check |
|---|---|
| `to` | the ENS PublicResolver address |
| `param 0 (node)` | the namehash of `localsafe.eth` |
| `param 1 (hash)` | the contenthash: starts with `0xe301` (IPFS), the rest is the CID bytes |
| `EIP-712 safeTxHash` | the digest the wallet asks you to sign |
| `ERC-8213 calldata digest` | independent fingerprint of the calldata, verifiable at [erc8213.eth.limo](https://erc8213.eth.limo/) |

The Safe contract itself computed the same `safeTxHash` via `Safe.getTransactionHash()` — the script already verified this at generate time.

### 4. Execute on-chain

Once `threshold` signers have signed, any signer can execute. Wait for the transaction to confirm.

### 5. Cut the GitHub release

```bash
pnpm release:publish
```

This:

1. Reads the on-chain contenthash from the resolver and decodes it.
2. Verifies it matches the CID in `release-manifest.json` (refuses if not).
3. Creates a **draft** GitHub release at `v<package.version>+<short-commit>` (or the current git tag if HEAD is tagged) with notes containing the CID, contenthash, Safe + resolver Etherscan links, and IPFS gateway URLs.

Review the draft on github.com and click "Publish release" when satisfied.

## Files

### `../out/` (gitignored — what gets pinned to IPFS)

The full static export of the Next.js app, plus a `release-manifest.json` with the commit hash and timestamp.

### `tx-data/` (gitignored — release metadata, **not** on IPFS)

| | |
|---|---|
| `safe-batch.json` | Safe TX Builder format |
| `localsafe-tx.json` | localsafe.eth `importTx` format |
| `tx-summary.txt` | human-readable summary for hardware-wallet verification |

## Individual commands

```bash
pnpm build              # just build out/
pnpm pin                # just pin (requires out/)
pnpm tx                 # just compute the Safe transaction (requires out/ + .cid)
pnpm release            # build + pin + tx (no version bump)
pnpm release patch      # bump patch version then release
pnpm release minor      # bump minor version then release
pnpm release major      # bump major version then release
pnpm release:publish    # post-on-chain: create GitHub release
pnpm verify             # rebuild out/ and compare its CID to what's on-chain (exit 0 = match)

pnpm build --force      # bypass the dirty-checkout guard (testing only)
```

## Verifying that on-chain == source

Any third party can confirm that the contenthash currently set for `localsafe.eth` matches a specific commit of this repo:

```bash
git checkout <tag>
cd release
pnpm install
pnpm verify
```

`pnpm verify` rebuilds `../out/` from the checked-out source, computes the CID, reads `Resolver.contenthash(namehash("localsafe.eth"))` from mainnet, and reports `MATCH` or `MISMATCH`. Exit code 0 = match, 1 = mismatch — suitable for CI.

## Verifying the CID independently

```bash
git checkout <tag>
cd release
pnpm install
pnpm build
ipfs add -rn ../out/      # requires Kubo
# CID should match the one in the GitHub release notes
```

## Troubleshooting

**`Working tree has uncommitted changes`** — commit (or stash) first. Releases must be reproducible from a single commit. Use `--force` only when iterating locally.

**`Pinata upload failed (401)`** — `PINATA_JWT` is invalid or expired. Generate a new JWT in the Pinata dashboard.

**`CID MISMATCH` between local and Pinata** — investigate before publishing. The contenthash set on-chain would not match what Pinata is hosting.

**`ENS owner does not match Safe`** — `localsafe.eth` is owned by something other than the expected Safe. Investigate before continuing.

**`safeTxHash mismatch`** — the Safe contract disagrees with our local EIP-712 computation. Likely a Safe-version mismatch — check `Safe.VERSION()` against `SAFE_TX_TYPES` in `abi.mjs`.

**`On-chain CID does not match the local build`** — the Safe transaction hasn't executed yet, or someone updated the contenthash to a different value. Rebuild if the source has changed.
