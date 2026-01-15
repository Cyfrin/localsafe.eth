import { test, expect, ANVIL_CHAIN_IDS, ANVIL_ACCOUNTS } from "./utils/fixture";

/**
 * Multi-chain Safe deployment tests using two local Anvil instances.
 *
 * These tests verify:
 * 1. Both Anvil chains are visible in network selection (E2E mode only)
 * 2. Multi-chain Safe config saves correctly with consistent address prediction
 * 3. Safe can be deployed on first chain
 * 4. Safe can be deployed on second chain after switching
 * 5. Same address is used on both chains
 */

test.describe("Multi-chain Safe deployment", () => {
  test.beforeEach("Setup", async ({ page, connectWallet }) => {
    await page.goto("/");
    await connectWallet();
    await page.waitForSelector('[data-testid="create-safe-nav-btn"]', {
      timeout: 60000,
    });
    await page.getByTestId("create-safe-nav-btn").click();
  });

  test("should show both Anvil chains in network selection", async ({ page }) => {
    await page.waitForSelector('[data-testid="safe-name-input"]', {
      timeout: 60000,
    });

    // Verify Anvil (31337) is visible
    const anvilBtn = page.locator('input[data-testid^="network-badge-btn-"][aria-label*="anvil" i]');
    await expect(anvilBtn.first()).toBeVisible();

    // Verify Anvil Two (31338) is visible in E2E mode
    const anvilTwoBtn = page.locator('input[data-testid^="network-badge-btn-"][aria-label*="anvil two" i]');
    await expect(anvilTwoBtn).toBeVisible();
  });

  test("should save multi-chain undeployed Safe config", async ({ page }) => {
    // Fill in safe name
    await page.waitForSelector('[data-testid="safe-name-input"]', {
      timeout: 60000,
    });
    await page.getByTestId("safe-name-input").fill("MultiChain Safe");

    // Select both Anvil networks
    const anvilBtn = page.locator('input[data-testid^="network-badge-btn-"][aria-label*="anvil" i]');
    const anvilTwoBtn = page.locator('input[data-testid^="network-badge-btn-"][aria-label*="anvil two" i]');

    // Click Anvil first (need to be specific to avoid matching "Anvil Two")
    const anvilExactBtn = page.locator(
      'input[data-testid^="network-badge-btn-"]:not([aria-label*="two" i])[aria-label*="anvil" i]',
    );
    if ((await anvilExactBtn.count()) > 0) {
      await anvilExactBtn.first().click();
    } else if ((await anvilBtn.count()) > 0) {
      await anvilBtn.first().click();
    }

    // Click Anvil Two
    if ((await anvilTwoBtn.count()) > 0) {
      await anvilTwoBtn.click();
    }

    // Click Next to go to signers step
    await page.locator('button.btn-primary:has-text("Next")').click();

    // Fill signer
    await page.waitForSelector('[data-testid="signer-input-0"]', {
      timeout: 60000,
    });
    await page.getByTestId("signer-input-0").fill(ANVIL_ACCOUNTS.account1);
    await page.getByTestId("threshold-input").fill("1");

    // Click Next to go to review step
    await page.locator('button.btn-primary:has-text("Next")').click();

    // Wait for prediction to finish
    await page.waitForSelector('[data-testid="predicted-safe-address-value"]', {
      timeout: 60000,
    });
    const predictedAddressElement = page.getByTestId("predicted-safe-address-value");
    await expect(predictedAddressElement).toBeVisible();

    // Verify the predicted address is valid (not zero address or empty)
    const predictedAddress = await predictedAddressElement.getAttribute("data-address");
    expect(predictedAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(predictedAddress).not.toBe("0x0000000000000000000000000000000000000000");

    // Verify both networks are shown in review
    const details = page.getByTestId("safe-details-root");
    await expect(details.getByTestId("safe-details-networks")).toContainText("Anvil");

    // Click Add accounts (multi-chain flow saves undeployed config)
    await page.getByTestId("add-accounts-btn").click();

    // Wait for navigation back to accounts page
    await page.waitForURL("**/#/accounts");

    // Toggle to show undeployed safes
    await page.getByTestId("toggle-deployed-undeployed").click();

    // Verify the Safe appears in the undeployed list
    await expect(page.locator('[data-testid^="safe-account-row-"]')).toContainText("MultiChain Safe");
  });

  test("should deploy Safe on first Anvil chain", async ({ page }) => {
    // Create multi-chain Safe config first
    await page.waitForSelector('[data-testid="safe-name-input"]', {
      timeout: 60000,
    });
    await page.getByTestId("safe-name-input").fill("Deploy Test Safe");

    // Select both Anvil networks
    const anvilExactBtn = page.locator(
      'input[data-testid^="network-badge-btn-"]:not([aria-label*="two" i])[aria-label*="anvil" i]',
    );
    const anvilTwoBtn = page.locator('input[data-testid^="network-badge-btn-"][aria-label*="anvil two" i]');

    if ((await anvilExactBtn.count()) > 0) {
      await anvilExactBtn.first().click();
    }
    if ((await anvilTwoBtn.count()) > 0) {
      await anvilTwoBtn.click();
    }

    await page.locator('button.btn-primary:has-text("Next")').click();

    await page.waitForSelector('[data-testid="signer-input-0"]', { timeout: 60000 });
    await page.getByTestId("signer-input-0").fill(ANVIL_ACCOUNTS.account1);
    await page.getByTestId("threshold-input").fill("1");

    await page.locator('button.btn-primary:has-text("Next")').click();

    // Wait for prediction
    await page.waitForSelector('[data-testid="predicted-safe-address-value"]', {
      timeout: 60000,
    });
    const predictedAddress = await page.getByTestId("predicted-safe-address-value").getAttribute("data-address");

    // Save as undeployed config
    await page.getByTestId("add-accounts-btn").click();
    await page.waitForURL("**/#/accounts");

    // Toggle to undeployed and find the Safe
    await page.getByTestId("toggle-deployed-undeployed").click();
    await expect(page.locator('[data-testid^="safe-account-row-"]')).toContainText("Deploy Test Safe");

    // Click on the Safe row to expand it (accordion)
    const safeRow = page.locator('[data-testid^="safe-account-row-"]').filter({
      hasText: "Deploy Test Safe",
    });
    await safeRow.locator('[data-testid="safe-account-collapse"]').click();

    // Click on the Anvil chain link inside the expanded accordion
    const chainLink = page.getByTestId(`safe-account-link-${predictedAddress}-${ANVIL_CHAIN_IDS.anvil}`);
    await expect(chainLink).toBeVisible({ timeout: 10000 });
    await chainLink.click();

    // Wait for Safe dashboard to load
    await page.waitForURL(`**/#/safe/${predictedAddress}**`);

    // Wait for the dashboard to load and show the Deploy Safe button
    // The chain link click above switched to Anvil chain (31337)
    const deployBtn = page.getByTestId("deploy-safe-btn");
    await expect(deployBtn).toBeVisible({ timeout: 30000 });
    await deployBtn.click();

    // Wait for deployment modal and success
    await page.waitForSelector('[data-testid="deployment-modal-root"]', { timeout: 60000 });
    const stepConfirmed = page.getByTestId("deployment-modal-step-confirmed");
    await stepConfirmed.waitFor({ state: "visible", timeout: 60000 });
    await expect(stepConfirmed).toHaveClass(/step-success/);

    // Click success button
    await page.getByTestId("deployment-modal-success-btn").click();
  });

  test("should deploy Safe on both chains with same address", async ({ page, setChain }) => {
    // Create multi-chain Safe config
    await page.waitForSelector('[data-testid="safe-name-input"]', {
      timeout: 60000,
    });
    await page.getByTestId("safe-name-input").fill("Dual Chain Safe");

    // Select both Anvil networks
    const anvilExactBtn = page.locator(
      'input[data-testid^="network-badge-btn-"]:not([aria-label*="two" i])[aria-label*="anvil" i]',
    );
    const anvilTwoBtn = page.locator('input[data-testid^="network-badge-btn-"][aria-label*="anvil two" i]');

    if ((await anvilExactBtn.count()) > 0) {
      await anvilExactBtn.first().click();
    }
    if ((await anvilTwoBtn.count()) > 0) {
      await anvilTwoBtn.click();
    }

    await page.locator('button.btn-primary:has-text("Next")').click();

    await page.waitForSelector('[data-testid="signer-input-0"]', { timeout: 60000 });
    await page.getByTestId("signer-input-0").fill(ANVIL_ACCOUNTS.account1);
    await page.getByTestId("threshold-input").fill("1");

    await page.locator('button.btn-primary:has-text("Next")').click();

    // Wait for prediction and capture address
    await page.waitForSelector('[data-testid="predicted-safe-address-value"]', {
      timeout: 60000,
    });
    const predictedAddress = await page.getByTestId("predicted-safe-address-value").getAttribute("data-address");
    expect(predictedAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);

    // Save as undeployed config
    await page.getByTestId("add-accounts-btn").click();
    await page.waitForURL("**/#/accounts");

    // Toggle to undeployed and navigate to Safe
    await page.getByTestId("toggle-deployed-undeployed").click();
    const safeRow = page.locator('[data-testid^="safe-account-row-"]').filter({
      hasText: "Dual Chain Safe",
    });
    // Expand the accordion
    await safeRow.locator('[data-testid="safe-account-collapse"]').click();

    // Click on the Anvil chain link inside the expanded accordion
    const chainLink = page.getByTestId(`safe-account-link-${predictedAddress}-${ANVIL_CHAIN_IDS.anvil}`);
    await expect(chainLink).toBeVisible({ timeout: 10000 });
    await chainLink.click();

    await page.waitForURL(`**/#/safe/${predictedAddress}**`);

    // Deploy on first chain (31337) - the chain link click switched us to Anvil
    const deployBtn = page.getByTestId("deploy-safe-btn");
    await expect(deployBtn).toBeVisible({ timeout: 30000 });
    await deployBtn.click();

    await page.waitForSelector('[data-testid="deployment-modal-root"]', { timeout: 60000 });
    let stepConfirmed = page.getByTestId("deployment-modal-step-confirmed");
    await stepConfirmed.waitFor({ state: "visible", timeout: 60000 });
    await expect(stepConfirmed).toHaveClass(/step-success/);
    await page.getByTestId("deployment-modal-success-btn").click();

    // Switch wallet to second chain for deployment
    await setChain(ANVIL_CHAIN_IDS.anvilTwo);

    // Wait for chain switch to reflect in UI - the deploy button should reappear
    // since the Safe is not deployed on chain 31338 yet
    await expect(deployBtn).toBeVisible({ timeout: 30000 });
    await deployBtn.click();

    await page.waitForSelector('[data-testid="deployment-modal-root"]', { timeout: 60000 });
    stepConfirmed = page.getByTestId("deployment-modal-step-confirmed");
    await stepConfirmed.waitFor({ state: "visible", timeout: 60000 });
    await expect(stepConfirmed).toHaveClass(/step-success/);
    await page.getByTestId("deployment-modal-success-btn").click();

    // Verify deployment succeeded - the deploy button should no longer be visible
    // since the Safe is now deployed on the current chain (31338)
    await expect(deployBtn).not.toBeVisible();
  });
});
