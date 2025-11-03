"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWalletConnect } from "@/app/provider/WalletConnectProvider";
import { useSafeMessageContext } from "@/app/provider/SafeMessageProvider";
import { useToast } from "@/app/hooks/useToast";
import useSafe from "@/app/hooks/useSafe";
import AppSection from "@/app/components/AppSection";
import AppCard from "@/app/components/AppCard";
import { useAccount, useChainId } from "wagmi";
import { ethers } from "ethers";

export default function WalletConnectSignClient({ safeAddress }: { safeAddress: `0x${string}` }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { pendingRequest, approveRequest, rejectRequest, clearPendingRequest } = useWalletConnect();
  const { saveMessage, getAllMessages, removeMessage } = useSafeMessageContext();
  const { kit, safeInfo } = useSafe(safeAddress);
  const chainId = useChainId();
  const { address: connectedAddress } = useAccount();

  const [signParams, setSignParams] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [requestFromStorage, setRequestFromStorage] = useState<any>(null);
  const [method, setMethod] = useState<string>("");
  const [eip712Data, setEip712Data] = useState<{
    safeMessage: string;
    eip712Hash: string;
    domainHash: string;
    messageHash: string;
  } | null>(null);
  const [signedMessage, setSignedMessage] = useState<any>(null);
  const [messageHash, setMessageHash] = useState<string>("");
  const [showAddSigModal, setShowAddSigModal] = useState(false);
  const [signerAddress, setSignerAddress] = useState("");
  const [signatureData, setSignatureData] = useState("");

  // Flash the tab title to get user's attention
  useEffect(() => {
    const originalTitle = document.title || "LocalSafe";
    let isVisible = true;

    // Set initial state
    document.title = "🔔 Sign Message!";

    const interval = setInterval(() => {
      document.title = isVisible ? "🔔 Sign Message!" : originalTitle;
      isVisible = !isVisible;
    }, 1000); // Flash every second

    return () => {
      clearInterval(interval);
      document.title = originalTitle;
    };
  }, []);

  // Load request from sessionStorage if not in context
  useEffect(() => {
    if (!pendingRequest && typeof window !== "undefined") {
      const stored = sessionStorage.getItem("wc-pending-request");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setRequestFromStorage(parsed);

          const requestMethod = parsed.params?.request?.method;
          setMethod(requestMethod);
          setSignParams(parsed.params?.request?.params);
        } catch (e) {
          console.error("Failed to parse stored request:", e);
        }
      }
    } else if (pendingRequest) {
      const { params } = pendingRequest;
      setMethod(params.request.method);
      setSignParams(params.request.params);
    }
  }, [pendingRequest]);

  const currentRequest = pendingRequest || requestFromStorage;

  // Calculate EIP-712 hashes for SafeMessage
  useEffect(() => {
    if (!signParams || !method || !safeInfo || !chainId) return;

    try {
      // Extract the message and calculate SafeMessage based on the signing method
      let safeMessageMessage: string;

      switch (method) {
        case "personal_sign": {
          // For personal_sign, Safe SDK applies EIP-191 to the LITERAL hex string (not decoded)
          const message = signParams[0];
          // Apply EIP-191 hash to the literal message (hex string as-is, or plain string)
          safeMessageMessage = ethers.hashMessage(message);
          break;
        }
        case "eth_sign": {
          // For eth_sign, apply EIP-191 to the literal message
          const message = signParams[1];
          safeMessageMessage = ethers.hashMessage(message);
          break;
        }
        case "eth_signTypedData":
        case "eth_signTypedData_v4": {
          // For typed data, the SafeMessage is the EIP-712 hash of the typed data itself
          const typedDataString = signParams[1];
          const typedData = typeof typedDataString === "string" ? JSON.parse(typedDataString) : typedDataString;
          const { domain, types, message } = typedData;

          if (!domain || !types || !message) {
            console.error("Invalid typed data structure");
            setEip712Data(null);
            return;
          }

          // The SafeMessage for EIP-712 is the hash of the original typed data
          safeMessageMessage = ethers.TypedDataEncoder.hash(domain, types, message);
          break;
        }
        default:
          setEip712Data(null);
          return;
      }

      // Now calculate SafeMessage (what the user is actually signing)

      // SafeMessage EIP-712 domain
      const safeVersion = safeInfo.version || "1.4.1";
      const includeChainId = safeVersion >= "1.3.0";
      const domain = includeChainId
        ? {
          chainId: chainId,
          verifyingContract: safeAddress,
        }
        : {
          verifyingContract: safeAddress,
        };

      // SafeMessage EIP-712 types
      const types = {
        SafeMessage: [{ name: "message", type: "bytes" }],
      };

      // SafeMessage message structure
      const message = {
        message: safeMessageMessage,
      };

      // Calculate the hashes
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
      setEip712Data(null);
    }
  }, [signParams, method, safeInfo, chainId, safeAddress]);

  const handleSign = async () => {
    if (!currentRequest || !signParams || !kit) return;

    setIsProcessing(true);
    try {
      // For Safe wallets, we need to wrap the original message in a SafeMessage structure
      let messageToSign: string | object;

      // Extract the message based on the signing method
      switch (method) {
        case "personal_sign": {
          // personal_sign params: [message, address]
          messageToSign = signParams[0];
          break;
        }

        case "eth_sign": {
          // eth_sign params: [address, message]
          messageToSign = signParams[1];
          break;
        }

        case "eth_signTypedData":
        case "eth_signTypedData_v4": {
          // signTypedData params: [address, typedData]
          const typedDataString = signParams[1];
          messageToSign = typeof typedDataString === "string" ? JSON.parse(typedDataString) : typedDataString;
          break;
        }

        default:
          throw new Error(`Unsupported signing method: ${method}`);
      }

      // Get the message hash first
      const msgHash = await kit.getSafeMessageHash(messageToSign as string);
      setMessageHash(msgHash);

      // Check if there's an existing message with signatures in storage
      let messageToSignWith;
      if (signedMessage) {
        // Use the existing message that already has signatures
        messageToSignWith = signedMessage;
      } else {
        // Check storage for existing message
        const allMessages = getAllMessages(safeAddress, chainId?.toString());
        let existingMessage = null;
        for (const msg of allMessages) {
          const hash = await kit.getSafeMessageHash(msg.data as any);
          if (hash === msgHash) {
            existingMessage = msg;
            break;
          }
        }

        if (existingMessage && existingMessage.signatures.size > 0) {
          // Use existing message with signatures
          messageToSignWith = existingMessage;
        } else {
          // Create a new Safe message (wraps the original message)
          messageToSignWith = await kit.createMessage(messageToSign as string);
        }
      }

      // Sign the Safe message with the current owner's EOA
      const newSignedMessage = await kit.signMessage(messageToSignWith);

      // Get the signature for this owner
      const signerAddress = await kit.getSafeProvider().getSignerAddress();
      if (!signerAddress) {
        throw new Error("No signer address available");
      }
      const ownerSignature = newSignedMessage.getSignature(signerAddress);

      if (!ownerSignature) {
        throw new Error("Failed to get signature from signed message");
      }

      // Save the signed message to storage for multi-sig collection
      saveMessage(safeAddress, newSignedMessage, msgHash, chainId?.toString());

      // Store the signed message in state
      setSignedMessage(newSignedMessage);

      // Check if threshold is met (number of signatures >= threshold)
      const signatureCount = newSignedMessage.signatures.size;
      const threshold = safeInfo?.threshold || 1;
      const isThresholdMet = signatureCount >= threshold;

      if (isThresholdMet) {
        // Threshold met - respond to WalletConnect immediately
        // Get the combined/encoded signature from all signers
        // Safe's encodedSignatures() automatically sorts by signer address
        const encodedSignature = newSignedMessage.encodedSignatures();

        // Log the signature for debugging
        console.log("Sending signature to WalletConnect:", {
          encodedSignature,
          signatureCount: newSignedMessage.signatures.size,
          signatures: Array.from(newSignedMessage.signatures.entries()).map(([addr, sig]) => ({
            address: addr,
            signature: sig.data,
          })),
          safeAddress,
          method,
        });

        await approveRequest(currentRequest.topic, {
          id: currentRequest.id,
          jsonrpc: "2.0",
          result: encodedSignature,
        });

        // Clear from sessionStorage
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("wc-pending-request");
        }

        toast.success("Message signed and sent to dApp!");
        navigate(`/safe/${safeAddress}`);
      } else {
        // More signatures needed - stay on this page to collect more
        toast.success(
          `Signature added! ${threshold - signatureCount} more signature${threshold - signatureCount > 1 ? "s" : ""} needed.`,
        );
        // Don't navigate away - keep the WalletConnect request active
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Failed to sign message:", error);

      // Check if user rejected the request
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isUserRejection =
        errorMessage.toLowerCase().includes("reject") ||
        errorMessage.toLowerCase().includes("denied") ||
        errorMessage.toLowerCase().includes("cancel");

      if (isUserRejection) {
        // User rejected - clean up and reject the WalletConnect request
        try {
          await rejectRequest(
            currentRequest.topic,
            {
              code: 4001,
              message: "User rejected the signing request",
            },
            currentRequest.id,
          );
        } catch (rejectError) {
          console.error("Failed to reject WalletConnect request:", rejectError);
        }

        // Clear session storage
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("wc-pending-request");
        }

        // Clear pending request state
        clearPendingRequest();

        // Navigate back
        navigate(`/safe/${safeAddress}`);
      } else {
        // Other error - show alert and allow retry
        alert(`Failed to sign message: ${errorMessage}`);
        setIsProcessing(false);
      }
    }
  };

  const handleAddSignature = async () => {
    if (!signedMessage || !kit || !signerAddress || !signatureData) {
      toast.error("Please provide both signer address and signature data");
      return;
    }

    try {
      // Validate address format
      if (!signerAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        toast.error("Invalid signer address format");
        return;
      }

      // Validate signature format
      if (!signatureData.match(/^0x[a-fA-F0-9]+$/)) {
        toast.error("Invalid signature format");
        return;
      }

      // Import the EthSafeSignature class
      const { EthSafeSignature } = await import("@safe-global/protocol-kit");

      // Add the signature to the message
      const ethSignature = new EthSafeSignature(signerAddress, signatureData, false);
      signedMessage.addSignature(ethSignature);

      // Save updated message
      saveMessage(safeAddress, signedMessage, messageHash, chainId?.toString());
      setSignedMessage({ ...signedMessage }); // Force re-render

      // Clear form
      setSignerAddress("");
      setSignatureData("");
      setShowAddSigModal(false);

      toast.success("Signature added!");

      // Check if threshold is met
      const threshold = safeInfo?.threshold || 1;
      if (signedMessage.signatures.size >= threshold && currentRequest) {
        const encodedSignature = signedMessage.encodedSignatures();
        await approveRequest(currentRequest.topic, {
          id: currentRequest.id,
          jsonrpc: "2.0",
          result: encodedSignature,
        });
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("wc-pending-request");
        }
        removeMessage(safeAddress, messageHash, chainId?.toString());
        toast.success("Threshold met! Message signed and sent to dApp!");
        navigate(`/safe/${safeAddress}`);
      }
    } catch (error) {
      console.error("Failed to add signature:", error);
      toast.error("Failed to add signature");
    }
  };

  const handleReject = async () => {
    if (!currentRequest) return;

    setIsProcessing(true);
    try {
      await rejectRequest(
        currentRequest.topic,
        {
          code: 4001,
          message: "User rejected the request",
        },
        currentRequest.id, // Pass the request ID
      );
    } catch (error) {
      console.error("Failed to reject signing:", error);
      alert(`Failed to reject signing: ${error instanceof Error ? error.message : String(error)}`);
      setIsProcessing(false);
      return;
    } finally {
      // Always clear pending request state
      clearPendingRequest();
    }

    navigate(`/safe/${safeAddress}`);
  };

  if (!currentRequest || !signParams) {
    return (
      <AppSection>
        <AppCard title="WalletConnect Signing Request">
          <div className="py-8 text-center">
            <p>No pending signing request found.</p>
            <button className="btn btn-primary mt-4" onClick={() => navigate(`/safe/${safeAddress}`)}>
              Back to Safe
            </button>
          </div>
        </AppCard>
      </AppSection>
    );
  }

  const dappMetadata =
    (currentRequest.params as any)?.proposer?.metadata || (currentRequest.verifyContext as any)?.verified?.metadata;

  // Format the message for display
  let messageToDisplay = "";
  try {
    if (method === "personal_sign" || method === "eth_sign") {
      const message = signParams[0] || signParams[1];
      // Try to decode hex message
      if (message.startsWith("0x")) {
        try {
          messageToDisplay = new TextDecoder().decode(
            new Uint8Array(
              message
                .match(/.{1,2}/g)
                .slice(1)
                .map((byte: string) => parseInt(byte, 16)),
            ),
          );
        } catch {
          messageToDisplay = message;
        }
      } else {
        messageToDisplay = message;
      }
    } else if (method === "eth_signTypedData" || method === "eth_signTypedData_v4") {
      const typedData = typeof signParams[1] === "string" ? JSON.parse(signParams[1]) : signParams[1];
      messageToDisplay = JSON.stringify(typedData, null, 2);
    }
  } catch {
    messageToDisplay = JSON.stringify(signParams, null, 2);
  }

  return (
    <AppSection testid="wc-sign-section">
      <div className="mb-4">
        <button
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            if (currentRequest) {
              try {
                await rejectRequest(
                  currentRequest.topic,
                  {
                    code: 4001,
                    message: "User cancelled the request",
                  },
                  currentRequest.id, // Pass the request ID
                );
              } catch (error) {
                console.error("Failed to reject request:", error);
              } finally {
                // Always clear pending request state as a safety measure
                clearPendingRequest();
              }
            }
            navigate(`/safe/${safeAddress}`);
          }}
          data-testid="wc-sign-cancel-btn"
        >
          ← Back to Safe
        </button>
      </div>

      <AppCard title="WalletConnect Signature Request" data-testid="wc-sign-card">
        <div className="flex flex-col gap-4">
          {/* dApp Info */}
          {dappMetadata && (
            <div className="bg-base-200 rounded-box p-4">
              <div className="mb-2 flex items-center gap-3">
                {dappMetadata.icons?.[0] && (
                  <img src={dappMetadata.icons[0]} alt={dappMetadata.name} className="h-12 w-12 rounded" />
                )}
                <div>
                  <h4 className="text-lg font-bold">{dappMetadata.name}</h4>
                  <p className="text-sm text-gray-500">{dappMetadata.url}</p>
                </div>
              </div>
              <p className="text-sm">{dappMetadata.description}</p>
            </div>
          )}

          {/* Signing Method */}
          <div className="bg-base-200 rounded-box p-4">
            <h5 className="mb-2 font-semibold">Signing Method</h5>
            <p className="font-mono text-sm">{method}</p>
          </div>

          {/* Message to Sign */}
          <div className="bg-base-200 rounded-box p-4">
            <h5 className="mb-2 font-semibold">Message</h5>
            <pre className="bg-base-300 max-h-64 overflow-y-auto rounded p-3 text-sm break-all whitespace-pre-wrap">
              {messageToDisplay}
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

          {/* Signature Collection Progress */}
          {signedMessage && safeInfo && (
            <div className="bg-base-200 rounded-box p-4">
              <div className="mb-2 flex items-center justify-between">
                <h5 className="font-semibold">
                  Signatures ({signedMessage.signatures.size}/{safeInfo.threshold})
                </h5>
                {signedMessage.signatures.size < safeInfo.threshold && (
                  <span className="badge badge-warning">
                    {safeInfo.threshold - signedMessage.signatures.size} more needed
                  </span>
                )}
                {signedMessage.signatures.size >= safeInfo.threshold && (
                  <span className="badge badge-success">Threshold met!</span>
                )}
              </div>
              <div className="space-y-2">
                {Array.from(signedMessage.signatures.values()).map((sig: any, idx: number) => (
                  <div key={idx} className="bg-base-300 rounded p-2">
                    <div className="text-xs">
                      <span className="font-semibold">Signer {idx + 1}:</span> {sig.signer}
                    </div>
                    <div className="text-xs text-gray-500 truncate">Signature: {sig.data}</div>
                  </div>
                ))}
              </div>
              {signedMessage.signatures.size < safeInfo.threshold && (
                <div className="mt-4 space-y-2">
                  <div className="alert alert-info">
                    <span className="text-sm">
                      Keep this page open. Share the message link with other signers, or have them import their
                      signature. Click "Check for Updates" after they've signed.
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-outline btn-sm flex-1"
                      onClick={() => setShowAddSigModal(true)}
                    >
                      ➕ Add Signature Manually
                    </button>
                    <button
                      className="btn btn-outline btn-sm flex-1"
                      onClick={async () => {
                        if (!kit) return;
                        try {
                          const allMessages = getAllMessages(safeAddress, chainId?.toString());
                          for (const msg of allMessages) {
                            const hash = await kit.getSafeMessageHash(msg.data as any);
                            if (hash === messageHash) {
                              if (msg.signatures.size > signedMessage.signatures.size) {
                                setSignedMessage(msg);
                                toast.success(
                                  `Found ${msg.signatures.size - signedMessage.signatures.size} new signature(s)!`,
                                );

                                // Check if threshold is now met
                                const threshold = safeInfo?.threshold || 1;
                                if (msg.signatures.size >= threshold && currentRequest) {
                                  const encodedSignature = msg.encodedSignatures();
                                  await approveRequest(currentRequest.topic, {
                                    id: currentRequest.id,
                                    jsonrpc: "2.0",
                                    result: encodedSignature,
                                  });
                                  if (typeof window !== "undefined") {
                                    sessionStorage.removeItem("wc-pending-request");
                                  }
                                  removeMessage(safeAddress, messageHash, chainId?.toString());
                                  toast.success("Threshold met! Message signed and sent to dApp!");
                                  navigate(`/safe/${safeAddress}`);
                                  return;
                                }
                              } else {
                                toast.info("No new signatures yet");
                              }
                              break;
                            }
                          }
                        } catch (error) {
                          console.error("Failed to check for updates:", error);
                          toast.error("Failed to check for signature updates");
                        }
                      }}
                    >
                      🔄 Check for Signature Updates
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-4 flex gap-2">
            <button
              className="btn btn-error btn-outline flex-1"
              onClick={handleReject}
              disabled={isProcessing}
              data-testid="wc-sign-reject-btn"
            >
              {isProcessing ? <span className="loading loading-spinner loading-sm"></span> : "Reject"}
            </button>
            <button
              className="btn btn-success flex-1"
              onClick={handleSign}
              disabled={
                isProcessing ||
                (signedMessage &&
                  connectedAddress &&
                  signedMessage.signatures?.has(connectedAddress.toLowerCase()))
              }
              data-testid="wc-sign-approve-btn"
            >
              {isProcessing ? (
                <div className="flex items-center gap-2">
                  <span className="loading loading-spinner loading-sm"></span>
                  <span>Signing...</span>
                </div>
              ) : signedMessage && connectedAddress && signedMessage.signatures?.has(connectedAddress.toLowerCase()) ? (
                "Already Signed"
              ) : (
                "Sign Message"
              )}
            </button>
          </div>

          {signedMessage && connectedAddress && signedMessage.signatures?.has(connectedAddress.toLowerCase()) && (
            <div className="alert alert-success mt-4">
              <span>Your connected wallet has already signed this message. Switch wallets to sign with another signer.</span>
            </div>
          )}

          <div className="alert alert-warning mt-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 shrink-0 stroke-current"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>Only sign messages you trust. Signing malicious messages can result in loss of funds.</span>
          </div>
        </div>
      </AppCard>

      {/* Add Signature Modal */}
      {showAddSigModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="mb-4 text-lg font-bold">Add Signature Manually</h3>
            <p className="mb-4 text-sm text-gray-500">
              Add a signature from another signer who signed this message offline or using a different tool.
            </p>

            <div className="form-control mb-4">
              <label className="label">
                <span className="label-text">Signer Address</span>
              </label>
              <input
                type="text"
                placeholder="0x..."
                className="input input-bordered w-full font-mono"
                value={signerAddress}
                onChange={(e) => setSignerAddress(e.target.value)}
              />
              <label className="label">
                <span className="label-text-alt">The address that signed the message</span>
              </label>
            </div>

            <div className="form-control mb-4">
              <label className="label">
                <span className="label-text">Signature Data</span>
              </label>
              <textarea
                placeholder="0x..."
                className="textarea textarea-bordered w-full font-mono text-xs"
                rows={4}
                value={signatureData}
                onChange={(e) => setSignatureData(e.target.value)}
              />
              <label className="label">
                <span className="label-text-alt">The hex-encoded signature data</span>
              </label>
            </div>

            <div className="modal-action">
              <button
                className="btn"
                onClick={() => {
                  setShowAddSigModal(false);
                  setSignerAddress("");
                  setSignatureData("");
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleAddSignature}>
                Add Signature
              </button>
            </div>
          </div>
        </div>
      )}
    </AppSection>
  );
}
