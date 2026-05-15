"use client";

import Image from "next/image";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Link } from "react-router-dom";
import { useEnsName } from "@/app/hooks/useEnsName";
import localsafeLogo from "@/app/localsafe.png";

export default function HomePageClient() {
  const { isConnected, address } = useAccount();
  const ensName = useEnsName(address);
  const displayAddress = ensName || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col px-5 pt-12 pb-20 sm:pt-20">
      {/* terminal banner — quiet, just signal */}
      <header className="flex items-center justify-between font-mono text-[11px] tracking-[0.18em] uppercase opacity-60">
        <span>~/localsafe</span>
        <span aria-hidden>::</span>
        <span>session 0</span>
      </header>

      <hr className="rule-dashed mt-3 opacity-40" />

      {/* wordmark — logo + name, calm */}
      <section className="mt-10 flex items-center gap-4">
        <Image
          src={localsafeLogo}
          alt=""
          width={56}
          height={56}
          className="logo-invert border-base-content border-2"
          priority
        />
        <div className="flex flex-col">
          <span className="font-mono text-[11px] tracking-[0.25em] uppercase opacity-60">cyfrin / safe-ops</span>
          <span className="font-mono text-2xl font-bold tracking-[0.04em] sm:text-3xl">localsafe.eth</span>
        </div>
      </section>

      {/* tagline */}
      <p className="mt-8 font-mono text-[15px] leading-relaxed">
        a static, local-first interface for Safe smart accounts.
        <br />
        <span className="opacity-65">no backend. no tracking. no custody. served from your filesystem or ipfs.</span>
      </p>

      {/* connect panel — single quiet block */}
      <section className="surface mt-10 p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] tracking-[0.2em] uppercase opacity-60">&gt; status</span>
          {isConnected ? (
            <span className="status-pill status-pill--live">
              <span className="dot" />
              attached
            </span>
          ) : (
            <span className="status-pill">
              <span className="dot opacity-40" />
              idle
            </span>
          )}
        </div>

        <hr className="rule-dashed mt-4 opacity-50" />

        {isConnected ? (
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <div className="font-mono text-[11px] tracking-[0.2em] uppercase opacity-60">signer</div>
              <div className="bg-base-200 border-base-content mt-1 truncate border-2 px-3 py-2 font-mono text-sm">
                {displayAddress}
              </div>
            </div>
            <Link
              to="/accounts"
              className="bg-base-content text-base-100 border-base-content shadow-hard-sm hover:shadow-hard hover:bg-base-100 hover:text-base-content inline-flex items-center justify-between gap-3 border-2 px-5 py-3.5 font-mono text-sm font-bold tracking-[0.12em] uppercase transition-all hover:-translate-x-[3px] hover:-translate-y-[3px]"
              data-testid="continue-with-account"
            >
              <span>enter accounts</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <p className="font-mono text-[13px] leading-relaxed opacity-80">
              connect any evm wallet to load your safe accounts. keys never leave your device.
            </p>
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => (
                <button
                  type="button"
                  onClick={openConnectModal}
                  disabled={!mounted}
                  className="bg-base-content text-base-100 border-base-content shadow-hard-sm hover:shadow-hard hover:bg-base-100 hover:text-base-content inline-flex items-center justify-between gap-3 border-2 px-5 py-3.5 font-mono text-sm font-bold tracking-[0.12em] uppercase transition-all hover:-translate-x-[3px] hover:-translate-y-[3px] disabled:opacity-50"
                  data-testid="connect-wallet"
                >
                  <span>connect wallet</span>
                  <span aria-hidden>→</span>
                </button>
              )}
            </ConnectButton.Custom>
          </div>
        )}
      </section>

      {/* manifest — quiet signed-message style */}
      <section className="mt-12 font-mono text-[12px] leading-relaxed opacity-70">
        <div className="tracking-[0.2em] uppercase opacity-80">----- begin localsafe manifest -----</div>
        <ul className="mt-3 space-y-1.5 pl-1">
          <li>
            <span className="opacity-50">·</span> client-side only. nothing routes through a server.
          </li>
          <li>
            <span className="opacity-50">·</span> non-custodial. signatures stay with your wallet.
          </li>
          <li>
            <span className="opacity-50">·</span> deterministic. static export, ipfs-pinnable.
          </li>
          <li>
            <span className="opacity-50">·</span> open.{" "}
            <a
              href="https://github.com/Cyfrin/localsafe.eth"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-base-content underline underline-offset-2 hover:opacity-100"
            >
              source on github
            </a>
            .
          </li>
        </ul>
        <div className="mt-4 tracking-[0.2em] uppercase opacity-80">----- end localsafe manifest -----</div>
      </section>
    </main>
  );
}
