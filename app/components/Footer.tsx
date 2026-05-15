"use client";

import Image from "next/image";
import GithubSvg from "../assets/svg/GithubSvg";
import poweredByCyfrinDark from "../assets/svg/powered-by-cyfrin-dark.png";
import poweredByCyfrinBright from "../assets/svg/powered-by-cyfrin-bright.png";
import packageJson from "../../package.json";
import { useTheme } from "../provider/ThemeProvider";

export default function Footer() {
  const { isDarkMode } = useTheme();
  const version = process.env.NEXT_PUBLIC_APP_VERSION || packageJson.version || "0.0.0";

  return (
    <footer className="bg-base-100 border-base-content w-full border-t-2">
      <div className="container mx-auto flex flex-col items-stretch gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-3">
          <span className="ascii-label">BUILD&nbsp;v{version}</span>
          <span aria-hidden className="text-base-content/40 hidden font-mono text-xs sm:inline">
            ////////
          </span>
          <span className="font-mono text-[11px] tracking-[0.15em] uppercase opacity-60">
            self-custody &middot; local-first
          </span>
        </div>

        <a
          href="https://www.cyfrin.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:translate-x-[1px] transition-opacity hover:opacity-80"
        >
          <Image
            src={isDarkMode ? poweredByCyfrinBright : poweredByCyfrinDark}
            alt="Powered by Cyfrin"
            height={28}
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
