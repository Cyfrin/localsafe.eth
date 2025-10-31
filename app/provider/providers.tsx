import { SafeWalletProvider } from "./SafeWalletProvider";
import { SafeTxProvider } from "./SafeTxProvider";
import { WagmiConfigProvider } from "./WagmiConfigProvider";
import { WalletConnectProvider } from "./WalletConnectProvider";
import { ThemeProvider } from "./ThemeProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <WagmiConfigProvider>
        <SafeWalletProvider>
          <SafeTxProvider>
            <WalletConnectProvider>
              {children}
            </WalletConnectProvider>
          </SafeTxProvider>
        </SafeWalletProvider>
      </WagmiConfigProvider>
    </ThemeProvider>
  );
}
