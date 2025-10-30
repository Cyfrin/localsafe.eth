"use client";

import { Link } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import NetworkModal from "./NetworkModal";
import CustomConnectButton from "./CustomConnectButton";
import { useAccount } from "wagmi";
import { useChainManager } from "../hooks/useChainManager";
import { NetworkFormState } from "../utils/types";
import SunSvg from "../assets/svg/SunSvg";
import MoonSvg from "../assets/svg/MoonSvg";
import WalletConnectSvg from "../assets/svg/WalletConnectSvg";
import { useWalletConnect } from "../provider/WalletConnectProvider";
import WalletConnectModal from "./WalletConnectModal";

export default function NavBar() {
  const { isConnected, chain, connector } = useAccount();
  const { configChains, getViemChainFromId } = useChainManager();
  const { sessions, pendingProposal } = useWalletConnect();

  const [networkModalOpen, setNetworkModalOpen] = useState(false);
  const [wcModalOpen, setWcModalOpen] = useState(false);
  const [showNetworkFormIndicator, setShowNetworkFormIndicator] =
    useState(false);
  const [suggestedFormState, setSuggestedFormState] = useState<
    NetworkFormState | undefined
  >(undefined);

  const handleOpenNetworkModal = () => setNetworkModalOpen(true);
  const handleCloseNetworkModal = () => setNetworkModalOpen(false);
  const handleOpenWcModal = () => setWcModalOpen(true);
  const handleCloseWcModal = () => setWcModalOpen(false);

  // Callback to check the chain against configChains and viewm chains
  const checkChain = useCallback(async () => {
    if (!isConnected || !connector || chain) {
      setShowNetworkFormIndicator(false);
      setSuggestedFormState(undefined);
      return;
    }
    const chainId = await connector.getChainId();
    const found = configChains.find(
      (configChain) => Number(chainId) === Number(configChain.id),
    );
    if (!found) {
      setShowNetworkFormIndicator(true);
      // Try to get chain info from wagmi
      const viemChain = getViemChainFromId(chainId);
      if (viemChain) {
        setSuggestedFormState({
          id: viemChain.id,
          name: viemChain.name,
          rpcUrl: viemChain.rpcUrls.default.http[0] || "",
          blockExplorerUrl: viemChain.blockExplorers
            ? viemChain.blockExplorers.default.url
            : "",
          blockExplorerName: viemChain.blockExplorers
            ? viemChain.blockExplorers.default.name
            : "",
          nativeCurrency: viemChain.nativeCurrency || {
            name: "",
            symbol: "",
            decimals: 18,
          },
        } as NetworkFormState);
        return;
      }
      // Fallback to minimal info
      setSuggestedFormState({
        id: chainId,
        name: "Unknown",
        rpcUrl: "",
        blockExplorerUrl: "",
        blockExplorerName: "",
        nativeCurrency: {
          name: "",
          symbol: "",
          decimals: 18,
        },
      } as NetworkFormState);
    } else {
      setShowNetworkFormIndicator(false);
      setSuggestedFormState(undefined);
    }
  }, [isConnected, configChains, connector, chain, getViemChainFromId]);

  // Run checkChain on relevant changes
  useEffect(() => {
    checkChain();
  }, [checkChain]);

  return (
    <nav className="navbar bg-base-200 border-base-100 sticky top-0 z-20 w-full justify-between border-b px-1 sm:px-4">
      <div className="flex items-center">
        <Link
          className="mx-2 px-2 text-sm font-bold sm:text-xl"
          to="/accounts"
        >
          localsafe.eth
        </Link>
      </div>
      <div className="flex items-center">
        <Link
          to="/settings"
          className="btn btn-ghost btn-circle"
          title="Advanced Settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-5 w-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </Link>
        <button
          className="btn btn-ghost btn-circle relative"
          onClick={handleOpenWcModal}
          title="WalletConnect"
        >
          <WalletConnectSvg className="h-5 w-5" />
          {(sessions.length > 0 || pendingProposal) && (
            <div className="badge badge-primary badge-xs absolute right-1 top-1">
              {pendingProposal ? "!" : sessions.length}
            </div>
          )}
        </button>
        <div className="divider divider-horizontal mx-1"></div>
        <label className="swap swap-rotate">
          <input type="checkbox" className="theme-controller" value="dark" />
          <SunSvg />
          <MoonSvg />
        </label>
        <div className="divider divider-horizontal mx-1"></div>
        <CustomConnectButton
          onOpenNetworkModal={handleOpenNetworkModal}
          showNetworkFormIndicator={showNetworkFormIndicator}
          chainStatusDisplay={
            showNetworkFormIndicator
              ? "none"
              : { smallScreen: "icon", largeScreen: "full" }
          }
        />
        <NetworkModal
          open={networkModalOpen}
          onClose={handleCloseNetworkModal}
          suggestedFormState={
            showNetworkFormIndicator && suggestedFormState
              ? suggestedFormState
              : undefined
          }
        />
        <WalletConnectModal
          open={wcModalOpen}
          onClose={handleCloseWcModal}
        />
      </div>
    </nav>
  );
}
