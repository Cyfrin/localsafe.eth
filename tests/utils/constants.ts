export const ANVIL_SAFE_THREE_SIGNERS = "0xe80f3c2046c04bf94b04ca142f94fbf7480110c7";
export const ANVIL_SAFE_MULTI = "0xbd84F8EB4fC2054E177C44966E0fe6F4D843a6cF";
export const CHAIN_ID_ANVIL = 31337;

export const ANVIL_MM_ACCOUNTS = [
  "Account 1",
  "Account 2",
  "Account 3",
  "Account 4",
  "Account 5",
  "Account 6",
  "Account 7",
  "Account 8",
  "Account 9",
  "Account 10",
];

export const MOCK_SAFEWALLET_DATA = {
  version: "3.0",
  data: {
    addressBook: {
      "31337": {
        "0xe80f3c2046c04bf94b04ca142f94fbf7480110c7": "Anvil 3 Owners",
      },
    },
    addedSafes: {
      "31337": {
        "0xe80f3c2046c04bf94b04ca142f94fbf7480110c7": {
          owners: [
            { value: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
            { value: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" },
            { value: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" },
          ],
          threshold: 2,
          ethBalance: "0",
        },
      },
    },
    undeployedSafes: {
      "31337": {
        props: {
          factoryAddress: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
          masterCopy: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
          safeAccountConfig: {
            owners: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0x44586c5784a07Cc85ae9f33FCf6275Ea41636A87"],
            threshold: 1,
            fallbackHandler: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
          },
          saltNonce: "0",
          safeVersion: "1.4.1",
        },
        status: {
          status: "AWAITING_EXECUTION",
          type: "PayLater",
        },
      },
      "11155111": {
        props: {
          factoryAddress: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
          masterCopy: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
          safeAccountConfig: {
            owners: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0x44586c5784a07Cc85ae9f33FCf6275Ea41636A87"],
            threshold: 1,
            fallbackHandler: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
          },
          saltNonce: "0",
          safeVersion: "1.4.1",
        },
        status: {
          status: "AWAITING_EXECUTION",
          type: "PayLater",
        },
      },
    },
    visitedSafes: {
      "31337": {
        "0xe80f3c2046c04bf94b04ca142f94fbf7480110c7": {
          lastVisited: Date.now(),
        },
      },
    },
  },
};

// Mock SafeTx data for export/import tests
export const MOCK_SAFE_TX_SIGNED_MAP = {
  "0xe80f3c2046c04bf94b04ca142f94fbf7480110c7": {
    data: {
      to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      value: "0",
      data: "0x",
      operation: 0,
      baseGas: "0",
      gasPrice: "0",
      gasToken: "0x0000000000000000000000000000000000000000",
      refundReceiver: "0x0000000000000000000000000000000000000000",
      nonce: 1,
      safeTxGas: "0",
    },
    signatures: [
      {
        signer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        data: "0x70cb1d77b77b30b27e1a9e85e19019fd5da7462fef466404085ff70b60e453061f94b3659c3805914c89f22b05b9bda81e9799c20eadd679dd3827d460bb2f241c",
        isContractSignature: false,
      },
    ],
  },
};

export const MOCK_SAFE_TX_MAP = {
  "0xe80f3c2046c04bf94b04ca142f94fbf7480110c7": {
    data: {
      to: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
      value: "0",
      data: "0x8d80ff0a000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000aa00e80f3c2046c04bf94b04ca142f94fbf7480110c7000000000000000000000000000000000000000000000000000000000001e240000000000000000000000000000000000000000000000000000000000000000000e80f3c2046c04bf94b04ca142f94fbf7480110c70000000000000000000000000000000000000000000000000000000000012fd1000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
      operation: 1,
      baseGas: "0",
      gasPrice: "0",
      gasToken: "0x0000000000000000000000000000000000000000",
      refundReceiver: "0x0000000000000000000000000000000000000000",
      nonce: 0,
      safeTxGas: "0",
    },
    signatures: [],
  },
};
