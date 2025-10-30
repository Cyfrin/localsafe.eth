import { SafeWalletProvider } from "./SafeWalletProvider";
import { SafeTxProvider } from "./SafeTxProvider";
import { WagmiConfigProvider } from "./WagmiConfigProvider";
import { WalletConnectProvider } from "./WalletConnectProvider";
import ToastProvider from "./ToastProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <WagmiConfigProvider>
        <SafeWalletProvider>
          <SafeTxProvider>
            <WalletConnectProvider>
              {children}
            </WalletConnectProvider>
          </SafeTxProvider>
        </SafeWalletProvider>
      </WagmiConfigProvider>
    </ToastProvider>
  );
}
