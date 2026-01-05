import fs from "fs";
import { test, expect, ANVIL_ACCOUNTS } from "./utils/fixture";

// Store deployed safe address and wallet data across serial tests
let deployedSafeAddress: string;
let savedWalletData: string;

// Run tests serially so they can share state
test.describe.configure({ mode: "serial" });

test.beforeEach("Setup", async ({ page, connectWallet, deployTestSafe }) => {
  // Go to home page first
  await page.goto("/");

  // Connect the E2E wallet
  await connectWallet();

  // Deploy a Safe only once, then restore wallet data for subsequent tests
  if (!deployedSafeAddress) {
    deployedSafeAddress = await deployTestSafe({ name: "Dashboard Test Safe" });
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
});

// Helper to navigate to the Safe dashboard
async function navigateToSafeDashboard(page: import("@playwright/test").Page, safeAddress: string) {
  // Wait for the Safe to appear in the table
  await expect(page.getByTestId("safe-accounts-table")).toContainText("Dashboard Test Safe");

  // Use case-insensitive regex since address may be checksummed
  const safeRow = page.locator(`[data-testid^="safe-account-row-"]`).filter({
    has: page.locator(`text=${safeAddress.slice(0, 10)}`),
  });
  await safeRow.first().waitFor({ state: "visible" });
  const collapseCheckbox = safeRow.first().locator('[data-testid="safe-account-collapse"]');
  await collapseCheckbox.waitFor({ state: "visible" });
  await collapseCheckbox.click();

  const safeRowLink = safeRow.first().locator(`[data-testid^="safe-account-link-"]`).first();
  await safeRowLink.waitFor({ state: "visible" });
  await safeRowLink.click();

  // Wait for dashboard to load
  await expect(page.getByTestId("safe-dashboard-threshold")).toBeVisible();
}

// Transaction workflow test for Safe page
test("should redirect to safe dashboard on click on account row", async ({ page }) => {
  await navigateToSafeDashboard(page, deployedSafeAddress);

  // Assert SafeDashboardClient key elements are visible
  await expect(page.getByTestId("safe-dashboard-threshold")).toBeVisible();
  await expect(page.getByTestId("safe-dashboard-owners")).toBeVisible();
  await expect(page.getByTestId("safe-dashboard-nonce")).toBeVisible();
  await expect(page.getByTestId("safe-dashboard-balance")).toBeVisible();
  await expect(page.getByTestId("safe-dashboard-divider")).toBeVisible();
});

test("should export Safe transaction JSON and verify file content", async ({ page }) => {
  const TEST_RECIPIENT = "0x1111111111111111111111111111111111111111";

  // Navigate to Safe dashboard
  await navigateToSafeDashboard(page, deployedSafeAddress);

  // Create a transaction via the builder to have something to export
  await page.getByTestId("safe-dashboard-go-to-builder-btn").click();

  // Fill in a simple ETH transfer (value is in wei)
  await page.getByTestId("new-safe-tx-recipient-input").fill(TEST_RECIPIENT);
  await page.getByTestId("new-safe-tx-value-input").fill("1000000000000000"); // 0.001 ETH in wei
  const addTxBtn = page.getByTestId("new-safe-tx-add-btn");
  await expect(addTxBtn).toBeEnabled();
  await addTxBtn.click();

  // Build the transaction
  await expect(page.getByTestId("new-safe-tx-list-row-0")).toBeVisible();
  const buildBtn = page.getByTestId("new-safe-tx-build-btn");
  await expect(buildBtn).toBeEnabled();
  await buildBtn.click();

  // Wait for redirect to tx details page (URL changes to /safe/{address}/tx/{hash})
  // Use a longer timeout since building might take time
  await page.waitForURL(/\/safe\/.*\/tx\/.*/, { timeout: 60000 });
  await page.waitForSelector('[data-testid="tx-details-section"]', { state: "visible", timeout: 30000 });

  // Go back to dashboard to export
  await page.goto(`/#/safe/${deployedSafeAddress}`);
  await expect(page.getByTestId("safe-dashboard-threshold")).toBeVisible();

  // Export transaction
  const exportBtn = page.getByTestId("safe-dashboard-export-tx-btn");
  await exportBtn.waitFor({ state: "visible" });
  const [download] = await Promise.all([page.waitForEvent("download"), exportBtn.click()]);
  const exportPath = await download.path();
  expect(exportPath).toBeTruthy();

  // Read the downloaded file
  const fileContent = fs.readFileSync(exportPath!, "utf-8");
  const exportedTx = JSON.parse(fileContent);

  // Assert exported transaction structure and values (export format is { transactions: [...] })
  expect(exportedTx).toHaveProperty("transactions");
  expect(exportedTx.transactions[0].data.to.toLowerCase()).toBe(TEST_RECIPIENT.toLowerCase());
});

test("should import Safe transaction JSON and show in dashboard", async ({ page }) => {
  const CHAIN_ID = "31337";

  // Create mock transaction data using the deployed safe address
  const mockTxData = {
    data: {
      to: "0x2222222222222222222222222222222222222222",
      value: "2000000000000000000",
      data: "0x",
      operation: 0,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: "0x0000000000000000000000000000000000000000",
      refundReceiver: "0x0000000000000000000000000000000000000000",
      nonce: 0,
    },
    signatures: [
      {
        signer: ANVIL_ACCOUNTS.account1.toLowerCase(),
        data: "0xmocksignature",
        isContractSignature: false,
      },
    ],
  };

  // Seed localStorage with empty SafeTx map and restore wallet data before reload
  await page.evaluate((walletData) => {
    localStorage.setItem("MSIGUI_safeCurrentTxMap", JSON.stringify({}));
    localStorage.setItem("MSIGUI_safeWalletData", walletData);
  }, savedWalletData);
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Navigate to Safe dashboard
  await navigateToSafeDashboard(page, deployedSafeAddress);

  // Prepare a mock transaction file for import (using old single-tx format which is supported)
  const importFilePath = `/tmp/mock_safe_tx_import.json`;
  fs.writeFileSync(
    importFilePath,
    JSON.stringify({
      tx: mockTxData,
    }),
  );

  // Import transaction
  const importBtn = page.getByTestId("safe-dashboard-import-tx-btn");
  await importBtn.waitFor({ state: "visible" });
  const importInput = page.locator('[data-testid="safe-dashboard-import-tx-input"]');
  await importInput.setInputFiles(importFilePath);

  // Wait for import modal to appear and confirm
  const importModal = page.locator('[data-testid="safe-dashboard-import-tx-modal-root"]');
  await importModal.waitFor({ state: "visible" });
  const replaceBtn = importModal.locator('[data-testid="safe-dashboard-import-tx-modal-replace-btn"]');
  await replaceBtn.click();
  await importModal.waitFor({ state: "hidden" });

  // Wait a bit for the import to save to localStorage
  await page.waitForTimeout(1000);

  // Reload to ensure the imported transaction is reflected in the UI
  // (the import saves to localStorage but the allTxs state may not refresh automatically)
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Assert that the transaction is now present in the dashboard
  await expect(page.locator('[data-testid="safe-dashboard-current-tx-card"]')).toBeVisible({ timeout: 10000 });

  // Verify imported transaction data in localStorage (key format is address-chainId, value is array)
  const { txMap, key } = await page.evaluate(
    ({ safeAddress, chainId }) => {
      const raw = localStorage.getItem("MSIGUI_safeCurrentTxMap");
      const map = JSON.parse(raw ?? "{}");
      const key = `${safeAddress}-${chainId}`;
      return { txMap: map, key };
    },
    { safeAddress: deployedSafeAddress.toLowerCase(), chainId: CHAIN_ID },
  );

  // Find the actual key (might be checksummed differently)
  const actualKey = Object.keys(txMap).find((k) =>
    k.toLowerCase().includes(deployedSafeAddress.toLowerCase().slice(2)),
  );
  const importedTxMap = actualKey ? txMap[actualKey] : txMap[key];

  expect(importedTxMap).toBeDefined();
  expect(importedTxMap[0].data.to).toBe(mockTxData.data.to);
  expect(importedTxMap[0].signatures[0].signer).toBe(mockTxData.signatures[0].signer);
});
