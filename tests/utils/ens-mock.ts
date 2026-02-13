import type { Page, Route } from "@playwright/test";

/**
 * ENS Universal Resolver address used by viem v2.35.1 on mainnet (without 0x prefix, lowercase).
 */
const UNIVERSAL_RESOLVER_HEX = "eeeeeeee14d718c2b47d9923deab1335e144eeee";

/**
 * A valid ENS public resolver address (used in mock responses).
 */
const MOCK_RESOLVER = "4976fb03c32e5b8cfe2b6ccb31c09ba78ebaba41";

/**
 * Default mainnet RPC URL used by viem when no custom URL is configured.
 */
const VIEM_DEFAULT_MAINNET_RPC = "https://eth.merkle.io";

/**
 * DNS-encode an ENS name (e.g. "test.eth" -> "04746573740365746800").
 * Each label is prefixed with its length byte, terminated with 0x00.
 */
function dnsEncodeName(name: string): string {
  const labels = name.split(".");
  let hex = "";
  for (const label of labels) {
    hex += label.length.toString(16).padStart(2, "0");
    for (let i = 0; i < label.length; i++) {
      hex += label.charCodeAt(i).toString(16).padStart(2, "0");
    }
  }
  hex += "00"; // null terminator
  return hex;
}

/**
 * Build the inner resolveWithGateways return data: ABI-encoded `(bytes result, address resolver)`.
 * `result` contains the ABI-encoded address from `addr(bytes32)`.
 */
function buildInnerResolveResponse(resolvedAddress: string | null): string {
  const addrHex = resolvedAddress ? resolvedAddress.slice(2).toLowerCase().padStart(64, "0") : "0".repeat(64);

  // ABI encoding of (bytes, address):
  //   word 0: offset to bytes data = 0x40
  //   word 1: resolver address (left-padded)
  //   word 2: length of bytes = 0x20
  //   word 3: bytes content (ABI-encoded address)
  return "0".repeat(62) + "40" + "0".repeat(24) + MOCK_RESOLVER + "0".repeat(62) + "20" + addrHex;
}

/**
 * Build the inner reverseWithGateways return data: ABI-encoded `(string resolvedName, address resolver, address reverseResolver)`.
 */
function buildInnerReverseResolveResponse(name: string): string {
  // Convert name to UTF-8 hex
  let nameHex = "";
  for (let i = 0; i < name.length; i++) {
    nameHex += name.charCodeAt(i).toString(16).padStart(2, "0");
  }
  const nameLengthHex = name.length.toString(16).padStart(64, "0");

  // Pad name hex to 32-byte boundary
  const paddedNameHex = nameHex + "0".repeat((64 - (nameHex.length % 64)) % 64);

  // ABI encoding of (string, address, address):
  //   word 0: offset to string data = 0x60 (3 head words × 32 bytes)
  //   word 1: resolver address
  //   word 2: reverseResolver address
  //   word 3: string byte length
  //   word 4+: string content (right-padded to 32-byte boundary)
  return (
    "0".repeat(62) +
    "60" +
    "0".repeat(24) +
    MOCK_RESOLVER +
    "0".repeat(24) +
    MOCK_RESOLVER +
    nameLengthHex +
    paddedNameHex
  );
}

/**
 * Wrap inner call result in Multicall3 aggregate3 response format.
 *
 * aggregate3 returns `Result[]` where `Result = (bool success, bytes returnData)`.
 * For a single call, the ABI encoding is:
 *   word 0: offset to array = 0x20
 *   word 1: array length = 1
 *   word 2: offset to first Result tuple = 0x20
 *   word 3: success = true (1)
 *   word 4: offset to returnData bytes = 0x40
 *   word 5: length of returnData
 *   word 6+: returnData content
 */
function wrapInMulticall3Response(innerHex: string): string {
  const innerBytes = innerHex; // hex string without 0x prefix
  const innerByteLength = innerBytes.length / 2;
  const innerLengthHex = innerByteLength.toString(16).padStart(64, "0");

  // Pad inner bytes to 32-byte boundary
  const paddedInner = innerBytes + "0".repeat((64 - (innerBytes.length % 64)) % 64);

  return (
    "0x" +
    // Offset to the array of Result structs
    "0".repeat(62) +
    "20" +
    // Array length = 1
    "0".repeat(62) +
    "01" +
    // Offset to first Result (relative to array start) = 0x20
    "0".repeat(62) +
    "20" +
    // success = true
    "0".repeat(62) +
    "01" +
    // Offset to returnData bytes (relative to Result start) = 0x40
    "0".repeat(62) +
    "40" +
    // Length of returnData
    innerLengthHex +
    // returnData content (padded)
    paddedInner
  );
}

