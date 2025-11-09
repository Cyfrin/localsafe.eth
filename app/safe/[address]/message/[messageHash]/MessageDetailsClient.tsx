"use client";

import AppSection from "@/app/components/AppSection";
import AppCard from "@/app/components/AppCard";
import { useNavigate } from "react-router-dom";
import useSafe from "@/app/hooks/useSafe";
import { useEffect, useState } from "react";
import { EthSafeMessage } from "@safe-global/protocol-kit";
import { useSafeMessageContext } from "@/app/provider/SafeMessageProvider";
import { useAccount, useChainId } from "wagmi";
import { ethers } from "ethers";
import { useToast } from "@/app/hooks/useToast";
import { useWalletConnect } from "@/app/provider/WalletConnectProvider";

export default function MessageDetailsClient({
  safeAddress,
  messageHash,
}: {
  safeAddress: `0x${string}`;
  messageHash: string;
}) {
  const { address: connectedAddress } = useAccount();
  const chainId = useChainId();
  const navigate = useNavigate();
  const toast = useToast();
  const { approveRequest } = useWalletConnect();
  const { kit, isOwner, safeInfo } = useSafe(safeAddress);
  const { getAllMessages, saveMessage, removeMessage } = useSafeMessageContext();

  const [safeMessage, setSafeMessage] = useState<EthSafeMessage | null>(null);
  const [signing, setSigning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messageDisplay, setMessageDisplay] = useState<string>("");
  const [eip712Data, setEip712Data] = useState<{
    safeMessage: string;
    eip712Hash: string;
    domainHash: string;
    messageHash: string;
  } | null>(null);
  const [showCollabDropdown, setShowCollabDropdown] = useState(false);
  const [sendingToWC, setSendingToWC] = useState(false);

  // Check if current user has signed this message
  const hasSignedThisMsg =
    safeMessage && connectedAddress ? (safeMessage.signatures?.has(connectedAddress.toLowerCase()) ?? false) : false;

  // Load message from storage
  useEffect(() => {
    async function loadMessage() {
      setLoading(true);
      try {
        const allMessages = getAllMessages(safeAddress, chainId?.toString());

        // Find message by comparing the hash
        let foundMessage: EthSafeMessage | null = null;
        for (const msg of allMessages) {
          if (kit) {
            const hash = await kit.getSafeMessageHash(msg.data as any);
            if (hash === messageHash) {
              foundMessage = msg;
              break;
            }
          }
        }

        if (foundMessage) {
          setSafeMessage(foundMessage);

          // Format message for display
          const msgData = foundMessage.data;
          if (typeof msgData === "string") {
            // Try to decode hex string
            if (msgData.startsWith("0x")) {
              try {
                const decoded = ethers.toUtf8String(msgData);
                setMessageDisplay(decoded);
              } catch {
                setMessageDisplay(msgData);
              }
            } else {
              setMessageDisplay(msgData);
            }
          } else {
            // EIP-712 typed data
            setMessageDisplay(JSON.stringify(msgData, null, 2));
          }
        }
      } catch (error) {
        console.error("Failed to load message:", error);
        toast.error("Failed to load message");
      } finally {
        setLoading(false);
      }
    }

    if (kit && chainId) {
      loadMessage();
    }
  }, [kit, safeAddress, messageHash, chainId, getAllMessages, toast]);

  // Calculate EIP-712 hashes
  useEffect(() => {
    if (!safeMessage || !safeInfo || !chainId) return;

    try {
      const msgData = safeMessage.data;
      let safeMessageMessage: string;

      // Calculate SafeMessage based on message type
      if (typeof msgData === "string") {
        // For string messages, apply EIP-191 to the literal string
        safeMessageMessage = ethers.hashMessage(msgData);
      } else {
        // For EIP-712 typed data, use the EIP-712 hash
        const { domain, types, message } = msgData as any;
        safeMessageMessage = ethers.TypedDataEncoder.hash(domain, types, message);
      }

      // SafeMessage EIP-712 domain
      const safeVersion = safeInfo.version || "1.4.1";
      const includeChainId = safeVersion >= "1.3.0";
      const domain = includeChainId
        ? { chainId: chainId, verifyingContract: safeAddress }
        : { verifyingContract: safeAddress };

      // SafeMessage EIP-712 types
      const types = {
        SafeMessage: [{ name: "message", type: "bytes" }],
      };

      // SafeMessage message structure
      const message = { message: safeMessageMessage };

      // Calculate hashes
      const domainHash = ethers.TypedDataEncoder.hashDomain(domain);
      const messageHash = ethers.TypedDataEncoder.hashStruct("SafeMessage", types, message);
      const eip712Hash = ethers.TypedDataEncoder.hash(domain, types, message);

      setEip712Data({
        safeMessage: safeMessageMessage,
        eip712Hash,
        domainHash,
        messageHash,
      });
    } catch (err) {
      console.error("Failed to calculate EIP-712 hashes:", err);
    }
  }, [safeMessage, safeInfo, chainId, safeAddress]);

  // Handle signing
  async function handleSign() {
    if (!safeMessage || !kit) return;

    setSigning(true);
    try {
      const signedMessage = await kit.signMessage(safeMessage);
      saveMessage(safeAddress, signedMessage, messageHash, chainId?.toString());
      setSafeMessage(signedMessage);
      toast.success("Signature added!");

      // Check if threshold is met
      const signatureCount = signedMessage.signatures.size;
      const threshold = safeInfo?.threshold || 1;

      if (signatureCount >= threshold) {
        // Threshold met - check if there's a WalletConnect request to respond to
        const wcRequest = sessionStorage.getItem(`wc-message-${messageHash}`);
        if (wcRequest) {
          try {
            const { topic, id } = JSON.parse(wcRequest);

            // Get the combined/encoded signature from all signers
            const encodedSignature = signedMessage.encodedSignatures();

            await approveRequest(topic, {
              id,
              jsonrpc: "2.0",
              result: encodedSignature,
            });

            sessionStorage.removeItem(`wc-message-${messageHash}`);
            removeMessage(safeAddress, messageHash, chainId?.toString());
            toast.success("Message signed and sent to dApp!");
            navigate(`/safe/${safeAddress}`);
            return;
          } catch (error) {
            console.error("Failed to respond to WalletConnect:", error);
            const errorMsg = error instanceof Error ? error.message : String(error);

            // Check if it's a timeout/expired request error
            if (
              errorMsg.includes("No matching key") ||
              errorMsg.includes("recently deleted") ||
              errorMsg.includes("Missing or invalid")
            ) {
              toast.error("WalletConnect request expired. Message saved - you can manually respond if needed.");
              // Clean up the expired request
              sessionStorage.removeItem(`wc-message-${messageHash}`);
            } else {
              toast.error("Signed but failed to respond to dApp");
            }
          }
        } else {
          toast.success("Message fully signed!");
        }
      }
    } catch (error) {
      console.error("Failed to sign message:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to sign: ${errorMessage}`);
    } finally {
      setSigning(false);
    }
  }

  // Share message link with all signatures
  function handleShareLink() {
    if (!safeMessage || !chainId) return;
    try {
      const signatures = safeMessage.signatures
        ? Array.from(safeMessage.signatures.values()).map((sig) => ({
            signer: sig.signer,
            data: sig.data,
            isContractSignature: sig.isContractSignature,
          }))
        : [];

      const msgData = {
        data: safeMessage.data,
        signatures,
      };

      const encoded = btoa(JSON.stringify({ message: msgData }));
      const baseUrl = window.location.origin;
      const shareUrl = `${baseUrl}/#/safe/${safeAddress}?importMsg=${encodeURIComponent(encoded)}&chainId=${chainId}`;

      navigator.clipboard.writeText(shareUrl);
      toast.success("Message link copied to clipboard!");
    } catch (e: unknown) {
      console.error("Share link error:", e);
      toast.error("Failed to create share link");
    }
  }

  // Share signature link for this message
  function handleShareSignature() {
    if (!safeMessage || !chainId) return;
    try {
      if (!connectedAddress) {
        toast.error("No wallet connected");
        return;
      }

      // Find the signature for the current user
      const userSignature = safeMessage.signatures
        ? Array.from(safeMessage.signatures.values()).find(
            (sig) => sig.signer.toLowerCase() === connectedAddress.toLowerCase(),
          )
        : null;

      if (!userSignature) {
        toast.error("You haven't signed this message yet");
        return;
      }

      const signatureData = {
        signer: userSignature.signer,
        data: userSignature.data,
        isContractSignature: userSignature.isContractSignature,
      };

      const encoded = btoa(JSON.stringify({ signature: signatureData, messageHash }));
      const baseUrl = window.location.origin;
      const shareUrl = `${baseUrl}/#/safe/${safeAddress}?importMsgSig=${encodeURIComponent(encoded)}&chainId=${chainId}`;

      navigator.clipboard.writeText(shareUrl);
      toast.success("Signature link copied to clipboard!");
    } catch (e: unknown) {
      console.error("Share signature error:", e);
      toast.error("Failed to create signature link");
    }
  }

  // Send signature to WalletConnect dApp
  async function handleSendToWalletConnect() {
    if (!safeMessage || !kit) return;

    const wcRequest = sessionStorage.getItem(`wc-message-${messageHash}`);
    if (!wcRequest) {
      toast.error("No WalletConnect request found for this message");
      return;
    }

    setSendingToWC(true);
    try {
      const { topic, id } = JSON.parse(wcRequest);

      // Check if we have enough signatures
      if (safeMessage.signatures.size === 0) {
        toast.error("No signatures available");
        setSendingToWC(false);
        return;
      }

      // Get the combined/encoded signature from all signers
      const encodedSignature = safeMessage.encodedSignatures();

      await approveRequest(topic, {
        id,
        jsonrpc: "2.0",
        result: encodedSignature,
      });

      sessionStorage.removeItem(`wc-message-${messageHash}`);
      removeMessage(safeAddress, messageHash, chainId?.toString());
      toast.success("Message signed and sent to dApp!");
      navigate(`/safe/${safeAddress}`);
    } catch (error) {
      console.error("Failed to respond to WalletConnect:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if it's a timeout/expired request error
      if (
        errorMsg.includes("No matching key") ||
        errorMsg.includes("recently deleted") ||
        errorMsg.includes("Missing or invalid")
      ) {
        toast.error("WalletConnect request expired. Please initiate signing from the dApp again.");
        // Clean up the expired request
        sessionStorage.removeItem(`wc-message-${messageHash}`);
      } else {
        toast.error("Failed to send signature to dApp");
      }
    } finally {
      setSendingToWC(false);
    }
  }

  if (loading) {
    return (
      <AppSection>
        <AppCard title="Message Details">
          <div className="py-8 text-center">
            <span className="loading loading-spinner loading-lg"></span>
            <p className="mt-4">Loading message...</p>
          </div>
        </AppCard>
      </AppSection>
    );
  }

  if (!safeMessage) {
    return (
      <AppSection>
        <AppCard title="Message Not Found">
          <div className="py-8 text-center">
            <p>Message not found.</p>
            <button className="btn btn-primary mt-4" onClick={() => navigate(`/safe/${safeAddress}`)}>
              Back to Safe
            </button>
          </div>
        </AppCard>
      </AppSection>
    );
  }

  const signatureCount = safeMessage.signatures.size;
  const threshold = safeInfo?.threshold || 1;
  const signaturesNeeded = threshold - signatureCount;
  const isThresholdMet = signatureCount >= threshold;

  // Check if there's a WalletConnect request waiting
  const hasWCRequest = typeof window !== "undefined" && sessionStorage.getItem(`wc-message-${messageHash}`) !== null;

  return (
    <AppSection>
      <div className="mb-4">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/safe/${safeAddress}`)}>
          ← Back to Safe
        </button>
      </div>

      <AppCard title="Message Signing Request">
        <div className="flex flex-col gap-4">
          {/* Message Content */}
          <div className="bg-base-200 rounded-box p-4">
            <h5 className="mb-2 font-semibold">Message</h5>
            <pre className="bg-base-300 max-h-64 overflow-y-auto rounded p-3 text-sm break-all whitespace-pre-wrap">
              {messageDisplay}
            </pre>
          </div>

          {/* EIP-712 Data Section */}
          {eip712Data && (
            <div className="space-y-4">
              <div className="divider">EIP-712 Signature Data</div>

              <div className="bg-base-200 rounded-box space-y-3 p-4">
                <div>
                  <h4 className="mb-1 text-sm font-semibold">SafeMessage</h4>
                  <p className="font-mono text-xs break-all">{eip712Data.safeMessage}</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                  <h4 className="mb-1 text-sm font-semibold text-blue-800 dark:text-blue-200">
                    EIP-712 Digest (SafeMessage Hash)
                  </h4>
                  <p className="font-mono text-xs break-all text-blue-800 dark:text-blue-200">
                    {eip712Data.eip712Hash}
                  </p>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-semibold">Domain Hash</h4>
                  <p className="font-mono text-xs break-all">{eip712Data.domainHash}</p>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-semibold">Message Hash</h4>
                  <p className="font-mono text-xs break-all">{eip712Data.messageHash}</p>
                </div>
              </div>
            </div>
          )}

          {/* Signatures Section */}
          <div className="bg-base-200 rounded-box p-4">
            <div className="mb-2 flex items-center justify-between">
              <h5 className="font-semibold">
                Signatures ({signatureCount}/{threshold})
              </h5>
              {signaturesNeeded > 0 && <span className="badge badge-warning">{signaturesNeeded} more needed</span>}
              {signaturesNeeded === 0 && <span className="badge badge-success">Threshold met!</span>}
            </div>
            <div className="space-y-2">
              {Array.from(safeMessage.signatures.values()).map((sig, idx) => (
                <div key={idx} className="bg-base-300 rounded p-2">
                  <div className="text-xs">
                    <span className="font-semibold">Signer {idx + 1}:</span> {sig.signer}
                  </div>
                  <div className="truncate text-xs text-gray-500">Signature: {sig.data}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Collaboration Actions */}
          <div className="flex flex-col gap-2">
            <div className="relative">
              <button className="btn btn-outline w-full" onClick={() => setShowCollabDropdown(!showCollabDropdown)}>
                🤝 Collaborate
              </button>
              {showCollabDropdown && (
                <ul className="menu dropdown-content rounded-box bg-base-200 absolute z-10 mt-1 w-full p-2 shadow">
                  <li>
                    <button
                      onClick={() => {
                        setShowCollabDropdown(false);
                        handleShareLink();
                      }}
                      disabled={!safeMessage}
                      className="flex flex-col items-start py-3"
                    >
                      <span className="font-semibold">🔗 Share Link</span>
                      <span className="text-xs opacity-70">Copy link with all signatures</span>
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => {
                        setShowCollabDropdown(false);
                        handleShareSignature();
                      }}
                      disabled={!safeMessage || !hasSignedThisMsg}
                      className={`flex flex-col items-start py-3 ${!safeMessage || !hasSignedThisMsg ? "cursor-not-allowed opacity-40" : ""}`}
                      title={
                        !safeMessage || !hasSignedThisMsg
                          ? "You must sign the message first"
                          : "Share your signature with others"
                      }
                    >
                      <span className="font-semibold">✍️ Share Signature</span>
                      <span className="text-xs opacity-70">Copy link with your signature only</span>
                    </button>
                  </li>
                </ul>
              )}
            </div>
          </div>

          {/* Sign Button */}
          {isOwner && !hasSignedThisMsg && (
            <button className="btn btn-success" onClick={handleSign} disabled={signing}>
              {signing ? (
                <div className="flex items-center gap-2">
                  <span className="loading loading-spinner loading-sm"></span>
                  <span>Signing...</span>
                </div>
              ) : (
                "Sign Message"
              )}
            </button>
          )}

          {hasSignedThisMsg && (
            <div className="alert alert-success">
              <span>You have already signed this message.</span>
            </div>
          )}

          {!isOwner && (
            <div className="alert alert-warning">
              <span>You are not an owner of this Safe and cannot sign this message.</span>
            </div>
          )}

          {/* Send to WalletConnect Button */}
          {isThresholdMet && hasWCRequest && (
            <div className="mt-4">
              <div className="alert alert-info mb-2">
                <div className="flex flex-col">
                  <span className="font-semibold">✓ Threshold met! Ready to respond to dApp.</span>
                  <span className="mt-1 text-xs opacity-70">
                    Note: WalletConnect requests expire after a few minutes. If sending fails, please re-initiate from
                    the dApp.
                  </span>
                </div>
              </div>
              <button className="btn btn-primary w-full" onClick={handleSendToWalletConnect} disabled={sendingToWC}>
                {sendingToWC ? (
                  <div className="flex items-center gap-2">
                    <span className="loading loading-spinner loading-sm"></span>
                    <span>Sending to dApp...</span>
                  </div>
                ) : (
                  "Send Signature to dApp"
                )}
              </button>
            </div>
          )}
        </div>
      </AppCard>
    </AppSection>
  );
}
