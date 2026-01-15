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

  // Fill in a simple ETH transfer (0 value to avoid needing ETH in Safe)
  await page.getByTestId("new-safe-tx-recipient-input").fill("0x1111111111111111111111111111111111111111");
  await page.getByTestId("new-safe-tx-value-input").fill("0");
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

  // Sign transaction with account 1
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

test("should sign with multiple accounts and broadcast when threshold is met", async ({ page }) => {
  // First create a transaction via the builder
  await page.getByTestId("safe-dashboard-go-to-builder-btn").click();

  // Fill in a simple ETH transfer (0 value to avoid needing ETH in Safe)
  await page.getByTestId("new-safe-tx-recipient-input").fill("0x1111111111111111111111111111111111111111");
  await page.getByTestId("new-safe-tx-value-input").fill("0");
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

  // Sign transaction with account 1 (index 0)
  const signBtn = page.locator('[data-testid="tx-details-sign-btn"]');
  await signBtn.waitFor({ state: "visible" });
  await signBtn.click();

  // Wait for first signature
  await expect(page.locator('[data-testid="tx-details-signatures-row"]')).toContainText("Sig 1:", { timeout: 10000 });
  await expect(signBtn).toBeDisabled();

  // Switch to account 2 (index 1) using walletless setSigningAccount
  await page.evaluate(async () => {
    console.log("[E2E] Calling setSigningAccount(1)");
    await window.__e2e?.setSigningAccount(1);
  });

  // Wait for wagmi to process the accountsChanged event
  await page.waitForTimeout(2000);

  // After switching accounts, account 2 is the last signer needed (threshold=2, 1 sig exists)
  // This triggers canExecuteDirectly=true which shows a dropdown instead of simple button

  // Wait for the dropdown trigger button to be enabled
  const signDropdownTrigger = page.getByTestId("tx-details-sign-dropdown-btn");
  await expect(signDropdownTrigger).toBeEnabled({ timeout: 10000 });

  // Click to open the dropdown
  await signDropdownTrigger.click();

  // Click "Sign Transaction" option in the dropdown
  const signOption = page.getByTestId("tx-details-sign-option-btn");
  await signOption.waitFor({ state: "visible" });
  await signOption.click();

  // Wait for second signature
  await expect(page.locator('[data-testid="tx-details-signatures-row"]')).toContainText("Sig 2:", { timeout: 10000 });

  // Now broadcast should be enabled (threshold of 2 met)
  const broadcastBtn = page.locator('[data-testid="tx-details-broadcast-btn"]');
  await expect(broadcastBtn).toBeEnabled({ timeout: 5000 });

  // Click broadcast
  await broadcastBtn.click();

  // Wait for broadcast success modal
  await page.waitForSelector('[data-testid="tx-details-broadcast-modal"]', { timeout: 30000 });
  await expect(page.getByTestId("broadcast-modal-txhash-row")).toBeVisible();
});