/**
 * Type for ENS name-to-address mappings.
 */
export type EnsMappings = Record<string, string>;

/**
 * Get the mainnet RPC URL that the app uses for ENS resolution.
 * Uses NEXT_PUBLIC_MAINNET_RPC_URL env var if set, otherwise falls back
 * to viem's default mainnet RPC (https://eth.merkle.io).
 */
function getMainnetRpcUrl(): string {
  return process.env.NEXT_PUBLIC_MAINNET_RPC_URL || VIEM_DEFAULT_MAINNET_RPC;
}

/**
 * Set up Playwright route interception to mock ENS resolution (forward and reverse).
 *
 * Viem batches ENS calls through Multicall3, so the actual eth_call target is
 * the Multicall3 contract (0xca11bde05977b3631167028862be2a173976ca11), not
 * the ENS Universal Resolver directly. We detect ENS calls by checking if the
 * calldata contains the Universal Resolver address.
 *
 * Forward resolution (name → address): detected by DNS-encoded name in calldata.
 * Reverse resolution (address → name): detected by raw address hex in calldata.
 *
 * @param page - Playwright page instance
 * @param mappings - Map of ENS names to resolved addresses, e.g. { "test.eth": "0x1234..." }
 */
export async function mockEnsResolution(page: Page, mappings: EnsMappings): Promise<void> {
  // Pre-compute DNS-encoded hex for each name (lowercase for matching)
  const dnsLookup: Array<{ dnsHex: string; address: string }> = [];
  for (const [name, address] of Object.entries(mappings)) {
    dnsLookup.push({
      dnsHex: dnsEncodeName(name).toLowerCase(),
      address,
    });
  }

  // Pre-compute reverse lookup: address hex (lowercase, no 0x) -> name
  const reverseLookup: Array<{ addressHex: string; name: string }> = [];
  for (const [name, address] of Object.entries(mappings)) {
    reverseLookup.push({
      addressHex: address.slice(2).toLowerCase(),
      name,
    });
  }

  const handler = async (route: Route) => {
    const request = route.request();

    if (request.method() !== "POST") {
      await route.continue();
      return;
    }

    let body: string;
    try {
      body = request.postData() || "";
    } catch {
      await route.continue();
      return;
    }

    // Check if this request contains an ENS resolution call.
    // The Universal Resolver address will appear in the Multicall3 calldata.
    if (!body.includes("eth_call") || !body.includes(UNIVERSAL_RESOLVER_HEX)) {
      await route.continue();
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(body);
    } catch {
      await route.continue();
      return;
    }

    const calldata = (parsed.params?.[0]?.data || "").toLowerCase();

    // --- Forward resolution: check for DNS-encoded names ---
    let resolvedAddress: string | null = null;
    let isEnsForwardLookup = false;

    for (const entry of dnsLookup) {
      if (calldata.includes(entry.dnsHex)) {
        resolvedAddress = entry.address;
        isEnsForwardLookup = true;
        break;
      }
    }

    // If no known name found but it still targets the Universal Resolver
    // with a DNS-encoded name pattern (contains .eth = 03657468), treat as unresolvable
    if (!isEnsForwardLookup && calldata.includes("0365746800")) {
      isEnsForwardLookup = true;
      resolvedAddress = null;
    }

    if (isEnsForwardLookup) {
      const innerHex = buildInnerResolveResponse(resolvedAddress);
      const multicallResult = wrapInMulticall3Response(innerHex);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: parsed.id,
          result: multicallResult,
        }),
      });
      return;
    }

    // --- Reverse resolution: check for known address hex ---
    let reverseName: string | null = null;

    for (const entry of reverseLookup) {
      if (calldata.includes(entry.addressHex)) {
        reverseName = entry.name;
        break;
      }
    }

    if (reverseName !== null) {
      const innerHex = buildInnerReverseResolveResponse(reverseName);
      const multicallResult = wrapInMulticall3Response(innerHex);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: parsed.id,
          result: multicallResult,
        }),
      });
      return;
    }

    // Not a recognized ENS call — let it through
    await route.continue();
  };

  // Intercept the mainnet RPC endpoint used for ENS resolution.
  const rpcUrl = getMainnetRpcUrl().replace(/\/+$/, "");
  await page.route(`${rpcUrl}/**`, handler);
}
