import { test, expect } from "./utils/fixture";

test("should connect wallet to the app via E2E connector", async ({ page, connectWallet }) => {
  await page.goto("/");

  // Connect the E2E wallet (auto-connects in E2E mode) and navigate to accounts
  await connectWallet();

  // Verify we're on the accounts page (hash-based routing)
  await expect(page).toHaveURL(/\/#\/accounts$/);
});
