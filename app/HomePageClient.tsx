"use client";

import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Link } from "react-router-dom";
import AppSection from "@/app/components/AppSection";
import AppCard from "@/app/components/AppCard";
import { useEnsAddress } from "@/app/hooks/useEnsAddress";

/**
 * HomePageClient component that displays a welcome message and a connect button.
 *
 * @returns {JSX.Element} The rendered HomePageClient component.
 */
export default function HomePageClient() {
  const { isConnected, address } = useAccount();
  const ensName = useEnsAddress(address);
  const displayAddress = ensName || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "");

  return (
    <AppSection className="max-w-2xl self-center">
      <AppCard>
        <h2 className="mb-4 text-center text-4xl font-bold">Welcome to localsafe.eth</h2>
        <p className="mb-8 text-center text-xl">
          Your local safe wallet app to manage safe accounts. Connect your wallet to get started.
        </p>
        <div className="flex w-full flex-col items-center gap-6">
          {isConnected ? (
            <Link
              to="/accounts"
              className="btn btn-primary btn-soft text-md w-full rounded py-4 sm:text-lg"
              data-testid="continue-with-account"
            >
              Continue with {displayAddress}
            </Link>
          ) : (
            <ConnectButton chainStatus={"none"} showBalance={false} />
          )}
        </div>
      </AppCard>
    </AppSection>
  );
}
