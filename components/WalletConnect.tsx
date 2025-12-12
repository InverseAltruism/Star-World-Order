'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

export default function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const handleConnect = () => {
    // Connect using injected connector (MetaMask, Trust Wallet, Phantom, etc.)
    connect({ connector: injected() });
  };

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <div className="text-sm text-gray-300 bg-gray-800 px-3 py-2 rounded-lg">
          {address.slice(0, 6)}...{address.slice(-4)}
        </div>
        <button
          onClick={() => disconnect()}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-lg transition-colors font-medium"
    >
      Connect Wallet
    </button>
  );
}
