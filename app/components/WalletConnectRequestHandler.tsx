"use client";

import { useEffect, useRef } from "react";
import { useWalletConnect } from "../provider/WalletConnectProvider";
import { useNavigate, useParams, useLocation } from "react-router-dom";

/**
 * WalletConnectRequestHandler component that monitors for WalletConnect transaction requests
 * and redirects to the transaction builder when a request is received.
 * Also auto-rejects requests when navigating away from WalletConnect pages.
 */
export default function WalletConnectRequestHandler() {
  const { pendingRequest, rejectRequest, clearPendingRequest } = useWalletConnect();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const { address: safeAddress } = useParams<{ address?: string }>();
  const processedRequestIds = useRef(new Set<number>());
  const lastRequestId = useRef<number | null>(null);
  const isNavigatingToWcPage = useRef(false);

  // Handle incoming requests and route to appropriate pages
  useEffect(() => {
    if (!pendingRequest) {
      return;
    }

    if (processedRequestIds.current.has(pendingRequest.id)) {
      return;
    }

    const { params } = pendingRequest;
    const { request } = params;

    // Store the last request ID for cleanup tracking
    lastRequestId.current = pendingRequest.id;

    // Handle eth_sendTransaction
    if (request.method === "eth_sendTransaction") {
      processedRequestIds.current.add(pendingRequest.id);

      if (!safeAddress) {
        alert("Please navigate to a Safe before sending transactions via WalletConnect");
        return;
      }

      // Navigate to a WalletConnect transaction handling page
      // We'll store the request in sessionStorage so the transaction page can access it
      if (typeof window !== "undefined") {
        sessionStorage.setItem("wc-pending-request", JSON.stringify(pendingRequest));
      }

      // Set flag to prevent auto-reject during navigation
      isNavigatingToWcPage.current = true;

      // Navigate to the Safe's WalletConnect transaction page
      navigate(`/safe/${safeAddress}/wc-tx`);
    }

    // Handle other methods like eth_signTypedData, eth_sign, personal_sign, etc.
    else if (
      request.method === "eth_signTypedData" ||
      request.method === "eth_signTypedData_v4" ||
      request.method === "personal_sign" ||
      request.method === "eth_sign"
    ) {
      processedRequestIds.current.add(pendingRequest.id);

      if (!safeAddress) {
        alert("Please navigate to a Safe before signing messages via WalletConnect");
        return;
      }

      // Store in sessionStorage
      if (typeof window !== "undefined") {
        sessionStorage.setItem("wc-pending-request", JSON.stringify(pendingRequest));
      }

      // Set flag to prevent auto-reject during navigation
      isNavigatingToWcPage.current = true;

      // Navigate to the Safe's WalletConnect signing page
      navigate(`/safe/${safeAddress}/wc-sign`);
    }
  }, [pendingRequest, navigate, safeAddress]);

  // Auto-reject requests when navigating away from WalletConnect pages
  useEffect(() => {
    // Check if we have a pending request and we're NOT on a WalletConnect page
    if (pendingRequest && pathname) {
      const isOnWcPage = pathname.includes("/wc-tx") || pathname.includes("/wc-sign");

      // If we're on a WC page, clear the navigation flag
      if (isOnWcPage) {
        isNavigatingToWcPage.current = false;
      }

      // Only auto-reject if:
      // 1. We're not on a WC page
      // 2. We're not in the process of navigating to a WC page
      if (!isOnWcPage && !isNavigatingToWcPage.current) {
        // Auto-reject the request
        const autoReject = async () => {
          try {
            await rejectRequest(
              pendingRequest.topic,
              {
                code: 4001,
                message: "User navigated away from request page",
              },
              pendingRequest.id, // Pass the request ID
            );
          } catch (error) {
            console.error("Failed to auto-reject WalletConnect request:", error);
            // Clear anyway as a fallback
            clearPendingRequest();
          }
        };

        autoReject();
      }
    }
  }, [pendingRequest, pathname, rejectRequest, clearPendingRequest]);

  return null; // This component doesn't render anything
}
