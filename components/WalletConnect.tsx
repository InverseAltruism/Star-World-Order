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
        <div className="text-[8px] text-[#44ff88] bg-[#1a1a2e] px-3 py-2 border-2 border-[#2a2a4e]">
          {address.slice(0, 6)}...{address.slice(-4)}
        </div>
        <button
          onClick={() => disconnect()}
          className="pixel-btn text-[8px] !px-3 !py-2 !bg-[#ff4466] !border-[#ff6688_#aa2244_#aa2244_#ff6688]"
        >
          EXIT
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      className="pixel-btn pixel-btn-gold text-[8px] !px-4 !py-2"
    >
      CONNECT
    </button>
  );
}
