// E2E for the in-app dApp browser (Safe Apps iframe transport). A stub dApp page is
// served via route interception; it speaks the Safe Apps postMessage protocol by hand
// (no relay, no WalletConnect) to exercise the full round-trip: getSafeInfo handshake ->
// sendTransactions -> user approval -> SafeTx proposed to the queue -> safeTxHash returned
// to the dApp. Requires anvil (started by tests/scripts/start-anvil-and-test.sh).

import { test, expect } from "./utils/fixture";

const DAPP_ORIGIN = "https://dapp.test";
const RECIPIENT = "0x44586c5784a07Cc85ae9f33FCf6275Ea41636A87";

// Minimal Safe App: retries getSafeInfo until the host answers, then requests one tx and
// records the outcome in #status so the test can assert what the dApp actually received.
const STUB_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="status">init</div>
<script>
  var connected = false;
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || typeof d.id === 'undefined') return;
    if (d.id === 'getinfo' && d.success && !connected) {
      connected = true;
      document.getElementById('status').textContent = 'connected:' + d.data.safeAddress;
      parent.postMessage({
        id: 'sendtx', method: 'sendTransactions',
        params: { txs: [{ to: '${RECIPIENT}', value: '0', data: '0x' }] },
        env: { sdkVersion: '9.1.0' }
      }, '*');
    } else if (d.id === 'sendtx') {
      document.getElementById('status').textContent = d.success ? ('proposed:' + d.data.safeTxHash) : ('error:' + d.error);
    }
  });
  var tries = 0;
  var iv = setInterval(function () {
    if (connected || tries++ > 100) { clearInterval(iv); return; }
    parent.postMessage({ id: 'getinfo', method: 'getSafeInfo', env: { sdkVersion: '9.1.0' } }, '*');
  }, 100);
</script>
</body></html>`;

test("dApp browser: connects a Safe App via postMessage and proposes a transaction", async ({
  page,
  connectWallet,
  deployTestSafe,
}) => {
  // Serve the stub dApp (and a Safe App manifest) at DAPP_ORIGIN.
  await page.route(`${DAPP_ORIGIN}/**`, async (route) => {
    if (route.request().url().endsWith("/manifest.json")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ name: "Stub dApp", iconPath: "icon.png" }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: "text/html", body: STUB_HTML });
    }
  });

  await page.goto("/");
  await connectWallet();
  const safeAddress = await deployTestSafe({ name: "dApp Browser Test Safe", threshold: 1 });

  // Open the freshly deployed Safe's dashboard.
  const safeRow = page
    .locator('[data-testid^="safe-account-row-"]')
    .filter({ has: page.locator(`text=${safeAddress.slice(0, 10)}`) });
  await safeRow.first().locator('[data-testid="safe-account-collapse"]').click();
  await safeRow.first().locator('[data-testid^="safe-account-link-"]').first().click();
  await expect(page.getByTestId("safe-dashboard-threshold")).toBeVisible();

  // Open the dApp browser and load the stub dApp.
  await page.getByTestId("safe-dashboard-dapp-browser-btn").click();
  await page.getByTestId("dapp-browser-url-input").waitFor({ state: "visible" });
  await page.getByTestId("dapp-browser-url-input").fill(`${DAPP_ORIGIN}/`);
  await page.getByTestId("dapp-browser-load-btn").click();

  // The dApp completes the getSafeInfo handshake against our host, then requests a tx,
  // which surfaces the approval modal.
  const frame = page.frameLocator('[data-testid="dapp-browser-iframe"]');
  await expect(frame.locator("#status")).toContainText(`connected:${safeAddress}`, { timeout: 30000 });
  await expect(page.getByTestId("dapp-browser-approval")).toBeVisible({ timeout: 30000 });

  // Approve: build + queue the SafeTx and return its safeTxHash to the dApp.
  await page.getByTestId("dapp-approve-btn").click();
  await expect(frame.locator("#status")).toContainText("proposed:0x", { timeout: 30000 });

  // The proposed transaction appears in the Safe's queue for owner signatures.
  await page.getByRole("link", { name: "Safe dashboard" }).click();
  await expect(page.getByTestId("safe-dashboard-current-tx-card")).toBeVisible({ timeout: 30000 });
});
