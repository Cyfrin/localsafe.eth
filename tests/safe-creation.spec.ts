import { test, expect } from "./utils/fixture";

test.beforeEach("Setup", async ({ page, connectWallet }) => {
  // Go to home page
  await page.goto("/");

  // Connect the E2E wallet (this clicks continue and navigates to accounts)
  await connectWallet();

  // Click navigation button to go to safe creation page
  await page.waitForSelector('[data-testid="create-safe-nav-btn"]', {
    timeout: 60000,
  });
  await page.getByTestId("create-safe-nav-btn").click();
});

// Safe creation workflow test for SafeCreation page
test("should create a new safe account and navigate to dashboard", async ({ page }) => {
  // Step 1: Fill in safe name and select network (StepNameAndNetworks)
  await page.waitForSelector('[data-testid="safe-name-input"]', {
    timeout: 60000,
  });
  await page.getByTestId("safe-name-input").fill("Test Safe");

  // Select Anvil network badge button if available, otherwise select first
  const anvilBtn = page.locator('input[data-testid^="network-badge-btn-"][aria-label*="anvil" i]');
  if ((await anvilBtn.count()) > 0) {
    await anvilBtn.first().click();
  } else {
    const networkBtn = page.locator('input[data-testid^="network-badge-btn-"]').first();
    await networkBtn.click();
  }

  // Click Next to go to signers step
  await page.locator('button.btn-primary:has-text("Next")').click();

  // Step 2: Add signer (StepSigners)
  // Fill first owner input
  await page.waitForSelector('[data-testid="signer-input-0"]', {
    timeout: 60000,
  });
  await page.getByTestId("signer-input-0").fill("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");

  // Set threshold (if needed)
  await page.getByTestId("threshold-input").fill("1");

  // Click Next to go to review step
  await page.locator('button.btn-primary:has-text("Next")').click();

  // Step 3: Review & create
  const details = page.getByTestId("safe-details-root");
  await expect(details.getByTestId("safe-details-name")).toHaveText("Test Safe");
  await expect(details.getByTestId("safe-details-networks")).not.toContainText("None selected");
  await expect(details.getByTestId("safe-details-signers")).toBeVisible();
  // UI shows truncated address like "1. 0xf39f...2266"
  await expect(details.getByTestId("safe-details-signer-0")).toContainText("0xf39f");
  await expect(details.getByTestId("safe-details-signer-0")).toContainText("2266");
  await expect(details.getByTestId("safe-details-threshold-value")).toContainText("1 / 1");

  // Wait for prediction to finish and assert predicted address
  await page.waitForSelector('[data-testid="predicted-safe-address-value"]', {
    timeout: 60000,
  });
  await expect(page.getByTestId("predicted-safe-address-value")).toBeVisible();
  await expect(page.getByTestId("predicted-safe-address-value")).not.toHaveText("0x");

  // Click Deploy New Safe
  await page.getByTestId("create-safe-btn").click();

  // Wait for deployment modal and assert modal content
  await page.waitForSelector('[data-testid="deployment-modal-root"]', {
    timeout: 60000,
  });
  const modal = page.getByTestId("deployment-modal-root");
  await expect(modal.getByTestId("deployment-modal-title")).toHaveText("Workflow Progress");
  await expect(modal.getByTestId("deployment-modal-steps-list")).toBeVisible();

  // With e2eConnector, transactions are auto-signed so fast that loading states may not be visible
  // Wait directly for the confirmed step to have success status
  const stepConfirmed = page.getByTestId("deployment-modal-step-confirmed");
  await stepConfirmed.waitFor({ state: "visible", timeout: 60000 });
  await expect(stepConfirmed).toHaveClass(/step-success/);

  // Check that txHash is visible and not N/A
  const txHashLocator = modal.getByTestId("deployment-modal-txhash");
  await expect(txHashLocator).toBeVisible();
  await expect(txHashLocator).not.toHaveText("N/A");

  // Wait for success button to appear and click it
  await page.waitForSelector('[data-testid="deployment-modal-success-btn"]', {
    timeout: 60000,
  });
  await page.getByTestId("deployment-modal-success-btn").click();

  // Assert navigation to dashboard and safe appears (hash-based routing)
  await page.waitForURL("**/#/accounts");
  await expect(page.getByTestId("safe-accounts-table")).toBeVisible();
  await expect(page.getByTestId("safe-accounts-table")).toContainText("Test Safe");

  // Optionally check that the new safe row exists
  await expect(page.locator('[data-testid^="safe-account-row-"]')).toContainText("Test Safe");
});

test("should save undeployed safe config for Sepolia and Anvil networks", async ({ page }) => {
  // Step 1: Fill in safe name and select Sepolia + Anvil networks
  await page.waitForSelector('[data-testid="safe-name-input"]', {
    timeout: 60000,
  });
  await page.locator('[data-testid="safe-name-input"]').fill("MultiNet Safe");

  // Select Sepolia network badge button
  const sepoliaBtn = page.locator('input[data-testid^="network-badge-btn-"][aria-label*="sepolia" i]');
  if ((await sepoliaBtn.count()) > 0) {
    await sepoliaBtn.first().click();
  }

  // Select Anvil network badge button
  const anvilBtn = page.locator('input[data-testid^="network-badge-btn-"][aria-label*="anvil" i]');
  if ((await anvilBtn.count()) > 0) {
    await anvilBtn.first().click();
  }

  // Click Next to go to signers step
  await page.locator('button.btn-primary:has-text("Next")').click();

  // Step 2: Add signer (StepSigners)
  await page.waitForSelector('[data-testid="signer-input-0"]', {
    timeout: 60000,
  });
  await page.locator('[data-testid="signer-input-0"]').fill("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");

  // Set threshold
  await page.locator('[data-testid="threshold-input"]').fill("1");

  // Click Next to go to review step
  await page.locator('button.btn-primary:has-text("Next")').click();

  // Step 3: Review & create
  const details = page.locator('[data-testid="safe-details-root"]');
  await expect(details.locator('[data-testid="safe-details-name"]')).toHaveText("MultiNet Safe");
  await expect(details.locator('[data-testid="safe-details-networks"]')).toContainText("Sepolia");
  await expect(details.locator('[data-testid="safe-details-networks"]')).toContainText("Anvil");
  await expect(details.locator('[data-testid="safe-details-signers"]')).toBeVisible();
  // UI shows truncated address like "1. 0xf39f...2266"
  await expect(details.locator('[data-testid="safe-details-signer-0"]')).toContainText("0xf39f");
  await expect(details.locator('[data-testid="safe-details-signer-0"]')).toContainText("2266");
  await expect(details.locator('[data-testid="safe-details-threshold-value"]')).toContainText("1 / 1");

  // Wait for prediction to finish and assert predicted address
  await page.waitForSelector('[data-testid="predicted-safe-address-value"]', {
    timeout: 60000,
  });
  await expect(page.locator('[data-testid="predicted-safe-address-value"]')).toBeVisible();
  await expect(page.locator('[data-testid="predicted-safe-address-value"]')).not.toHaveText("0x");

  // Click Save Configuration (multi-chain flow)
  await page.locator('[data-testid="add-accounts-btn"]').click();

  // Wait to be navigated back to accounts page with undeployed view
  await page.waitForURL("**/#/accounts?view=undeployed");

  // Assert undeployed safe appears in the list (view is automatically set to undeployed)
  await expect(page.locator('[data-testid^="safe-account-row-"]')).toContainText("MultiNet Safe");
});
