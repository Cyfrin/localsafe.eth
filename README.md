# localsafe.eth

> **Disclaimer**: Bear in mind this is still a project in early development. It still needs further testing and polishing. Feedback and contributions are welcome!

A 100% local web interface for managing multisignature wallets inspired by SafeWallet and EternalSafeWallet. No worrying about the SafeAPI being compromised... Run an instance yourself!

**v0.2.0** - Now with IPFS deployment support and enhanced UI!

- [localsafe.eth](#localsafeeth)
  - [Features](#features)
  - [Quickstart](#quickstart)
    - [Requirements](#requirements)
    - [Running the dev server](#running-the-dev-server)
    - [Running E2E Tests](#running-e2e-tests)
    - [Run localsafe.eth with Production Build](#run-localsafeeth-with-production-build)
    - [Deploying to IPFS](#deploying-to-ipfs)
    - [Anvil State Management: --dump-state \& --load-state](#anvil-state-management---dump-state----load-state)
  - [Developer Notes](#developer-notes)
  - [Deploying Safe Contracts Locally with `safe-smart-account`](#deploying-safe-contracts-locally-with-safe-smart-account)
  - [TODO](#todo)
  - [References](#references)
  - [Contributors](#contributors)

## Features

- **Safe Account Dashboard**: View Safe details, owners, threshold, nonce, and balance with enhanced UI organization.
- **Transaction Workflow**: Create, import, export, and execute Safe transactions with improved collaboration tools.
- **WalletConnect Integration**: Sign messages and transactions from dApps via WalletConnect v2.
- **IPFS Deployment**: Automated deployment to IPFS via Pinata when creating GitHub releases.
- **SafeWallet Data Import/Export**: Backup and restore address book, visited accounts, and undeployed safes.
- **Calldata Decoding**: Decode transaction calldata directly in the UI for better transparency.
- **Collaboration Tools**: Easy sharing of transactions, signatures, and links with organized dropdown menus.
- **Wallet Connection**: MetaMask and RainbowKit integration with multiple wallet support.
- **Client-Side State**: All wallet and Safe logic is handled client-side using wagmi, RainbowKit, and Safe Protocol Kit.
- **Hash-Based Routing**: Uses React Router with hash-based routing for static IPFS deployment compatibility.

## Quickstart

### Requirements

- Node.js v18+
- pnpm
- Anvil (for E2E tests)

### Running the dev server

1. Install [pnpm](https://pnpm.io/installation).

2. Clone the repository and install dependencies:

```bash
  git clone https://github.com/cyfrin/localsafe.eth
  cd localsafe.eth
  pnpm install
```

3. Create a `.env` file in the root (take `.env.example` as a reference):

```ini
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
```

4. Start the development server:

```bash
  pnpm dev
```

5. Open your browser and navigate to `http://localhost:3000`.

### Running E2E Tests

E2E tests use [Playwright](https://playwright.dev/) with [@wonderland/walletless](https://github.com/defi-wonderland/walletless) for wallet automation. This approach eliminates the need for MetaMask browser extension automation, making tests faster and more reliable.

1. Ensure you have [Anvil](https://getfoundry.sh/) installed and updated.

2. Install Playwright dependencies:

```bash
pnpm exec playwright install --with-deps
```

3. Run the E2E tests (starts Anvil automatically):

```bash
pnpm run test:e2e
```

4. For UI mode (useful for debugging):

```bash
pnpm run test:e2e:ui
```

> **Note:** UI mode requires Anvil to be running in a separate terminal: `pnpm run anvil`

**How it works:**

- Tests set `E2E_MODE=true` in localStorage, which triggers the app to use the `e2eConnector` from `@wonderland/walletless`
- The e2eConnector provides a virtual wallet that auto-signs transactions using Anvil's first test account
- No MetaMask or browser extension is needed - all wallet interactions are handled programmatically

**Utility commands:**

- `pnpm run test:clean` - Kill any stray next-server or anvil processes

### Run localsafe.eth with Production Build

To run the app with a production build locally and run the optimized version:

```bash
  pnpm run localsafe
```

### Deploying to IPFS

LocalSafe can be automatically deployed to IPFS via Pinata when you create a GitHub release or push a version tag. See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete setup instructions.

**Quick Deploy:**
```bash
# Create and push a version tag
git tag v0.2.0
git push origin v0.2.0

# Or create a GitHub Release via the UI
```

The deployment workflow will:
1. Build the static site (`pnpm run build`)
2. Deploy to IPFS via Pinata
3. Output the IPFS CID and gateway URLs in the GitHub Actions logs

**Access your deployment:**
- Pinata Gateway: `https://gateway.pinata.cloud/ipfs/<CID>`
- IPFS Gateway: `https://ipfs.io/ipfs/<CID>`
- Cloudflare IPFS Gateway: `https://cloudflare-ipfs.com/ipfs/<CID>`

### Anvil State Management: --dump-state & --load-state

To ensure deterministic E2E tests, we use Anvil's state management to save and restore a chain with pre-deployed Safe contracts.

**To create a new state file:**

1. Start Anvil with the `--dump-state` flag (state will be saved when Anvil exits):
   ```sh
   anvil --dump-state ./anvil-safe-state.json
   ```
2. In another terminal, deploy the Safe contracts (see [Deploying Safe Contracts Locally](#deploying-safe-contracts-locally-with-safe-smart-account))
3. Stop Anvil (Ctrl+C) to save the state to the JSON file

**To restore the state for testing:**

```sh
anvil --load-state ./anvil-safe-state.json --block-time 1
```

The test runner script and package.json use this approach:
```json
"anvil": "anvil --load-state ./anvil-safe-state.json --block-time 1",
"test:e2e": "bash tests/scripts/start-anvil-and-test.sh"
```

> **Warning:** Anvil state files may not be compatible across different Foundry versions. If `--load-state` fails with your current Anvil version, you'll need to regenerate the state file by deploying the Safe contracts fresh.
<!-- 
### Example: Test Runner Script

```bash
echo "[E2E] Running E2E tests with Anvil"
#!/bin/bash
set -e

# Run E2E tests (Synpress and Playwright)
USE_XVFB=1
ARGS=()
for arg in "$@"; do
  if [ "$arg" == "--ui" ]; then
    USE_XVFB=0
  fi
  ARGS+=("$arg")
done

if [ "$USE_XVFB" -eq 1 ]; then
  echo "[E2E] Running in headless mode (xvfb)"
  echo "[E2E] Starting Anvil in the background..."
  echo ""
  # Start Anvil in the background
  anvil --load-state ./anvil-safe-state.json --block-time 1 > /dev/null 2>&1 &
  ANVIL_PID=$!

  trap "kill $ANVIL_PID" EXIT
  xvfb-run --auto-servernum pnpm exec synpress
  xvfb-run --auto-servernum pnpm exec playwright test "${ARGS[@]}"
else
  # You need to run anvil manually in another terminal if using --ui
  # useful if you need to restart anvil without restarting tests
  echo "[E2E] Running in UI mode (--ui)"
  echo "[E2E] Ensure Anvil is running in another terminal:"
  echo "      pnpm run anvil"
  echo ""
  pnpm exec synpress
  pnpm exec playwright test "${ARGS[@]}"
fi

```

### Example: Playwright Test (export)

```typescript
const exportBtn = page.locator('[data-testid="safe-dashboard-export-tx-btn"]');
await exportBtn.waitFor({ state: "visible" });
// Instead of waiting for download, use page.evaluate to get the exported JSON
const exportedJson = await page.evaluate(() => {
  // Expose exportTx to window for testing, or call directly if possible
  return window.exportTx && window.exportTx(window.safeAddress);
});
expect(exportedJson).toContain("expected data");
``` -->

## Developer Notes

- **Client-Side Architecture**: All wallet and Safe logic is handled client-side for maximum privacy and flexibility.
- **Hash-Based Routing**: Uses React Router with hash-based routing (`HashRouter`) to ensure compatibility with static IPFS deployments where server-side routing is not available.
- **Modular Structure**: The project structure is modular, with reusable components and hooks for maintainability.
- **WalletConnect Integration**: WalletConnect v2 is integrated for dApp connections and signing requests. Session data is persisted in localStorage.
- **E2E Testing**: Uses Playwright with `@wonderland/walletless` for headless wallet automation. No MetaMask extension required.
- **Process Cleanup**: Sometimes `next-server` and `anvil` processes may remain running in the background. Use `pnpm run test:clean` to kill them.
- **Local Contract Deployment**: For deploying Safe contracts locally, see the instructions below.

## Deploying Safe Contracts Locally with `safe-smart-account`

To run your own local Safe contracts for development, follow these steps:

1. **Clone the Repository**
   ```sh
   git clone https://github.com/safe-global/safe-smart-account.git
   cd safe-smart-account
   ```
2. **Checkout the Correct Version**
   ```sh
   git checkout tags/v1.4.1-3
   ```
3. **Install Dependencies and Build**
   ```sh
   npm install
   npm run build
   ```
4. **Start a Local Anvil Node**
   ```sh
   anvil
   ```
5. **Create a `.env` File**
   ```ini
   MNEMONIC="test test test test test test test test test test test junk"
   NODE_URL="http://127.0.0.1:8545"
   ```
6. **Deploy Contracts**
   ```sh
   npm run deploy-all custom
   ```
7. **Update Contract Addresses**
   - After deployment, copy the contract addresses from the output and update them in your project’s `utils/contractNetworks.ts` file.

> **Note:**
> Currently, contract addresses are manually maintained in `utils/contractNetworks.ts`. In the future, we may automate this process or use environment variables for better flexibility.

## TODO

- [ ] Improve devcontainer setup for E2E tests; currently, UI mode has limitations.
- [ ] Ensure smooth DX when switching between local and devcontainer environments and wild processes cleaning (next-server, anvil).
- [ ] Adapt for different SafeWallet contract versions (currently optimized for 1.4.1-3).
- [ ] Automate `version` value in `DEFAULT_SAFE_WALLET_DATA` constant (`app/utils/constants.ts` hardcoded to `3.0.0` now).
- [ ] Add ENS name resolution for addresses in the UI.
- [ ] Implement transaction history and filtering.


- [ ] Extract out the EIP-712 data to it's own component for reusability.
- [ ] Run linter


## References

- [SafeSDK: Protocol Kit](https://docs.safe.global/sdk/protocol-kit)
- [wagmi](https://wagmi.sh/)
- [RainbowKit](https://www.rainbowkit.com/)
- [WalletConnect](https://walletconnect.com/)
- [React Router](https://reactrouter.com/)
- [@wonderland/walletless](https://github.com/defi-wonderland/walletless)
- [Playwright](https://playwright.dev/)
- [Foundry](https://getfoundry.sh/)
- [Pinata](https://pinata.cloud/)
- [IPFS](https://ipfs.tech/)
- [Tailwind CSS](https://tailwindcss.com/)
- [DaisyUI](https://daisyui.com/)

## Contributors

Special thanks to all contributors!

<a href="https://github.com/cyfrin/localsafe.eth/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=cyfrin/localsafe.eth" />
</a>
