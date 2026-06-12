// ENS availability settings: status line in the networks modal, the clickable
// "ENS unavailable" hint in address inputs, and the mainnet RPC dialog they share.
//
// The dev server runs with NEXT_PUBLIC_MAINNET_RPC_URL set to the mock URL (see
// playwright.config.ts), so ENS starts "on — custom mainnet rpc"; tests turn it off
// via the dialog's Clear and back on by re-entering the mock URL.

import { test, expect } from "./utils/fixture";
import { ANVIL_ACCOUNTS } from "./utils/fixture";

const MOCK_MAINNET_RPC = process.env.NEXT_PUBLIC_MAINNET_RPC_URL!;

test("ens status line reflects mainnet RPC config and Clear turns it off", async ({ page, connectWallet }) => {
  await connectWallet();

  // Open the networks modal from the Add Existing Safe page's network select
  await page.goto("/#/new-safe/connect");
  await page.getByTestId("network-select").selectOption({ label: "+ Edit Networks" });
  await expect(page.getByTestId("network-modal")).toBeVisible();

  // Env-configured RPC → ENS on
  const statusLine = page.getByTestId("ens-status-line");
  await expect(statusLine).toContainText("ens: on — custom mainnet rpc");

  // Open the RPC dialog and clear the custom RPC
  await page.getByTestId("ens-status-edit").click();
  await expect(page.getByTestId("mainnet-rpc-modal")).toBeVisible();
  await expect(page.getByTestId("mainnet-rpc-input")).toHaveValue(MOCK_MAINNET_RPC);
  await page.getByTestId("mainnet-rpc-clear").click();

  // Status flips to off; the wallet (anvil) is not on mainnet
  await expect(statusLine).toContainText("ens: off — no mainnet rpc");
  await expect(page.getByTestId("ens-status-edit")).toContainText("set rpc");
});

test("address input hint opens the RPC dialog and enables resolution", async ({
  page,
  connectWallet,
  mockEns,
  deployTestSafe,
}) => {
  await mockEns({ "recipient.eth": ANVIL_ACCOUNTS.account3 });
  await page.goto("/");
  await connectWallet();

  // Deploy a safe first (the fixture drives the wizard from the accounts page)
  const safeAddress = await deployTestSafe({ name: "ENS Settings Safe" });

  // Turn ENS off (clear the env-configured RPC) via the networks modal
  await page.goto("/#/new-safe/connect");
  await page.getByTestId("network-select").selectOption({ label: "+ Edit Networks" });
  await page.getByTestId("ens-status-edit").click();
  await page.getByTestId("mainnet-rpc-clear").click();
  await expect(page.getByTestId("ens-status-line")).toContainText("ens: off");
  await page.getByTestId("network-modal-close-btn").click();

  // Reach the transaction builder
  await page.goto(`/#/safe/${safeAddress}`);
  await expect(page.getByTestId("safe-dashboard-threshold")).toBeVisible({ timeout: 60000 });
  await page.getByTestId("safe-dashboard-go-to-builder-btn").click();
  await page.waitForSelector('[data-testid="new-safe-tx-recipient-input"]', { timeout: 60000 });

  // ENS is off → typing a name shows the actionable hint instead of an error
  await page.getByTestId("new-safe-tx-recipient-input").fill("recipient.eth");
  const hint = page.getByTestId("ens-unavailable-link");
  await expect(hint).toContainText("ENS unavailable — set mainnet RPC");

  // The hint opens the RPC dialog; "use public rpc" fills the field
  await hint.click();
  await expect(page.getByTestId("mainnet-rpc-modal")).toBeVisible();
  await expect(page.getByTestId("mainnet-rpc-status")).toContainText("ens off");
  await page.getByTestId("mainnet-rpc-use-public").click();
  await expect(page.getByTestId("mainnet-rpc-input")).toHaveValue("https://ethereum-rpc.publicnode.com");

  // Use the mock RPC so resolution is intercepted, then save
  await page.getByTestId("mainnet-rpc-input").fill(MOCK_MAINNET_RPC);
  await page.getByTestId("mainnet-rpc-save").click();

  // Resolution now runs and succeeds through the configured RPC
  const resolvedLabel = page.locator(".text-success", { hasText: "Resolved:" });
  await expect(resolvedLabel).toBeVisible({ timeout: 15000 });
  expect(safeAddress).toBeTruthy();
});
