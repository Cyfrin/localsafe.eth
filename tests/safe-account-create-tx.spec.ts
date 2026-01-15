import { test, expect } from "./utils/fixture";

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
    deployedSafeAddress = await deployTestSafe({ name: "Create Tx Test Safe" });
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
  await expect(page.getByTestId("safe-accounts-table")).toContainText("Create Tx Test Safe");

  // Navigate to the Safe dashboard using partial address matching
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

  // Wait for dashboard to load and go to builder
  await expect(page.getByTestId("safe-dashboard-threshold")).toBeVisible();
  await page.getByTestId("safe-dashboard-go-to-builder-btn").click();
});

// Transaction workflow test for Safe page
test("should create and execute a transaction from Safe dashboard", async ({ page }) => {
  // Fill transaction details (0-value call to test execution without needing ETH in Safe)
  await page.getByTestId("new-safe-tx-recipient-input").fill("0x44586c5784a07Cc85ae9f33FCf6275Ea41636A87");
  await page.getByTestId("new-safe-tx-value-input").fill("0");
  const addTxBtn = page.getByTestId("new-safe-tx-add-btn");

  await expect(addTxBtn).toBeEnabled();
  await addTxBtn.click();

  // Wait for transaction to appear in the list
  await expect(page.getByTestId("new-safe-tx-list-row-0")).toBeVisible();

  // Build Safe Transaction
  const buildBtn = page.getByTestId("new-safe-tx-build-btn");
  await expect(buildBtn).toBeEnabled();
  await buildBtn.click();

  // Wait for redirect to tx details page and check details
  await page.waitForSelector('[data-testid="tx-details-section"]', {
    state: "visible",
  });
  await expect(page.getByTestId("tx-details-to-value")).toHaveText("0x44586c5784a07Cc85ae9f33FCf6275Ea41636A87");
  await expect(page.getByTestId("tx-details-value-value")).toHaveText("0");

  // For threshold=1 Safe, the UI shows a dropdown with "Sign Transaction" and "Execute Transaction" options
  // Click the dropdown button to open it
  const signDropdownBtn = page.locator('.dropdown button.btn-success:has-text("Sign Transaction")');
  await signDropdownBtn.waitFor({ state: "visible", timeout: 30000 });
  await signDropdownBtn.click();

  // Click "Execute Transaction" option to sign and execute in one step
  const executeOption = page.locator('.dropdown-content button:has-text("Execute Transaction")');
  await executeOption.waitFor({ state: "visible" });
  await executeOption.click();

  // Wait for broadcast success modal to appear with tx hash (confirms execution)
  await page.waitForSelector('[data-testid="tx-details-broadcast-modal"]', { timeout: 30000 });
  await expect(page.getByTestId("broadcast-modal-txhash-row")).toBeVisible();
});

test("should create transactions with all input variations in builder", async ({ page }) => {
  // 1. Basic ETH transfer
  await page.getByTestId("new-safe-tx-recipient-input").fill("0x1111111111111111111111111111111111111111");
  await page.getByTestId("new-safe-tx-value-input").fill("0.5");
  const addTxBtn = page.getByTestId("new-safe-tx-add-btn");
  await expect(addTxBtn).toBeEnabled();
  await addTxBtn.click();
  await expect(page.getByTestId("new-safe-tx-list-row-0")).toBeVisible();

  // 2. With Data Hex
  await page.getByTestId("new-safe-tx-recipient-input").fill("0x2222222222222222222222222222222222222222");
  await page.getByTestId("new-safe-tx-value-input").fill("1");
  await page.getByTestId("new-safe-tx-data-toggle").click();
  await page.getByTestId("new-safe-tx-data-input").fill("0xdeadbeef");
  await expect(addTxBtn).toBeEnabled();
  await addTxBtn.click();
  await expect(page.getByTestId("new-safe-tx-list-row-1")).toBeVisible();

  // 3. With ABI method (stateMutability is required for the UI to show the method)
  const abiJson = JSON.stringify([
    {
      type: "function",
      name: "transfer",
      stateMutability: "nonpayable",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
    },
  ]);
  await page.getByTestId("new-safe-tx-abi-input").fill(abiJson);
  // Wait for ABI to be parsed and select to appear
  await page.waitForSelector('[data-testid="new-safe-tx-abi-methods-select"]', { state: "visible", timeout: 10000 });
  await page.getByTestId("new-safe-tx-abi-methods-select").selectOption("transfer(address,uint256)");
  await page.getByTestId("new-safe-tx-abi-method-input-to").fill("0x3333333333333333333333333333333333333333");
  await page.getByTestId("new-safe-tx-abi-method-input-amount").fill("12345");
  await page.getByTestId("new-safe-tx-recipient-input").fill("0x3333333333333333333333333333333333333333");
  await page.getByTestId("new-safe-tx-value-input").fill("2");
  await expect(addTxBtn).toBeEnabled();
  await addTxBtn.click();
  await expect(page.getByTestId("new-safe-tx-list-row-2")).toBeVisible();

  // 4. With method but no inputs
  const abiJsonNoInputs = JSON.stringify([
    {
      type: "function",
      name: "ping",
      stateMutability: "nonpayable",
      inputs: [],
    },
  ]);
  await page.getByTestId("new-safe-tx-abi-input").fill(abiJsonNoInputs);
  // Wait for ABI to be parsed and select to update
  await page.waitForSelector('[data-testid="new-safe-tx-abi-methods-select"]', { state: "visible", timeout: 10000 });
  await page.getByTestId("new-safe-tx-abi-methods-select").selectOption("ping()");
  await page.getByTestId("new-safe-tx-recipient-input").fill("0x4444444444444444444444444444444444444444");
  await page.getByTestId("new-safe-tx-value-input").fill("3");
  await expect(addTxBtn).toBeEnabled();
  await addTxBtn.click();
  await expect(page.getByTestId("new-safe-tx-list-row-3")).toBeVisible();

  // Check all rows are present
  for (let i = 0; i < 4; i++) {
    await expect(page.getByTestId(`new-safe-tx-list-row-${i}`)).toBeVisible();
  }
});
