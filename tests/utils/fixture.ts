import { test as base, expect, Page } from "@playwright/test";

/**
 * Extended Playwright test fixture for E2E testing with @wonderland/walletless.
 *
 * This fixture:
 * - Sets E2E_MODE in localStorage to enable the e2eConnector in WagmiConfigProvider
 * - Auto-connects the wallet (no MetaMask interaction needed)
 * - Provides helper methods for common wallet operations
 */
/** Options for deploying a test Safe */
export interface DeployTestSafeOptions {
  /** Name for the Safe (default: "Test Safe") */
  name?: string;
  /** Owner addresses (default: [account1]) */
  owners?: string[];
  /** Signing threshold (default: 1) */
  threshold?: number;
}

export const test = base.extend<{
  /** Connect the E2E wallet to the app */
  connectWallet: () => Promise<void>;
  /** Deploy a new Safe via the UI and return its address */
  deployTestSafe: (options?: DeployTestSafeOptions) => Promise<string>;
  /** Switch the E2E wallet to a different chain */
  setChain: (chainId: number) => Promise<void>;
}>({
  // Set up E2E mode before each test
  page: async ({ page }, use) => {
    // Enable E2E mode before navigating to any page
    await page.addInitScript(() => {
      localStorage.setItem("E2E_MODE", "true");
    });

    await use(page);
  },

  // Helper to connect the wallet in the UI
  connectWallet: async ({ page }, use) => {
    const connectWallet = async () => {
      // In E2E mode with walletless, the e2eConnector auto-connects
      // Wait for page to load and check if continue button exists
      await page.waitForLoadState("domcontentloaded");

      const continueBtn = page.getByTestId("continue-with-account");

      // Wait for the button to appear (with timeout), then click it
      try {
        await continueBtn.waitFor({ state: "visible", timeout: 10000 });
        await continueBtn.click();
        await page.waitForURL("**/#/accounts", { timeout: 30000 });
      } catch {
        // If button doesn't appear, we might already be on accounts page
        // or somewhere else - just wait for page to stabilize
      }

      await page.waitForLoadState("networkidle");
    };

    await use(connectWallet);
  },

  // Helper to deploy a new Safe via the UI
  deployTestSafe: async ({ page }, use) => {
    const deployTestSafe = async (options: DeployTestSafeOptions = {}): Promise<string> => {
      const { name = "Test Safe", owners = [ANVIL_ACCOUNTS.account1], threshold = 1 } = options;

      // Navigate to create safe page
      await page.getByTestId("create-safe-nav-btn").click();

      // Fill in safe name
      await page.waitForSelector('[data-testid="safe-name-input"]', { timeout: 60000 });
      await page.getByTestId("safe-name-input").fill(name);

      // Select Anvil network
      const anvilBtn = page.locator('input[data-testid^="network-badge-btn-"][aria-label*="anvil" i]');
      if ((await anvilBtn.count()) > 0) {
        await anvilBtn.first().click();
      }

      // Click Next to go to signers step
      await page.locator('button.btn-primary:has-text("Next")').click();

      // Fill owner inputs
      await page.waitForSelector('[data-testid="signer-input-0"]', { timeout: 60000 });
      for (let i = 0; i < owners.length; i++) {
        // Add new signer input if needed (after the first one)
        if (i > 0) {
          await page.getByTestId("add-owner-btn").click();
          await page.waitForSelector(`[data-testid="signer-input-${i}"]`, { timeout: 10000 });
        }
        await page.getByTestId(`signer-input-${i}`).fill(owners[i]);
      }

      // Set threshold
      await page.getByTestId("threshold-input").fill(String(threshold));

      // Click Next to go to review step
      await page.locator('button.btn-primary:has-text("Next")').click();

      // Wait for prediction to finish and capture the predicted address
      await page.waitForSelector('[data-testid="predicted-safe-address-value"]', { timeout: 60000 });
      const predictedAddressElement = page.getByTestId("predicted-safe-address-value");
      await expect(predictedAddressElement).toBeVisible();

      // Get the full predicted address from the data-address attribute
      const predictedAddress = await predictedAddressElement.getAttribute("data-address");
      if (!predictedAddress || !predictedAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        throw new Error(`Invalid predicted address: ${predictedAddress}`);
      }

      // Click Deploy New Safe
      await page.getByTestId("create-safe-btn").click();

      // Wait for deployment modal and success
      await page.waitForSelector('[data-testid="deployment-modal-root"]', { timeout: 60000 });
      const stepConfirmed = page.getByTestId("deployment-modal-step-confirmed");
      await stepConfirmed.waitFor({ state: "visible", timeout: 60000 });
      await expect(stepConfirmed).toHaveClass(/step-success/);

      // Click success button to go back to accounts
      await page.waitForSelector('[data-testid="deployment-modal-success-btn"]', { timeout: 60000 });
      await page.getByTestId("deployment-modal-success-btn").click();

      // Wait for navigation back to accounts
      await page.waitForURL("**/#/accounts");
      await expect(page.getByTestId("safe-accounts-table")).toBeVisible();

      return predictedAddress;
    };

    await use(deployTestSafe);
  },

  // Helper to switch chains in E2E mode
  setChain: async ({ page }, use) => {
    const setChain = async (chainId: number) => {
      await page.evaluate((id) => window.__e2e?.setChain(id), chainId);
      // Wait for chain change to propagate through wagmi
      await page.waitForTimeout(500);
    };
    await use(setChain);
  },
});

export { expect };

// Anvil chain IDs for multi-chain testing
export const ANVIL_CHAIN_IDS = {
  anvil: 31337,
  anvilTwo: 31338,
} as const;

// Re-export Anvil test account addresses for convenience
export const ANVIL_ACCOUNTS = {
  account1: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  account2: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  account3: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  account4: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  account5: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  account6: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  account7: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
  account8: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
  account9: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
  account10: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
} as const;
