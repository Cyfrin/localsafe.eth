import { test, expect } from "./utils/fixture";

/**
 * This test verifies the "Add Existing Safe" flow works correctly.
 * It first deploys a new Safe via the UI, then uses the "Add Existing Safe"
 * form to connect to it again (simulating adding a Safe that exists on-chain).
 */
test("should connect (add) existing Safe account using ConnectSafeClient", async ({
  page,
  connectWallet,
  deployTestSafe,
}) => {
  await page.goto("/");

  // Connect the E2E wallet (this clicks continue and navigates to accounts)
  await connectWallet();

  // Verify we're on the accounts page before proceeding
  await expect(page).toHaveURL(/\/#\/accounts$/);
  await expect(page.getByTestId("safe-accounts-table")).toBeVisible();

  // ============================================
  // STEP 1: Deploy a new Safe via the shared fixture
  // ============================================
  const deployedAddress = await deployTestSafe({ name: "Deployed Test Safe" });

  // Verify the deployed safe appears
  await expect(page.getByTestId("safe-accounts-table")).toContainText("Deployed Test Safe");

  // ============================================
  // STEP 2: Clear app storage and reconnect to the Safe
  // ============================================

  // Clear the app's localStorage to simulate a fresh state
  // The Safe still exists on-chain, but the app doesn't know about it
  await page.evaluate(() => {
    localStorage.removeItem("MSIGUI_safeWalletData");
  });

  // Reload the page to pick up the cleared storage
  await page.reload();
  await connectWallet();

  // Verify we're back on accounts page with no safes
  await expect(page).toHaveURL(/\/#\/accounts$/);
  await expect(page.getByTestId("safe-accounts-table")).toBeVisible();

  // ============================================
  // STEP 3: Connect to the deployed Safe using "Add Existing Safe"
  // ============================================

  // Click on "Add Existing Safe" button
  await page.getByTestId("add-safe-nav-btn").click();

  // Fill in the form with the deployed safe's address
  await page.waitForSelector('[data-testid="safe-name-input"]', { timeout: 60000 });
  await page.getByTestId("safe-name-input").fill("Reconnected Safe");
  await page.getByTestId("safe-address-input").fill(deployedAddress);
  await page.getByTestId("network-select").selectOption({ label: "Anvil" });

  // Click Add Safe button
  await page.getByTestId("add-safe-btn").click();

  // Should successfully add the safe and navigate to accounts
  await page.waitForURL("**/#/accounts");
  await expect(page.getByTestId("safe-accounts-table")).toBeVisible();

  // Verify the reconnected safe appears with the new name
  await expect(page.getByTestId("safe-accounts-table")).toContainText("Reconnected Safe");

  // Verify the safe address is in the list
  const safeRow = page.locator(`[data-testid^="safe-account-row-"]`);
  await expect(safeRow).toBeVisible();
});
