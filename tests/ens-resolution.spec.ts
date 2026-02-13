import { test, expect, ANVIL_ACCOUNTS } from "./utils/fixture";

test.describe("ENS Name Resolution", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach("Setup", async ({ page, connectWallet }) => {
    await page.goto("/");
    await connectWallet();
  });

  test("should resolve ENS name in Safe creation signers step", async ({ page, mockEns }) => {
    await mockEns({ "test.eth": ANVIL_ACCOUNTS.account2 });

    // Navigate to create safe
    await page.getByTestId("create-safe-nav-btn").click();

    // Step 1: Select network and name
    await page.waitForSelector('[data-testid="safe-name-input"]', { timeout: 60000 });
    await page.getByTestId("safe-name-input").fill("ENS Test Safe");

    const anvilBtn = page.locator('input[data-testid^="network-badge-btn-"][aria-label*="anvil" i]');
    if ((await anvilBtn.count()) > 0) {
      await anvilBtn.first().click();
    }

    // Go to signers step
    await page.locator('button.btn-primary:has-text("Next")').click();
    await page.waitForSelector('[data-testid="signer-input-0"]', { timeout: 60000 });

    // Fill first signer with a raw address
    await page.getByTestId("signer-input-0").fill(ANVIL_ACCOUNTS.account1);

    // Add a second signer
    await page.getByTestId("add-owner-btn").click();
    await page.waitForSelector('[data-testid="signer-input-1"]', { timeout: 10000 });

    // Type ENS name into second signer input
    await page.getByTestId("signer-input-1").fill("test.eth");

    // Assert resolved address appears in green text
    const resolvedLabel = page.locator(".text-success", { hasText: "Resolved:" });
    await expect(resolvedLabel).toBeVisible({ timeout: 10000 });
    // Check that the resolved text contains the expected address prefix/suffix (case-insensitive)
    const resolvedText = await resolvedLabel.textContent();
    const account2Lower = ANVIL_ACCOUNTS.account2.toLowerCase();
    expect(resolvedText?.toLowerCase()).toContain(account2Lower.slice(0, 6));
    expect(resolvedText?.toLowerCase()).toContain(account2Lower.slice(-4));

    // Set threshold
    await page.getByTestId("threshold-input").fill("1");

    // Safe Account Preview should show the ENS name (not truncated)
    const preview = page.getByTestId("safe-details-root");
    await expect(preview.getByTestId("safe-details-signer-1")).toContainText("test.eth");

    // The "Next" button should be enabled (both signers are valid)
    const nextBtn = page.locator('button.btn-primary:has-text("Next")');
    await expect(nextBtn).toBeEnabled();

    // Click Next to go to review step
    await nextBtn.click();

    // Review step should show both signers (raw address + ENS name)
    const reviewDetails = page.getByTestId("safe-details-root");
    await expect(reviewDetails.getByTestId("safe-details-signer-0")).toContainText("0xf39F");
    await expect(reviewDetails.getByTestId("safe-details-signer-1")).toContainText("test.eth");

    // Wait for prediction to complete and show the predicted address
    await page.waitForSelector('[data-testid="predicted-safe-address-value"]', { timeout: 60000 });
    await expect(page.getByTestId("predicted-safe-address-value")).toBeVisible();

    // Deploy the safe
    await page.getByTestId("create-safe-btn").click();

    // Wait for deployment modal and success
    await page.waitForSelector('[data-testid="deployment-modal-root"]', { timeout: 60000 });
    const stepConfirmed = page.getByTestId("deployment-modal-step-confirmed");
    await stepConfirmed.waitFor({ state: "visible", timeout: 60000 });
    await expect(stepConfirmed).toHaveClass(/step-success/);

    // Click success button to go back to accounts
    await page.waitForSelector('[data-testid="deployment-modal-success-btn"]', { timeout: 60000 });
    await page.getByTestId("deployment-modal-success-btn").click();

    // Verify navigation to accounts and safe appears
    await page.waitForURL("**/#/accounts");
    await expect(page.getByTestId("safe-accounts-table")).toContainText("ENS Test Safe");
  });

  test("should resolve ENS name in Add Existing Safe", async ({ page, mockEns, deployTestSafe }) => {
    // Deploy a safe first so we have a valid on-chain address
    const deployedAddress = await deployTestSafe({ name: "Deployed For ENS Test" });

    // Remove the deployed safe from the address book so we can re-add it via ENS.
    // deployTestSafe already registered it, which would cause a "already registered" error.
    // We modify localStorage and reload so the React state re-initializes without it.
    await page.evaluate(
      ({ key, chainId, address }) => {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data?.data?.addressBook?.[chainId]?.[address]) {
          delete data.data.addressBook[chainId][address];
          localStorage.setItem(key, JSON.stringify(data));
        }
      },
      { key: "MSIGUI_safeWalletData", chainId: "31337", address: deployedAddress },
    );
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Set up ENS mock to resolve "mysafe.eth" to the deployed safe address
    await mockEns({ "mysafe.eth": deployedAddress });

    // Navigate to Add Existing Safe (after reload we may need to re-connect)
    const continueBtn = page.getByTestId("continue-with-account");
    try {
      await continueBtn.waitFor({ state: "visible", timeout: 5000 });
      await continueBtn.click();
      await page.waitForURL("**/#/accounts", { timeout: 30000 });
    } catch {
      // Already on accounts page
    }
    await page.getByTestId("add-safe-nav-btn").click();
    await page.waitForSelector('[data-testid="safe-name-input"]', { timeout: 60000 });

    // Fill name
    await page.getByTestId("safe-name-input").fill("ENS Connected Safe");

    // Type ENS name into address input
    await page.getByTestId("safe-address-input").fill("mysafe.eth");

    // Assert resolved address appears
    const resolvedLabel = page.locator(".text-success", { hasText: "Resolved:" });
    await expect(resolvedLabel).toBeVisible({ timeout: 10000 });

    const resolvedText2 = await resolvedLabel.textContent();
    const deployedLower = deployedAddress.toLowerCase();
    expect(resolvedText2?.toLowerCase()).toContain(deployedLower.slice(0, 6));

    // Select Anvil network
    await page.getByTestId("network-select").selectOption({ label: "Anvil" });

    // Click Add Safe
    await page.getByTestId("add-safe-btn").click();

    // Should navigate back to accounts with the safe added
    await page.waitForURL("**/#/accounts**", { timeout: 30000 });
    await expect(page.getByTestId("safe-accounts-table")).toContainText("ENS Connected Safe");
  });

  test("should resolve ENS name in New Transaction To field", async ({ page, mockEns, deployTestSafe }) => {
    await mockEns({ "recipient.eth": ANVIL_ACCOUNTS.account3 });

    // Deploy a safe and navigate to its dashboard
    const safeAddress = await deployTestSafe({ name: "TX Test Safe" });

    // Expand the safe row accordion and click into the Anvil chain dashboard
    const safeRow = page.locator(`[data-testid^="safe-account-row-"]`).filter({ hasText: "TX Test Safe" });
    await safeRow.first().waitFor({ state: "visible" });
    await safeRow.first().locator('[data-testid="safe-account-collapse"]').click();
    const chainLink = safeRow.first().locator("a", { hasText: /anvil/i });
    await chainLink.waitFor({ state: "visible" });
    await chainLink.click();

    // Wait for dashboard to load, then go to transaction builder
    await expect(page.getByTestId("safe-dashboard-threshold")).toBeVisible({ timeout: 60000 });
    await page.getByTestId("safe-dashboard-go-to-builder-btn").click();
    await page.waitForSelector('[data-testid="new-safe-tx-recipient-input"]', { timeout: 60000 });

    // Type ENS name in the "To" field
    await page.getByTestId("new-safe-tx-recipient-input").fill("recipient.eth");

    // Assert resolution feedback
    const resolvedLabel = page.locator(".text-success", { hasText: "Resolved:" });
    await expect(resolvedLabel).toBeVisible({ timeout: 10000 });

    const resolvedText3 = await resolvedLabel.textContent();
    const account3Lower = ANVIL_ACCOUNTS.account3.toLowerCase();
    expect(resolvedText3?.toLowerCase()).toContain(account3Lower.slice(0, 6));

    // Fill value (wei)
    await page.getByTestId("new-safe-tx-value-input").fill("0");

    // Click "Add Transaction" to add it to the transactions list
    await page.getByTestId("new-safe-tx-add-btn").click();

    // Verify the transaction appears in the list with the resolved address (truncated)
    const txRow = page.getByTestId("new-safe-tx-list-row-0");
    await expect(txRow).toBeVisible({ timeout: 10000 });

    const txRecipient = page.getByTestId("new-safe-tx-list-recipient-0");
    const txRecipientText = await txRecipient.textContent();
    expect(txRecipientText?.toLowerCase()).toContain(account3Lower.slice(0, 6));
    expect(txRecipientText?.toLowerCase()).toContain(account3Lower.slice(-4));

    // Click "Build/Batch Safe Transaction" to finalize and navigate to tx details
    await page.getByTestId("new-safe-tx-build-btn").click();

    // Should navigate to the transaction details page
    await page.waitForURL(`**/#/safe/${safeAddress}/tx/**`, { timeout: 30000 });

    // Verify the tx details page shows the reverse-resolved ENS name by default
    const txDetailsTo = page.getByTestId("tx-details-to-value");
    await expect(txDetailsTo).toContainText("recipient.eth", { timeout: 10000 });

    // Toggle the eye button to reveal the full address
    const toggleBtn = txDetailsTo.getByTestId("app-address-toggle");
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();
    await expect(txDetailsTo).toContainText(ANVIL_ACCOUNTS.account3.slice(0, 6));

    // Toggle back to show ENS name again
    await toggleBtn.click();
    await expect(txDetailsTo).toContainText("recipient.eth");
  });

  test("should show error for unresolvable ENS name", async ({ page, mockEns }) => {
    // Set up mock with no mappings — any ENS name will fail to resolve
    await mockEns({});

    // Navigate to create safe -> signers step
    await page.getByTestId("create-safe-nav-btn").click();
    await page.waitForSelector('[data-testid="safe-name-input"]', { timeout: 60000 });

    const anvilBtn = page.locator('input[data-testid^="network-badge-btn-"][aria-label*="anvil" i]');
    if ((await anvilBtn.count()) > 0) {
      await anvilBtn.first().click();
    }

    await page.locator('button.btn-primary:has-text("Next")').click();
    await page.waitForSelector('[data-testid="signer-input-0"]', { timeout: 60000 });

    // Type an unresolvable ENS name
    await page.getByTestId("signer-input-0").fill("nonexistent.eth");

    // Assert error message appears
    const errorLabel = page.locator(".text-error", { hasText: "Could not resolve ENS name" });
    await expect(errorLabel).toBeVisible({ timeout: 10000 });
  });

  test("should accept raw 0x address without ENS feedback", async ({ page, mockEns }) => {
    // Even with ENS mock set up, a raw address should not trigger ENS resolution UI
    await mockEns({});

    // Navigate to create safe -> signers step
    await page.getByTestId("create-safe-nav-btn").click();
    await page.waitForSelector('[data-testid="safe-name-input"]', { timeout: 60000 });

    const anvilBtn = page.locator('input[data-testid^="network-badge-btn-"][aria-label*="anvil" i]');
    if ((await anvilBtn.count()) > 0) {
      await anvilBtn.first().click();
    }

    await page.locator('button.btn-primary:has-text("Next")').click();
    await page.waitForSelector('[data-testid="signer-input-0"]', { timeout: 60000 });

    // Type a raw address
    await page.getByTestId("signer-input-0").fill(ANVIL_ACCOUNTS.account1);

    // Wait a moment for any async effects to settle
    await page.waitForTimeout(1000);

    // Assert: no ENS resolution feedback visible (no "Resolved:", no "Could not resolve", no spinner)
    const resolvedLabel = page.locator(".text-success", { hasText: "Resolved:" });
    const errorLabel = page.locator(".text-error", { hasText: "Could not resolve ENS name" });
    const spinner = page.locator(".loading-spinner");

    await expect(resolvedLabel).not.toBeVisible();
    await expect(errorLabel).not.toBeVisible();
    await expect(spinner).not.toBeVisible();
  });
});
