"use client";

import { HashRouter, Routes, Route, useParams, Outlet } from "react-router-dom";
import NavBar from "./components/NavBar";
import Footer from "./components/Footer";
import WalletConnectRequestHandler from "./components/WalletConnectRequestHandler";
import HomePageClient from "./HomePageClient";
import AccountsSafeClient from "./accounts/AccountsSafeClient";
import AdvancedSettingsClient from "./settings/AdvancedSettingsClient";
import ConnectSafeClient from "./new-safe/connect/ConnectSafeClient";
import CreateSafeClient from "./new-safe/create/CreateSafeClient";
import SafeDashboardClient from "./safe/[address]/SafeDashboardClient";
import NewSafeTxClient from "./safe/[address]/new-tx/NewSafeTxClient";
import TxDetailsClient from "./safe/[address]/tx/[txHash]/TxDetailsClient";
import WalletConnectTxClient from "./safe/[address]/wc-tx/WalletConnectTxClient";
import WalletConnectSignClient from "./safe/[address]/wc-sign/WalletConnectSignClient";

// Wrapper components to pass route params to client components
function SafeDashboardWrapper() {
  const { address } = useParams<{ address: string }>();
  return <SafeDashboardClient safeAddress={address as `0x${string}`} />;
}

function NewSafeTxWrapper() {
  const { address } = useParams<{ address: string }>();
  return <NewSafeTxClient safeAddress={address as `0x${string}`} />;
}

function TxDetailsWrapper() {
  const { address, txHash } = useParams<{ address: string; txHash: string }>();
  return <TxDetailsClient safeAddress={address as `0x${string}`} txHash={txHash!} />;
}

function WalletConnectTxWrapper() {
  const { address } = useParams<{ address: string }>();
  return <WalletConnectTxClient safeAddress={address as `0x${string}`} />;
}

function WalletConnectSignWrapper() {
  const { address } = useParams<{ address: string }>();
  return <WalletConnectSignClient safeAddress={address as `0x${string}`} />;
}

// Layout component that wraps all routes with NavBar and Footer
function Layout() {
  return (
    <>
      <WalletConnectRequestHandler />
      <NavBar />
      <main className="flex flex-1">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          {/* Static routes */}
          <Route path="/" element={<HomePageClient />} />
          <Route path="/accounts" element={<AccountsSafeClient />} />
          <Route path="/settings" element={<AdvancedSettingsClient />} />
          <Route path="/new-safe/connect" element={<ConnectSafeClient />} />
          <Route path="/new-safe/create" element={<CreateSafeClient />} />

          {/* Dynamic routes - Safe pages */}
          <Route path="/safe/:address" element={<SafeDashboardWrapper />} />
          <Route path="/safe/:address/new-tx" element={<NewSafeTxWrapper />} />
          <Route path="/safe/:address/tx/:txHash" element={<TxDetailsWrapper />} />
          <Route path="/safe/:address/wc-tx" element={<WalletConnectTxWrapper />} />
          <Route path="/safe/:address/wc-sign" element={<WalletConnectSignWrapper />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
