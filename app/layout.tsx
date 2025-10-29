import type { Metadata } from "next";
import "./globals.css";
import Providers from "./provider/providers";

export const metadata: Metadata = {
  title: "localsafe.eth",
  description: "Multi-Signature Wallet Interface",
};

/**
 * RootLayout component that sets up the HTML structure and includes global providers and navigation.
 *
 * @param param0 - The children components to be rendered within the layout.
 * @returns {JSX.Element} The rendered RootLayout component.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="min-h-screen">
      <body className={`bg-base-300 flex min-h-screen flex-col antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
