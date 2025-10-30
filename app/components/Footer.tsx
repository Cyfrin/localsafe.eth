"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import GithubSvg from "../assets/svg/GithubSvg";
import poweredByCyfrinDark from "../assets/svg/powered-by-cyfrin-dark.png";
import poweredByCyfrinBright from "../assets/svg/powered-by-cyfrin-bright.png";
import packageJson from "../../package.json";

export default function Footer() {
  const [theme, setTheme] = useState<string>("light");
  const version =
    process.env.NEXT_PUBLIC_APP_VERSION || packageJson.version || "0.0.0";

  useEffect(() => {
    // Check initial theme
    const initialTheme = document.documentElement.getAttribute("data-theme") || "light";
    setTheme(initialTheme);

    // Watch for theme changes
    const observer = new MutationObserver(() => {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
      setTheme(currentTheme);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <footer className="footer bg-base-200 border-base-100 w-full border-t px-4 py-4">
      <div className="container mx-auto flex items-center justify-between">
        {/* Left side - empty for now */}
        <div className="flex-1"></div>

        {/* Center - Powered by Cyfrin logo */}
        <div className="flex flex-1 items-center justify-center">
          <a
            href="https://www.cyfrin.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity hover:opacity-80"
          >
            <Image
              src={theme === "dark" ? poweredByCyfrinDark : poweredByCyfrinBright}
              alt="Powered by Cyfrin"
              height={32}
            />
          </a>
        </div>

        {/* Right side - Version and GitHub link */}
        <div className="flex flex-1 items-center justify-end gap-3">
          <span className="text-base-content text-sm opacity-60">
            v{version}
          </span>
          <a
            href="https://github.com/Cyfrin/localsafe.eth"
            target="_blank"
            rel="noopener noreferrer"
            className="text-base-content transition-opacity hover:opacity-70"
            aria-label="View source on GitHub"
          >
            <GithubSvg />
          </a>
        </div>
      </div>
    </footer>
  );
}
