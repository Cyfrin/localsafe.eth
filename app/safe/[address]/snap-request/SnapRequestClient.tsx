"use client";

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { ethers } from "ethers";
import useSafe from "@/app/hooks/useSafe";
import { useSafeMessageContext } from "@/app/provider/SafeMessageProvider";
import { useToast, useConfirm } from "@/app/hooks/useToast";
import AppSection from "@/app/components/AppSection";
import AppCard from "@/app/components/AppCard";
import EIP712DataDisplay from "@/app/components/EIP712DataDisplay";
import { SafeMessage, SafeSignature } from "@/app/vendor/safe";
import {
  calculatePersonalSignHash,
  calculateTypedDataHash,
  calculateSafeMessageHashes,
} from "@/app/utils/messageHashing";
import {
  getKeyringRequest,
  approveKeyringRequest,
  rejectKeyringRequest,
  isSnapInternalAccountError,
  removeSafeFromKeyring,
  type KeyringDappRequest,
} from "@/app/utils/snap";

type Eip712View = { safeMessage: string; eip712Hash: string; domainHash: string; messageHash: string };

// EIP-1271 magic value returned by Safe.isValidSignature(bytes32,bytes) when valid.
const EIP1271_MAGIC = "0x1626ba7e";
const EIP1271_ABI = [
  {
    type: "function",
    name: "isValidSignature",
    stateMutability: "view",
    inputs: [
      { name: "hash", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bytes4" }],
  },
] as const;

/**
 * Companion page for a MetaMask keyring request. MetaMask redirects here after a
 * dApp asks the Safe account to sign; we collect owner signatures and resolve
 * the request via `keyring_approveRequest` with the EIP-1271 signature.
 */
export default function SnapRequestClient({ safeAddress }: { safeAddress: `0x${string}` }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [searchParams] = useSearchParams();
  const rid = searchParams.get("rid");
  const { kit, safeInfo } = useSafe(safeAddress);
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { address: connectedAddress } = useAccount();
  const { saveMessage, getAllMessages, removeMessage } = useSafeMessageContext();

  const [request, setRequest] = useState<KeyringDappRequest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [method, setMethod] = useState("");
  const [signParams, setSignParams] = useState<unknown[] | null>(null);
  const [signedMessage, setSignedMessage] = useState<SafeMessage | null>(null);
  const [messageHash, setMessageHash] = useState("");
  const [eip712Data, setEip712Data] = useState<Eip712View | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const [showAddSigModal, setShowAddSigModal] = useState(false);
  const [linkInput, setLinkInput] = useState("");

  // Load the pending request from the snap.
  useEffect(() => {
    if (!rid) {
      setLoadError("No request id in the URL.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const req = await getKeyringRequest(rid);
        if (cancelled) return;
        if (!req) {
          setLoadError("Request not found — it may have already been handled or expired.");
          return;
        }
        setRequest(req);
        setMethod(req.request.method);
        setSignParams((req.request.params as unknown[]) ?? null);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rid]);

  // Compute the SafeMessage EIP-712 hashes for display.
  useEffect(() => {
    if (!signParams || !method || !safeInfo || !chainId) return;
    try {
      let inner: string;
      switch (method) {
        case "personal_sign":
          inner = calculatePersonalSignHash(signParams[0] as string);
          break;
        case "eth_signTypedData":
        case "eth_signTypedData_v4": {
          const td = typeof signParams[1] === "string" ? JSON.parse(signParams[1] as string) : signParams[1];
          if (!td?.domain || !td?.types || !td?.message) {
            setEip712Data(null);
            return;
          }
          inner = calculateTypedDataHash(td).eip712Hash;
          break;
        }
        default:
          setEip712Data(null);
          return;
      }
      const h = calculateSafeMessageHashes(safeAddress, chainId, inner, safeInfo.version || "1.4.1");
      setEip712Data({
        safeMessage: inner,
        eip712Hash: h.eip712Hash,
        domainHash: h.domainHash,
        messageHash: h.messageHash,
      });
    } catch {
      setEip712Data(null);
    }
  }, [signParams, method, safeInfo, chainId, safeAddress]);

  // Build the SafeMessage once the request and Safe are ready — decoupled from the
  // local owner signing. This lets the page share the message and collect signatures
  // even when the snap-account holder is not an owner and never signs locally.
  useEffect(() => {
    if (!request || !kit || !safeInfo || !chainId || !signParams || !method) return;
    if (signedMessage) return;
    let cancelled = false;
    (async () => {
      try {
        const built = extractMessage();
        const hash = await kit.getSafeMessageHash(built as string);
        let base: SafeMessage | null = null;
        const all = getAllMessages(safeAddress, chainId.toString());
        for (const m of all) {
          if ((await kit.getSafeMessageHash(m.data as string)) === hash) {
            base = m;
            break;
          }
        }
        if (!base) base = await kit.createMessage(built as string);
        if (cancelled) return;
        setSignedMessage(base);
        setMessageHash(hash);
        // A message imported with enough signatures can finalize without any local signing.
        if (base.signatures.size >= (safeInfo.threshold || 1)) {
          await resolveIfThresholdMet(base, hash);
        }
      } catch {
        // extractMessage throws on unsupported methods; the page still shows the raw request.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- extractMessage reads method/signParams which are deps; signedMessage guards re-runs
  }, [request, kit, safeInfo, chainId, signParams, method, safeAddress, getAllMessages]);

  function extractMessage(): string | object {
    switch (method) {
      case "personal_sign": {
        const hex = signParams![0] as string;
        if (hex.startsWith("0x")) {
          try {
            return ethers.toUtf8String(hex);
          } catch {
            return hex;
          }
        }
        return hex;
      }
      case "eth_signTypedData":
      case "eth_signTypedData_v4": {
        const raw = signParams![1];
        return typeof raw === "string" ? JSON.parse(raw) : (raw as object);
      }
      default:
        throw new Error(`Unsupported signing method: ${method}`);
    }
  }

  // Confirm the assembled EIP-1271 signature actually validates on-chain for this
  // Safe on the connected chain. Flags (does not block) when it doesn't — usually a
  // chain mismatch (the dApp verifies on a different chain than the Safe lives on).
  async function verifyEip1271OnChain(encoded: string): Promise<void> {
    const innerHash = eip712Data?.safeMessage;
    if (!publicClient || !innerHash) return;
    try {
      const result = await publicClient.readContract({
        address: safeAddress,
        abi: EIP1271_ABI,
        functionName: "isValidSignature",
        args: [innerHash as `0x${string}`, encoded as `0x${string}`],
      });
      if (result !== EIP1271_MAGIC) {
        toast.warning(
          "This signature didn't validate on-chain for this Safe. A dApp will likely reject it — usually a chain mismatch (it verifies on a different chain than this Safe is deployed on).",
        );
      }
    } catch {
      toast.warning(
        "Couldn't verify this signature on-chain — this Safe may not be deployed on the connected network, so a dApp verifying here would reject it.",
      );
    }
  }

  async function resolveIfThresholdMet(signed: SafeMessage, hash: string) {
    const threshold = safeInfo?.threshold || 1;
    if (signed.signatures.size < threshold) {
      toast.success(`Signature added! ${threshold - signed.signatures.size} more needed.`);
      return false;
    }
    const encoded = signed.encodedSignatures();
    await verifyEip1271OnChain(encoded);
    await approveKeyringRequest(request!.id, encoded);
    removeMessage(safeAddress, hash, chainId?.toString());
    setDone(true);
    toast.success("Signed — MetaMask returned the signature to the dApp. You can close this tab.");
    return true;
  }

  const handleSign = async () => {
    if (!request || !signParams || !kit) return;
    setIsProcessing(true);
    try {
      const messageToSign = extractMessage();
      const msgHash = await kit.getSafeMessageHash(messageToSign as string);

      // Reuse any signatures already collected (built-on-load message, share-link, P2P).
      let base = signedMessage;
      const all = getAllMessages(safeAddress, chainId?.toString());
      for (const m of all) {
        if ((await kit.getSafeMessageHash(m.data as string)) === msgHash) {
          base = m;
          break;
        }
      }
      if (!base) base = await kit.createMessage(messageToSign as string);

      const signed = await kit.signMessage(base);
      saveMessage(safeAddress, signed, msgHash, chainId?.toString());
      setSignedMessage(signed);
      setMessageHash(msgHash);
      const resolved = await resolveIfThresholdMet(signed, msgHash);
      if (!resolved) setIsProcessing(false);
    } catch (err) {
      if (isSnapInternalAccountError(err)) {
        const removeIt = await confirm(
          "MetaMask won't sign this because the Safe is registered as one of its accounts (it blocks signing with your own account as the verifying contract). Confirm to remove the Safe from MetaMask so you can sign — or cancel and sign with a different owner wallet instead. The request stays open; re-add the Safe from the dashboard afterward.",
          "Safe is registered in MetaMask",
        );
        if (removeIt) {
          try {
            const removed = await removeSafeFromKeyring(safeAddress);
            if (removed) {
              toast.success("Removed this Safe from MetaMask. Press Sign again.");
            } else {
              toast.info("Couldn't find this Safe in MetaMask — sign with a different owner wallet.");
            }
          } catch (rmErr) {
            toast.error(`Couldn't remove from MetaMask: ${rmErr instanceof Error ? rmErr.message : String(rmErr)}`);
          }
        } else {
          toast.info("Switch the connected wallet in localsafe to a different owner to sign.");
        }
      } else {
        toast.error(`Failed to sign: ${err instanceof Error ? err.message : String(err)}`);
      }
      setIsProcessing(false);
    }
  };

  // Copy a co-signing link with the message + whatever signatures exist so far. Other
  // owners open localsafe, import it, and sign — then send their signature back.
  const handleShareLink = () => {
    if (!signedMessage || !chainId) return;
    try {
      const signatures = Array.from(signedMessage.signatures.values()).map((sig) => ({
        signer: sig.signer,
        data: sig.data,
        isContractSignature: sig.isContractSignature,
      }));
      const encoded = btoa(JSON.stringify({ message: { data: signedMessage.data, signatures } }));
      const shareUrl = `${window.location.origin}/#/safe/${safeAddress}?importMsg=${encodeURIComponent(encoded)}&chainId=${chainId}`;
      navigator.clipboard.writeText(shareUrl);
      toast.success("Co-signing link copied — send it to another owner.");
    } catch (err) {
      toast.error(`Failed to create share link: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Copy a link carrying only the local owner's signature, to send back to the approving tab.
  const handleShareSignature = () => {
    if (!signedMessage || !chainId || !connectedAddress) return;
    try {
      const userSignature = Array.from(signedMessage.signatures.values()).find(
        (sig) => sig.signer.toLowerCase() === connectedAddress.toLowerCase(),
      );
      if (!userSignature) {
        toast.error("You haven't signed this message yet.");
        return;
      }
      const signature = {
        signer: userSignature.signer,
        data: userSignature.data,
        isContractSignature: userSignature.isContractSignature,
      };
      const encoded = btoa(JSON.stringify({ signature, messageHash }));
      const shareUrl = `${window.location.origin}/#/safe/${safeAddress}?importMsgSig=${encodeURIComponent(encoded)}&chainId=${chainId}`;
      navigator.clipboard.writeText(shareUrl);
      toast.success("Signature link copied — send it back to the approving tab.");
    } catch (err) {
      toast.error(`Failed to create signature link: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Add signatures from a co-signing link another owner sent — accepts BOTH the
  // "all signatures" (?importMsg=) link and the "my signature" (?importMsgSig=) link
  // (the exact links the message-detail / share buttons produce).
  const handleAddSignature = async () => {
    if (!signedMessage || !kit) return;
    const input = linkInput.trim();
    if (!input) {
      toast.error("Paste the co-signing link another owner sent you.");
      return;
    }
    try {
      const decodeParam = (name: string): string | null => {
        const m = input.match(new RegExp(`[?&]${name}=([^&\\s]+)`));
        return m ? decodeURIComponent(m[1]) : null;
      };
      let collected: SafeSignature[] = [];
      const sigPayload = decodeParam("importMsgSig");
      const msgPayload = decodeParam("importMsg");
      if (sigPayload) {
        const { signature, messageHash: mh } = JSON.parse(atob(sigPayload));
        if (mh && mh !== messageHash) {
          toast.error("That signature is for a different message.");
          return;
        }
        collected = [new SafeSignature(signature.signer, signature.data, signature.isContractSignature)];
      } else if (msgPayload) {
        const { message } = JSON.parse(atob(msgPayload));
        if ((await kit.getSafeMessageHash(message.data)) !== messageHash) {
          toast.error("That link is for a different message.");
          return;
        }
        collected = (message.signatures ?? []).map(
          (s: { signer: string; data: string; isContractSignature?: boolean }) =>
            new SafeSignature(s.signer, s.data, s.isContractSignature),
        );
      } else {
        toast.error("That doesn't look like a co-signing link. Paste the link another owner copied.");
        return;
      }
      const merged = new SafeMessage(signedMessage.data);
      signedMessage.signatures.forEach((sig) => merged.addSignature(sig));
      collected.forEach((sig) => merged.addSignature(sig));
      saveMessage(safeAddress, merged, messageHash, chainId?.toString());
      setSignedMessage(merged);
      setLinkInput("");
      setShowAddSigModal(false);
      await resolveIfThresholdMet(merged, messageHash);
    } catch (err) {
      toast.error(`Couldn't read that link: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Re-read storage for the same message; adopt it if it gained signatures elsewhere.
  const handleCheckForUpdates = async () => {
    if (!kit || !signedMessage) return;
    try {
      const all = getAllMessages(safeAddress, chainId?.toString());
      for (const m of all) {
        if ((await kit.getSafeMessageHash(m.data as string)) !== messageHash) continue;
        if (m.signatures.size > signedMessage.signatures.size) {
          setSignedMessage(m);
          toast.success(`Found ${m.signatures.size - signedMessage.signatures.size} new signature(s)!`);
          await resolveIfThresholdMet(m, messageHash);
        } else {
          toast.info("No new signatures yet.");
        }
        return;
      }
      toast.info("No new signatures yet.");
    } catch (err) {
      toast.error(`Failed to check for updates: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleReject = async () => {
    if (request) {
      try {
        await rejectKeyringRequest(request.id);
      } catch {
        // best-effort
      }
    }
    navigate(`/safe/${safeAddress}`);
  };

  if (loadError) {
    return (
      <AppSection>
        <AppCard title="Snap request">
          <div className="py-8 text-center">
            <p>{loadError}</p>
            <button className="btn btn-primary mt-4" onClick={() => navigate(`/safe/${safeAddress}`)}>
              Back to Safe
            </button>
          </div>
        </AppCard>
      </AppSection>
    );
  }

  if (done) {
    return (
      <AppSection>
        <AppCard title="Request complete">
          <div className="py-8 text-center">
            <p className="mb-2">✅ The signature was sent back to the dApp through MetaMask.</p>
            <p className="text-sm text-gray-500">You can close this tab, or return to your Safe.</p>
            <button className="btn btn-primary mt-4" onClick={() => navigate(`/safe/${safeAddress}`)}>
              Back to Safe
            </button>
          </div>
        </AppCard>
      </AppSection>
    );
  }

  if (!request || !signParams) {
    return (
      <AppSection>
        <AppCard title="Snap request">
          <div className="flex items-center justify-center gap-2 py-8">
            <span className="loading loading-spinner loading-sm"></span>
            <span>Loading request from MetaMask…</span>
          </div>
        </AppCard>
      </AppSection>
    );
  }

  let messageToDisplay = "";
  try {
    if (method === "personal_sign") {
      const hex = signParams[0] as string;
      messageToDisplay = hex?.startsWith("0x")
        ? (() => {
            try {
              return ethers.toUtf8String(hex);
            } catch {
              return hex;
            }
          })()
        : String(hex);
    } else {
      const raw = signParams[1];
      messageToDisplay = JSON.stringify(typeof raw === "string" ? JSON.parse(raw) : raw, null, 2);
    }
  } catch {
    messageToDisplay = JSON.stringify(signParams, null, 2);
  }

  const threshold = safeInfo?.threshold ?? 1;
  const sigCount = signedMessage?.signatures.size ?? 0;
  const alreadySigned = Boolean(
    signedMessage && connectedAddress && signedMessage.signatures?.has(connectedAddress.toLowerCase()),
  );
  const thresholdMet = sigCount >= threshold;
  const canCollect = Boolean(signedMessage && safeInfo && !thresholdMet);

  return (
    <AppSection testid="snap-request-section">
      <div className="mb-4">
        <button className="btn btn-ghost btn-sm" onClick={handleReject} data-testid="snap-request-cancel-btn">
          ← Reject & back to Safe
        </button>
      </div>

      <AppCard title="Sign request from MetaMask" testid="snap-request-card">
        <div className="flex flex-col gap-4">
          <div className="bg-base-200 rounded-box p-4">
            <h5 className="mb-1 font-semibold">Requested by</h5>
            <p className="font-mono text-sm break-all">{request.origin || "a connected dApp"}</p>
            <p className="mt-2 text-sm">
              Method: <span className="font-mono">{method}</span>
            </p>
          </div>

          {!safeInfo && <div className="alert alert-info">Connect an owner wallet to sign this request.</div>}

          <div className="bg-base-200 rounded-box p-4">
            <h5 className="mb-2 font-semibold">Message</h5>
            <pre className="bg-base-300 max-h-64 overflow-y-auto rounded p-3 text-sm break-all whitespace-pre-wrap">
              {messageToDisplay}
            </pre>
          </div>

          {eip712Data && (
            <EIP712DataDisplay
              domainHash={eip712Data.domainHash}
              messageHash={eip712Data.messageHash}
              eip712Hash={eip712Data.eip712Hash}
              safeMessage={eip712Data.safeMessage}
            />
          )}

          {signedMessage && safeInfo && (
            <div className="bg-base-200 rounded-box p-4">
              <div className="mb-2 flex items-center justify-between">
                <h5 className="font-semibold">
                  Signatures ({sigCount}/{threshold})
                </h5>
                <span className={`badge ${sigCount >= threshold ? "badge-success" : "badge-warning"}`}>
                  {sigCount >= threshold ? "Threshold met!" : `${threshold - sigCount} more needed`}
                </span>
              </div>
              {Array.from(signedMessage.signatures.values()).map((sig, idx) => (
                <div key={idx} className="bg-base-300 mb-1 rounded p-2 text-xs break-all">
                  <span className="font-semibold">Signer {idx + 1}:</span> {sig.signer}
                </div>
              ))}
            </div>
          )}

          {canCollect && (
            <div className="bg-base-200 rounded-box flex flex-col gap-2 p-4" data-testid="snap-request-collect">
              <h5 className="font-mono text-xs tracking-wide opacity-70">CO-SIGN WITH OTHER OWNERS</h5>
              <p className="font-mono text-xs opacity-60">
                No backend — collect signatures via share-links. Send the co-signing link to other owners; they sign in
                their own browser and send their signature back.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-outline btn-sm flex-1"
                  onClick={handleShareLink}
                  data-testid="snap-request-share-link-btn"
                >
                  🔗 Share co-signing link
                </button>
                {alreadySigned && (
                  <button
                    className="btn btn-outline btn-sm flex-1"
                    onClick={handleShareSignature}
                    data-testid="snap-request-share-sig-btn"
                  >
                    ✍️ Share my signature
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-outline btn-sm flex-1"
                  onClick={() => setShowAddSigModal(true)}
                  data-testid="snap-request-add-sig-btn"
                >
                  📋 Paste co-signing link
                </button>
                <button
                  className="btn btn-outline btn-sm flex-1"
                  onClick={handleCheckForUpdates}
                  data-testid="snap-request-check-updates-btn"
                >
                  🔄 Check for signature updates
                </button>
              </div>
            </div>
          )}

          <p className="font-mono text-xs opacity-60" data-testid="snap-request-two-wallet-note">
            This Safe is registered in MetaMask, so sign here with a different owner wallet (a separate profile or
            hardware wallet) — or remove it from the dashboard first, then re-add anytime.
          </p>

          <div className="mt-2 flex gap-2">
            <button
              className="btn btn-error btn-outline flex-1"
              onClick={handleReject}
              disabled={isProcessing}
              data-testid="snap-request-reject-btn"
            >
              Reject
            </button>
            <button
              className="btn btn-success flex-1"
              onClick={handleSign}
              disabled={isProcessing || !kit || alreadySigned}
              data-testid="snap-request-sign-btn"
            >
              {isProcessing ? (
                <span className="loading loading-spinner loading-sm"></span>
              ) : alreadySigned ? (
                "Already signed"
              ) : (
                "Sign"
              )}
            </button>
          </div>

          <div className="alert alert-warning">
            <span>
              Only sign messages you trust. Need more owners? Share this Safe&apos;s signing link or co-sign live.
            </span>
          </div>
        </div>
      </AppCard>

      {showAddSigModal && (
        <div className="modal modal-open" data-testid="snap-request-add-sig-modal">
          <div className="modal-box">
            <h3 className="mb-4 text-lg font-bold">Paste a co-signing link</h3>
            <p className="mb-4 text-sm text-gray-500">
              Paste the link another owner sent you — either their &quot;Copy link with your signature&quot; link or the
              &quot;Copy link with all signatures&quot; link. We&apos;ll pull the signature(s) out and add them.
            </p>

            <div className="form-control mb-4">
              <textarea
                placeholder="https://…/#/safe/0x…?importMsgSig=…"
                className="textarea textarea-bordered w-full font-mono text-xs"
                rows={4}
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                data-testid="snap-request-link-textarea"
              />
            </div>

            <div className="modal-action">
              <button
                className="btn"
                onClick={() => {
                  setShowAddSigModal(false);
                  setLinkInput("");
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAddSignature}
                data-testid="snap-request-add-sig-confirm"
              >
                Add Signatures
              </button>
            </div>
          </div>
        </div>
      )}
    </AppSection>
  );
}
