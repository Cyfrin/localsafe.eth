"use client";

/**
 * Reusable component to display EIP-712 signature data
 * Shows domain hash, message hash, and EIP-712 digest hash
 */

interface EIP712DataDisplayProps {
  domainHash: string;
  messageHash: string;
  eip712Hash: string;
  safeMessage?: string;
  title?: string;
  showDivider?: boolean;
}

export default function EIP712DataDisplay({
  domainHash,
  messageHash,
  eip712Hash,
  safeMessage,
  title = "EIP-712 Signature Data",
  showDivider = true,
}: EIP712DataDisplayProps) {
  return (
    <div className="space-y-4">
      {showDivider && <div className="divider">{title}</div>}

      <div className="bg-base-200 rounded-box space-y-3 p-4">
        {safeMessage && (
          <div>
            <h4 className="mb-1 text-sm font-semibold">SafeMessage</h4>
            <p className="font-mono text-xs break-all">{safeMessage}</p>
          </div>
        )}
        <div>
          <h4 className="mb-1 text-sm font-semibold">Domain Hash</h4>
          <p className="font-mono text-xs break-all">{domainHash}</p>
        </div>
        <div>
          <h4 className="mb-1 text-sm font-semibold">Message Hash</h4>
          <p className="font-mono text-xs break-all">{messageHash}</p>
        </div>
        <div className="border-info/30 bg-info/10 rounded-lg border p-3">
          <h4 className="mb-1 text-sm font-semibold">
            {safeMessage ? "EIP-712 Digest (SafeMessage Hash)" : "EIP-712 Digest (Signing Hash)"}
          </h4>
          <p className="font-mono text-xs break-all">{eip712Hash}</p>
        </div>
      </div>
    </div>
  );
}
