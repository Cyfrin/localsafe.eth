import { test, expect, ANVIL_ACCOUNTS } from "./utils/fixture";

// Store deployed safe address and wallet data across serial tests
let deployedSafeAddress: string;
let savedWalletData: string;

// Run tests serially so they can share state
test.describe.configure({ mode: "serial" });

test.beforeEach("Setup Safe and Transaction", async ({ page, connectWallet, deployTestSafe }) => {
  // Go to home page first
  await page.goto("/");

  // Connect the E2E wallet
  await connectWallet();

  // Deploy a 3-owner, threshold-2 Safe only once, then restore wallet data for subsequent tests
  if (!deployedSafeAddress) {
    deployedSafeAddress = await deployTestSafe({
      name: "Sign Broadcast Test Safe",
      owners: [ANVIL_ACCOUNTS.account1, ANVIL_ACCOUNTS.account2, ANVIL_ACCOUNTS.account3],
      threshold: 2,
    });
    // Save the wallet data after deployment
    savedWalletData = await page.evaluate(() => {
      return localStorage.getItem("MSIGUI_safeWalletData") || "";
    });
  } else {
    // Restore saved wallet data for subsequent tests
    await page.evaluate((walletData) => {
      localStorage.setItem("MSIGUI_safeWalletData", walletData);
    }, savedWalletData);
    await page.reload();
    await page.waitForLoadState("networkidle");
  }

  // Wait for the Safe to appear in the table
  await expect(page.getByTestId("safe-accounts-table")).toContainText("Sign Broadcast Test Safe");

  // Navigate to Safe dashboard using partial address matching
  const safeRow = page.locator(`[data-testid^="safe-account-row-"]`).filter({
    has: page.locator(`text=${deployedSafeAddress.slice(0, 10)}`),
  });
  await safeRow.first().waitFor({ state: "visible" });
  const collapseCheckbox = safeRow.first().locator('[data-testid="safe-account-collapse"]');
  await collapseCheckbox.waitFor({ state: "visible" });
  await collapseCheckbox.click();

  const safeRowLink = safeRow.first().locator(`[data-testid^="safe-account-link-"]`).first();
  await safeRowLink.waitFor({ state: "visible" });
  await safeRowLink.click();

  await expect(page.getByTestId("safe-dashboard-threshold")).toBeVisible();
});

test("should sign a Safe transaction without executing (threshold not met)", async ({ page }) => {
  // First create a transaction via the builder
  await page.getByTestId("safe-dashboard-go-to-builder-btn").click();

  // Fill in a simple ETH transfer
  await page.getByTestId("new-safe-tx-recipient-input").fill("0x1111111111111111111111111111111111111111");
  await page.getByTestId("new-safe-tx-value-input").fill("1000000000000000"); // 0.001 ETH in wei
  const addTxBtn = page.getByTestId("new-safe-tx-add-btn");
  await expect(addTxBtn).toBeEnabled();
  await addTxBtn.click();

  // Build the transaction
  await expect(page.getByTestId("new-safe-tx-list-row-0")).toBeVisible();
  const buildBtn = page.getByTestId("new-safe-tx-build-btn");
  await expect(buildBtn).toBeEnabled();
  await buildBtn.click();

  // Wait for redirect to tx details page
  await page.waitForSelector('[data-testid="tx-details-section"]', { state: "visible" });

  // Check broadcast button is disabled (no signatures yet)
  const broadcastBtn = page.locator('[data-testid="tx-details-broadcast-btn"]');
  await broadcastBtn.waitFor({ state: "visible" });
  await expect(broadcastBtn).toBeDisabled();

  // Sign transaction
  const signBtn = page.locator('[data-testid="tx-details-sign-btn"]');
  await signBtn.waitFor({ state: "visible" });
  await signBtn.click();

  // With e2eConnector, signature is auto-confirmed
  // Assert signature added - wait for the signature row to appear
  await expect(page.locator('[data-testid="tx-details-signatures-row"]')).toContainText("Sig 1:", { timeout: 10000 });
  await expect(signBtn).toBeDisabled();
  await expect(signBtn).toHaveText("Already Signed");

  // Broadcast should still be disabled (threshold is 2, we only have 1 signature)
  await expect(broadcastBtn).toBeDisabled();
});

// Note: Full broadcast test would require switching accounts with @wonderland/walletless
// to add a second signature. For now, we test signing with a single account.
// A complete test would use setAccounts() from walletless to switch to account2,
// add a second signature, then broadcast.
