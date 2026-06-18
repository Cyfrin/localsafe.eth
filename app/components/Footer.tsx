"use client";

import GithubSvg from "../assets/svg/GithubSvg";
// Consumed as an alpha mask only. The badge is tinted to the page's
// base-content (CSS mask + bg-current) so it reads ink-on-bone in the light
// theme and bone-on-ink in dark, matching the palette instead of brand orange.
import cyfrinBadgeMask from "../assets/svg/powered-by-cyfrin-dark.png";
import packageJson from "../../package.json";

export default function Footer() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || packageJson.version || "0.0.0";
  // Next bakes the (IPFS) assetPrefix into the static-import .src, exactly like
  // the logo loaded via next/image, so the mask URL resolves under /ipfs/<CID>/.
  const badgeMask = `url(${cyfrinBadgeMask.src})`;

  return (
    <footer className="bg-base-100 border-base-content w-full border-t-2">
      <div className="container mx-auto flex flex-col items-stretch gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-3">
          <span className="ascii-label">BUILD&nbsp;v{version}</span>
          <span aria-hidden className="text-base-content/40 hidden font-mono text-xs sm:inline">
            {"////////"}
          </span>
          <span className="font-mono text-[11px] tracking-[0.15em] uppercase opacity-60">
            self-custody &middot; local-first
          </span>
        </div>

        <a
          href="https://www.cyfrin.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-base-content transition-opacity hover:translate-x-[1px] hover:opacity-80"
          aria-label="Powered by Cyfrin"
        >
          <span
            role="img"
            aria-label="Powered by Cyfrin"
            className="block h-7 w-[84px] bg-current"
            style={{
              maskImage: badgeMask,
              WebkitMaskImage: badgeMask,
              maskRepeat: "no-repeat",
              WebkitMaskRepeat: "no-repeat",
              maskSize: "contain",
              WebkitMaskSize: "contain",
              maskPosition: "center",
              WebkitMaskPosition: "center",
            }}
          />
        </a>

        <a
          href="https://github.com/Cyfrin/localsafe.eth"
          target="_blank"
          rel="noopener noreferrer"
          className="border-base-content hover:bg-base-200 inline-flex items-center gap-2 self-start border-2 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.15em] uppercase transition-colors sm:self-auto"
          aria-label="View source on GitHub"
        >
          <GithubSvg />
          <span>Source</span>
        </a>
      </div>
    </footer>
  );
}
