import { test, expect } from "./utils/fixture";
import fs from "fs";
import { MOCK_SAFEWALLET_DATA } from "./utils/constants";

test.beforeEach("Setup", async ({ page, connectWallet }) => {
  await page.goto("/");

  // Connect the E2E wallet
  await connectWallet();
});

// Export and Import workflow test for SafeWallet data
test("should export SafeWallet data and verify file content", async ({ page }) => {
  // Seed localStorage with mock data
  await page.evaluate((data) => {
    localStorage.setItem("MSIGUI_safeWalletData", JSON.stringify(data));
  }, MOCK_SAFEWALLET_DATA);

  // Reload to pick up the new localStorage data
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Wait for the export button to be visible
  await page.waitForSelector('[data-testid="export-wallets-btn"]', { timeout: 30000 });

  // Trigger export and capture download
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-wallets-btn").click()]);

  // Read the downloaded file
  const downloadPath = await download.path();
  const fileContent = fs.readFileSync(downloadPath!, "utf-8");
  const exportedData = JSON.parse(fileContent);

  // Assert exported data matches mock
  expect(exportedData.version).toBe(MOCK_SAFEWALLET_DATA.version);

  // AddressBook assertions
  expect(exportedData.data.addressBook["31337"]["0xe80f3c2046c04bf94b04ca142f94fbf7480110c7"]).toBe("Anvil 3 Owners");
  // Only one address in addressBook[31337] in the updated mock
  expect(exportedData.data.addressBook["31337"]["0xbd84F8EB4fC2054E177C44966E0fe6F4D843a6cF"]).toBeUndefined();

  // UndeployedSafes assertions
  expect(exportedData.data.undeployedSafes["31337"].props.factoryAddress).toBe(
    MOCK_SAFEWALLET_DATA.data.undeployedSafes["31337"].props.factoryAddress,
  );
  expect(exportedData.data.undeployedSafes["31337"].status.status).toBe("AWAITING_EXECUTION");
  expect(exportedData.data.undeployedSafes["11155111"].props.factoryAddress).toBe(
    MOCK_SAFEWALLET_DATA.data.undeployedSafes["11155111"].props.factoryAddress,
  );
  expect(exportedData.data.undeployedSafes["11155111"].status.status).toBe("AWAITING_EXECUTION");
});

test("should import SafeWallet data and restore accounts", async ({ page }) => {
  // Seed localStorage with empty data
  await page.evaluate(() => {
    localStorage.setItem(
      "MSIGUI_safeWalletData",
      JSON.stringify({
        version: "3.0",
        data: {
          addressBook: {},
          addedSafes: {},
          undeployedSafes: {},
          visitedSafes: {},
        },
      }),
    );
  });

  // Reload to pick up the new localStorage data
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Prepare a mock file for import
  const importFilePath = `/tmp/mock_safe_wallet_import.json`;
  fs.writeFileSync(importFilePath, JSON.stringify(MOCK_SAFEWALLET_DATA));

  // Simulate file upload for import
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("import-wallets-btn").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(importFilePath);

  // Wait for the import modal to appear and Replace button to be enabled
  await page.waitForSelector('[data-testid="import-modal"]', {
    state: "visible",
  });
  const replaceBtn = page.getByTestId("replace-wallets-btn");
  await replaceBtn.waitFor({ state: "visible" });
  await expect(replaceBtn).toBeEnabled();
  await replaceBtn.click();

  // Wait for modal to close
  await page.waitForSelector('[data-testid="import-modal"]', {
    state: "hidden",
  });

  // Verify imported data is present in localStorage
  const importedData = await page.evaluate(() => {
    const raw = localStorage.getItem("MSIGUI_safeWalletData");
    return JSON.parse(raw ?? "{}");
  });

  expect(importedData.version).toBe(MOCK_SAFEWALLET_DATA.version);
  expect(importedData.data.addressBook["31337"]["0xe80f3c2046c04bf94b04ca142f94fbf7480110c7"]).toBe("Anvil 3 Owners");
  expect(importedData.data.undeployedSafes["31337"].props.factoryAddress).toBe(
    MOCK_SAFEWALLET_DATA.data.undeployedSafes["31337"].props.factoryAddress,
  );
  expect(importedData.data.undeployedSafes["31337"].status.status).toBe("AWAITING_EXECUTION");
});
