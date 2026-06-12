// Parsing Safe{Wallet} Transaction Builder batch files into Safe call inputs.
// Calldata vectors below were derived independently via viem's parseAbi human-readable
// route (selectors are the canonical 0x4f1ef286 upgradeToAndCall / 0xa9059cbb transfer).

import { test, expect } from "@playwright/test";
import { isTxBuilderBatch, parseTxBuilderBatch } from "../app/utils/txBuilderBatch";
import type { TxBuilderBatch } from "../app/utils/txBuilderBatch";

const UPGRADE_BATCH: TxBuilderBatch = {
  version: "1.0",
  chainId: "626",
  meta: {
    name: "BattleChain Safe Harbor v5.0.0 upgrade",
    createdFromSafeAddress: "0xfA26440c6DDc56C93A9248078e13a5eB050ADb1E",
  },
  transactions: [
    {
      to: "0xd229f4EE1bAE432010b72a9d1bD682570F4C6eBe",
      value: "0",
      data: null,
      contractMethod: {
        name: "upgradeToAndCall",
        payable: true,
        inputs: [
          { internalType: "address", name: "newImplementation", type: "address" },
          { internalType: "bytes", name: "data", type: "bytes" },
        ],
      },
      contractInputsValues: {
        newImplementation: "0x96d9cCEf1C2eBD19Cc4D3293Bd726c335F9523d7",
        data: "0x",
      },
    },
    {
      // pre-encoded calldata passes through untouched
      to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      value: "1",
      data: "0xdeadbeef",
    },
    {
      // uint values arrive as decimal strings and must be coerced
      to: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      value: "0",
      data: null,
      contractMethod: {
        name: "transfer",
        inputs: [
          { internalType: "address", name: "to", type: "address" },
          { internalType: "uint256", name: "amount", type: "uint256" },
        ],
      },
      contractInputsValues: {
        to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        amount: "1230000000000000000",
      },
    },
  ],
};

test.describe("Transaction Builder batch import", () => {
  test("detects the format and rejects localsafe's own export format", () => {
    expect(isTxBuilderBatch(UPGRADE_BATCH)).toBe(true);
    // this app's export: data is a SafeTx object, not string/null
    expect(
      isTxBuilderBatch({
        transactions: [{ data: { to: "0x", value: "0", nonce: 0 }, signatures: [] }],
      }),
    ).toBe(false);
    expect(isTxBuilderBatch({ tx: { data: {} } })).toBe(false);
    expect(isTxBuilderBatch(null)).toBe(false);
  });

  test("encodes contract methods and passes raw calldata through", () => {
    const parsed = parseTxBuilderBatch(UPGRADE_BATCH);
    expect(parsed.chainId).toBe("626");
    expect(parsed.name).toBe("BattleChain Safe Harbor v5.0.0 upgrade");
    expect(parsed.createdFromSafeAddress).toBe("0xfA26440c6DDc56C93A9248078e13a5eB050ADb1E");
    expect(parsed.transactions).toHaveLength(3);

    expect(parsed.transactions[0]).toEqual({
      to: "0xd229f4EE1bAE432010b72a9d1bD682570F4C6eBe",
      value: "0",
      operation: 0,
      data:
        "0x4f1ef28600000000000000000000000096d9ccef1c2ebd19cc4d3293bd726c335f9523d7" +
        "0000000000000000000000000000000000000000000000000000000000000040" +
        "0000000000000000000000000000000000000000000000000000000000000000",
    });
    expect(parsed.transactions[1]).toEqual({
      to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      value: "1",
      operation: 0,
      data: "0xdeadbeef",
    });
    expect(parsed.transactions[2].data).toBe(
      "0xa9059cbb00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8" +
        "0000000000000000000000000000000000000000000000001111d67bb1bb0000",
    );
  });

  test("fails loudly on missing parameters and empty batches", () => {
    const missingParam: TxBuilderBatch = {
      version: "1.0",
      chainId: "626",
      transactions: [
        {
          to: "0xd229f4EE1bAE432010b72a9d1bD682570F4C6eBe",
          value: "0",
          data: null,
          contractMethod: { name: "transfer", inputs: [{ name: "to", type: "address" }] },
          contractInputsValues: {},
        },
      ],
    };
    expect(() => parseTxBuilderBatch(missingParam)).toThrow(/missing value for parameter to/);
    expect(() => parseTxBuilderBatch({ version: "1.0", chainId: "626", transactions: [] })).toThrow(/no transactions/);
  });
});
