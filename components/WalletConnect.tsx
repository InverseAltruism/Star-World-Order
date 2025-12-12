'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';

export default function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  // Check if any connectors are available
  const hasConnectors = connectors.length > 0;

  const handleConnect = () => {
    // Use the first available connector (injected wallet takes priority in wagmi config)
    // If WalletConnect is configured, it will be available as a second connector
    const connector = connectors[0];
    if (connector) {
      connect({ connector });
    }
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
      disabled={!hasConnectors}
      className={`pixel-btn pixel-btn-gold text-[8px] !px-4 !py-2 ${!hasConnectors ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {hasConnectors ? 'CONNECT' : 'NO WALLET'}
    </button>
  );
}
