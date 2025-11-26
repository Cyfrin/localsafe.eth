"use client";

import { useState } from "react";
import AppSection from "@/app/components/AppSection";
import BtnCancel from "@/app/components/BtnCancel";
import EIP712DataDisplay from "@/app/components/EIP712DataDisplay";
import useSafe from "@/app/hooks/useSafe";
import { useAccount } from "wagmi";
import { keccak256 } from "viem/utils";
import {
  calculatePersonalSignHash,
  calculateTypedDataHash,
  calculateSafeMessageHashes,
  validateTypedData,
  type EIP712HashResult,
} from "@/app/utils/messageHashing";

type MessageType = "personal_sign" | "eip712" | "raw_data";

const EXAMPLE_EIP712 = {
  domain: {
    name: "Example dApp",
    version: "1",
    chainId: 1,
    verifyingContract: "0x0000000000000000000000000000000000000000",
  },
  types: {
    Message: [
      { name: "content", type: "string" },
      { name: "timestamp", type: "uint256" },
    ],
  },
  primaryType: "Message",
  message: {
    content: "Hello from LocalSafe!",
    timestamp: Math.floor(Date.now() / 1000),
  },
};

export default function SignMessageClient({ safeAddress }: { safeAddress: `0x${string}` }) {
  const { safeInfo } = useSafe(safeAddress);
  const { chain } = useAccount();

  const [messageType, setMessageType] = useState<MessageType>("personal_sign");
  const [personalMessage, setPersonalMessage] = useState("");
  const [eip712Input, setEip712Input] = useState(JSON.stringify(EXAMPLE_EIP712, null, 2));
  const [rawDataInput, setRawDataInput] = useState("");
  const [rawHashes, setRawHashes] = useState<EIP712HashResult | null>(null);
  const [safeHashes, setSafeHashes] = useState<EIP712HashResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCalculateHashes = () => {
    setError(null);
    setRawHashes(null);
    setSafeHashes(null);

    try {
      if (messageType === "personal_sign") {
        if (!personalMessage.trim()) {
          setError("Please enter a message");
          return;
        }

        // Calculate personal_sign hash (this is the "raw" hash for personal_sign)
        const messageHash = calculatePersonalSignHash(personalMessage);

        // Store raw hash
        setRawHashes({
          domainHash: "", // N/A for personal_sign
          messageHash: "", // N/A for personal_sign
          eip712Hash: messageHash,
          safeMessage: messageHash,
        });

        // Calculate SafeMessage hashes
        if (safeAddress && chain?.id && safeInfo) {
          const wrappedHashes = calculateSafeMessageHashes(
            safeAddress,
            chain.id,
            messageHash,
            safeInfo.version || "1.4.1",
          );
          setSafeHashes(wrappedHashes);
        }
      } else if (messageType === "eip712") {
        // EIP-712
        const typedData = JSON.parse(eip712Input);
        validateTypedData(typedData);

        // Calculate RAW EIP-712 hashes (not wrapped in SafeMessage)
        const typedDataHash = calculateTypedDataHash(typedData);
        setRawHashes(typedDataHash);

        // Calculate SafeMessage-wrapped hashes
        if (safeAddress && chain?.id && safeInfo) {
          const wrappedHashes = calculateSafeMessageHashes(
            safeAddress,
            chain.id,
            typedDataHash.eip712Hash,
            safeInfo.version || "1.4.1",
          );
          setSafeHashes(wrappedHashes);
        }
      } else {
        // Raw data
        if (!rawDataInput.trim()) {
          setError("Please enter raw data (hex string starting with 0x)");
          return;
        }

        // Validate hex format
        let rawDataHex = rawDataInput.trim();
        if (!rawDataHex.startsWith("0x")) {
          rawDataHex = `0x${rawDataHex}`;
        }

        // Validate hex string
        if (!/^0x[a-fA-F0-9]+$/.test(rawDataHex)) {
          setError("Invalid hex string format");
          return;
        }

        // For raw data, we hash it using keccak256
        const rawDataHash = keccak256(rawDataHex as `0x${string}`);

        // Store raw hash
        setRawHashes({
          domainHash: "", // N/A for raw data
          messageHash: "", // N/A for raw data
          eip712Hash: rawDataHash,
          safeMessage: rawDataHash,
        });

        // Calculate SafeMessage hashes
        if (safeAddress && chain?.id && safeInfo) {
          const wrappedHashes = calculateSafeMessageHashes(
            safeAddress,
            chain.id,
            rawDataHash,
            safeInfo.version || "1.4.1",
          );
          setSafeHashes(wrappedHashes);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to calculate hashes");
    }
  };

  const handleSign = async () => {
    setError("Signing not yet implemented - hash calculation only for now");
  };

  const loadExample = () => {
    setEip712Input(JSON.stringify(EXAMPLE_EIP712, null, 2));
    setError(null);
    setRawHashes(null);
    setSafeHashes(null);
  };

  const handleMessageTypeChange = (newType: MessageType) => {
    setMessageType(newType);
    setError(null);
    setRawHashes(null);
    setSafeHashes(null);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setEip712Input(content);
      setError(null);
      setRawHashes(null);
      setSafeHashes(null);
    };
    reader.onerror = () => setError("Failed to read file");
    reader.readAsText(file);
  };

  return (
    <AppSection>
      <div className="mb-4">
        <BtnCancel to={`/safe/${safeAddress}`} label="Back to Safe" />
      </div>
      <h1 className="mb-6 text-3xl font-bold">Sign Message</h1>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column - Input */}
        <div>
          {/* Message Type Selector */}
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-semibold opacity-60">Message Type</h3>
            <div className="flex flex-wrap gap-4">
              <label className="label cursor-pointer gap-2">
                <input
                  type="radio"
                  name="messageType"
                  className="radio radio-primary"
                  checked={messageType === "personal_sign"}
                  onChange={() => handleMessageTypeChange("personal_sign")}
                />
                <span className="label-text">Personal Sign (EIP-191)</span>
              </label>
              <label className="label cursor-pointer gap-2">
                <input
                  type="radio"
                  name="messageType"
                  className="radio radio-primary"
                  checked={messageType === "eip712"}
                  onChange={() => handleMessageTypeChange("eip712")}
                />
                <span className="label-text">Typed Data (EIP-712)</span>
              </label>
              <label className="label cursor-pointer gap-2">
                <input
                  type="radio"
                  name="messageType"
                  className="radio radio-primary"
                  checked={messageType === "raw_data"}
                  onChange={() => handleMessageTypeChange("raw_data")}
                />
                <span className="label-text">Raw Data (Hex)</span>
              </label>
            </div>
          </div>

          {/* Input Area */}
          <div className="form-control">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold opacity-60">
                {messageType === "personal_sign"
                  ? "Message to Sign"
                  : messageType === "eip712"
                    ? "EIP-712 JSON Data"
                    : "Raw Data (Hex)"}
              </h3>
              {messageType === "eip712" && (
                <div className="flex gap-2">
                  <button className="btn btn-xs btn-ghost" onClick={loadExample}>
                    Load Example
                  </button>
                  <label className="btn btn-xs btn-ghost cursor-pointer">
                    Upload File
                    <input type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
              )}
            </div>

            {messageType === "personal_sign" ? (
              <textarea
                className="textarea textarea-bordered h-96 w-full"
                placeholder="Enter your message here..."
                value={personalMessage}
                onChange={(e) => {
                  setPersonalMessage(e.target.value);
                  setRawHashes(null);
                  setSafeHashes(null);
                  setError(null);
                }}
              />
            ) : messageType === "eip712" ? (
              <textarea
                className="textarea textarea-bordered h-96 w-full font-mono text-xs"
                placeholder="Paste your EIP-712 JSON data here..."
                value={eip712Input}
                onChange={(e) => {
                  setEip712Input(e.target.value);
                  setRawHashes(null);
                  setSafeHashes(null);
                  setError(null);
                }}
              />
            ) : (
              <textarea
                className="textarea textarea-bordered h-96 w-full font-mono text-xs"
                placeholder="Enter raw hex data (e.g., 0x1234... or 1234...)"
                value={rawDataInput}
                onChange={(e) => {
                  setRawDataInput(e.target.value);
                  setRawHashes(null);
                  setSafeHashes(null);
                  setError(null);
                }}
              />
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-4">
            <button className="btn btn-primary btn-block" onClick={handleCalculateHashes}>
              Calculate Hashes
            </button>
          </div>
        </div>

        {/* Right Column - Results */}
        <div>
          <h3 className="mb-4 text-sm font-semibold opacity-60">Results</h3>

          {!rawHashes && !safeHashes && !error && (
            <div className="py-20 text-center opacity-60">
              <p>Enter a message and click &quot;Calculate Hashes&quot; to see results</p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="alert alert-error">
              <span>{error}</span>
            </div>
          )}

          {/* Raw Message Hashes (EIP-712 and raw data) */}
          {rawHashes && (messageType === "eip712" || messageType === "raw_data") && (
            <div className="mb-8 space-y-4">
              <h4 className="text-md border-b pb-2 font-bold">
                {messageType === "eip712" ? "Raw EIP-712 Hashes" : "Raw Data Hash"}
              </h4>
              {messageType === "eip712" ? (
                <EIP712DataDisplay
                  domainHash={rawHashes.domainHash}
                  messageHash={rawHashes.messageHash}
                  eip712Hash={rawHashes.eip712Hash}
                  showDivider={false}
                />
              ) : (
                <div className="bg-base-200 rounded-box space-y-3 p-4">
                  <div>
                    <label className="label">
                      <span className="label-text font-semibold">Keccak256 Hash</span>
                    </label>
                    <div className="mockup-code">
                      <pre className="px-4 text-xs break-all">{rawHashes.eip712Hash}</pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SafeMessage Wrapped Hashes */}
          {safeHashes && (
            <div className="space-y-4">
              <h4 className="text-md border-b pb-2 font-bold">SafeMessage-Wrapped Hashes</h4>

              <EIP712DataDisplay
                domainHash={safeHashes.domainHash}
                messageHash={safeHashes.messageHash}
                eip712Hash={safeHashes.eip712Hash}
                safeMessage={safeHashes.safeMessage}
                showDivider={false}
              />

              <label className="label">
                <span className="label-text-alt text-warning font-semibold">← This is what each signer will sign</span>
              </label>

              {/* Sign Message Button */}
              <div className="mt-6">
                <button className="btn btn-success btn-block" onClick={handleSign}>
                  Sign Message
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppSection>
  );
}
