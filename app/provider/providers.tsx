import { SafeWalletProvider } from "./SafeWalletProvider";
import { SafeTxProvider } from "./SafeTxProvider";
import { WagmiConfigProvider } from "./WagmiConfigProvider";
import { WalletConnectProvider } from "./WalletConnectProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiConfigProvider>
      <SafeWalletProvider>
        <SafeTxProvider>
          <WalletConnectProvider>
            {children}
          </WalletConnectProvider>
        </SafeTxProvider>
      </SafeWalletProvider>
    </WagmiConfigProvider>
  );
}
