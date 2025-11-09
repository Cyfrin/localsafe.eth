"use client";

import { useState } from "react";
import AppSection from "@/app/components/AppSection";
import BtnCancel from "@/app/components/BtnCancel";
import useSafe from "@/app/hooks/useSafe";
import { useAccount } from "wagmi";
import {
  calculatePersonalSignHash,
  calculateTypedDataHash,
  calculateSafeMessageHashes,
  validateTypedData,
  type EIP712HashResult,
} from "@/app/utils/messageHashing";

type MessageType = "personal_sign" | "eip712";

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
            safeInfo.version || "1.4.1"
          );
          setSafeHashes(wrappedHashes);
        }
      } else {
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
            safeInfo.version || "1.4.1"
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
    setRawHashes(null); setSafeHashes(null);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setEip712Input(content);
      setError(null);
      setRawHashes(null); setSafeHashes(null);
    };
    reader.onerror = () => setError("Failed to read file");
    reader.readAsText(file);
  };

  return (
    <AppSection>
      <div className="mb-4">
        <BtnCancel to={`/safe/${safeAddress}`} label="Back to Safe" />
      </div>
      <h1 className="text-3xl font-bold mb-6">Sign Message</h1>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Input */}
        <div>
          {/* Message Type Selector */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold mb-2 opacity-60">Message Type</h3>
            <div className="flex gap-4">
              <label className="label cursor-pointer gap-2">
                <input
                  type="radio"
                  name="messageType"
                  className="radio radio-primary"
                  checked={messageType === "personal_sign"}
                  onChange={() => {
                    setMessageType("personal_sign");
                    setError(null);
                    setRawHashes(null); setSafeHashes(null);
                  }}
                />
                <span className="label-text">Personal Sign (EIP-191)</span>
              </label>
              <label className="label cursor-pointer gap-2">
                <input
                  type="radio"
                  name="messageType"
                  className="radio radio-primary"
                  checked={messageType === "eip712"}
                  onChange={() => {
                    setMessageType("eip712");
                    setError(null);
                    setRawHashes(null); setSafeHashes(null);
                  }}
                />
                <span className="label-text">Typed Data (EIP-712)</span>
              </label>
            </div>
          </div>

          {/* Input Area */}
          <div className="form-control">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold opacity-60">
                {messageType === "personal_sign" ? "Message to Sign" : "EIP-712 JSON Data"}
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
                  setRawHashes(null); setSafeHashes(null);
                  setError(null);
                }}
              />
            ) : (
              <textarea
                className="textarea textarea-bordered font-mono text-xs h-96 w-full"
                placeholder="Paste your EIP-712 JSON data here..."
                value={eip712Input}
                onChange={(e) => {
                  setEip712Input(e.target.value);
                  setRawHashes(null); setSafeHashes(null);
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
          <h3 className="text-sm font-semibold mb-4 opacity-60">Results</h3>

          {!rawHashes && !safeHashes && !error && (
            <div className="text-center py-20 opacity-60">
              <p>Enter a message and click "Calculate Hashes" to see results</p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="alert alert-error">
              <span>{error}</span>
            </div>
          )}

          {/* Raw Message Hashes (EIP-712 only) */}
          {rawHashes && messageType === "eip712" && (
            <div className="space-y-4 mb-8">
              <h4 className="text-md font-bold border-b pb-2">Raw EIP-712 Hashes</h4>

              <div>
                <label className="label">
                  <span className="label-text font-semibold">EIP-712 Hash (Digest)</span>
                </label>
                <div className="mockup-code">
                  <pre className="px-4 text-xs break-all">{rawHashes.eip712Hash}</pre>
                </div>
              </div>

              <div>
                <label className="label">
                  <span className="label-text font-semibold">Domain Hash</span>
                </label>
                <div className="mockup-code">
                  <pre className="px-4 text-xs break-all">{rawHashes.domainHash}</pre>
                </div>
              </div>

              <div>
                <label className="label">
                  <span className="label-text font-semibold">Message Hash</span>
                </label>
                <div className="mockup-code">
                  <pre className="px-4 text-xs break-all">{rawHashes.messageHash}</pre>
                </div>
              </div>
            </div>
          )}

          {/* SafeMessage Wrapped Hashes */}
          {safeHashes && (
            <div className="space-y-4">
              <h4 className="text-md font-bold border-b pb-2">SafeMessage-Wrapped Hashes</h4>

              <div>
                <label className="label">
                  <span className="label-text font-semibold">Safe Message Hash</span>
                </label>
                <div className="mockup-code">
                  <pre className="px-4 text-xs break-all">{safeHashes.eip712Hash}</pre>
                </div>
                <label className="label">
                  <span className="label-text-alt text-warning font-semibold">← This is what each signer will sign</span>
                </label>
              </div>

              <div>
                <label className="label">
                  <span className="label-text font-semibold">Domain Hash</span>
                </label>
                <div className="mockup-code">
                  <pre className="px-4 text-xs break-all">{safeHashes.domainHash}</pre>
                </div>
              </div>

              <div>
                <label className="label">
                  <span className="label-text font-semibold">Message Hash</span>
                </label>
                <div className="mockup-code">
                  <pre className="px-4 text-xs break-all">{safeHashes.messageHash}</pre>
                </div>
              </div>

              {/* Sign Message Button */}
              <div className="mt-6">
                <button
                  className="btn btn-success btn-block"
                  onClick={handleSign}
                >
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
