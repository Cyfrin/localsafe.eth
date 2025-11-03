import { SafeWalletProvider } from "./SafeWalletProvider";
import { SafeTxProvider } from "./SafeTxProvider";
import { SafeMessageProvider } from "./SafeMessageProvider";
import { WagmiConfigProvider } from "./WagmiConfigProvider";
import { WalletConnectProvider } from "./WalletConnectProvider";
import { ThemeProvider } from "./ThemeProvider";
import ToastProvider from "./ToastProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <WagmiConfigProvider>
          <SafeWalletProvider>
            <SafeTxProvider>
              <SafeMessageProvider>
                <WalletConnectProvider>{children}</WalletConnectProvider>
              </SafeMessageProvider>
            </SafeTxProvider>
          </SafeWalletProvider>
        </WagmiConfigProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
