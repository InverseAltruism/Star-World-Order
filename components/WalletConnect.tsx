'use client';

import { useState, useEffect, useRef } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { monad } from '@/lib/wagmi';

// Wallet metadata for display
interface WalletInfo {
  name: string;
  icon: string;
}

/**
 * Detect wallet type from provider info
 * 
 * Priority order (checked first = highest priority):
 * 1. Phantom - Most commonly used Solana wallet that also supports EVM
 * 2. Trust Wallet - Popular mobile wallet
 * 3. Coinbase Wallet - Major exchange wallet
 * 4. Rabby - DeFi-focused wallet
 * 5. Brave - Browser-integrated wallet
 * 6. Frame - Desktop wallet
 * 7. TokenPocket - Multi-chain wallet
 * 8. Exodus - Desktop/mobile wallet
 * 9. MetaMask - Most common, checked last to allow other wallets to be detected first
 *    (Many wallets set isMetaMask=true for compatibility)
 * 10. Generic browser wallet fallback
 * 
 * Note: Multiple wallets can inject simultaneously and set overlapping flags.
 * This order prioritizes wallets that are less likely to set MetaMask compatibility flags.
 */
function detectWalletType(provider: unknown): WalletInfo {
  const ethereum = provider as {
    isMetaMask?: boolean;
    isPhantom?: boolean;
    isTrust?: boolean;
    isCoinbaseWallet?: boolean;
    isRabby?: boolean;
    isBraveWallet?: boolean;
    isFrame?: boolean;
    isTokenPocket?: boolean;
    isExodus?: boolean;
  } | null;

  if (!ethereum) {
    return { name: 'Browser Wallet', icon: '🌐' };
  }

  // Check specific wallet flags in priority order
  // (MetaMask checked last since many wallets set isMetaMask for compatibility)
  if (ethereum.isPhantom) {
    return { name: 'Phantom', icon: '👻' };
  }
  if (ethereum.isTrust) {
    return { name: 'Trust Wallet', icon: '🛡️' };
  }
  if (ethereum.isCoinbaseWallet) {
    return { name: 'Coinbase Wallet', icon: '🔵' };
  }
  if (ethereum.isRabby) {
    return { name: 'Rabby', icon: '🐰' };
  }
  if (ethereum.isBraveWallet) {
    return { name: 'Brave Wallet', icon: '🦁' };
  }
  if (ethereum.isFrame) {
    return { name: 'Frame', icon: '🖼️' };
  }
  if (ethereum.isTokenPocket) {
    return { name: 'TokenPocket', icon: '💰' };
  }
  if (ethereum.isExodus) {
    return { name: 'Exodus', icon: '🚀' };
  }
  // MetaMask checked last - many wallets set this flag for compatibility
  if (ethereum.isMetaMask) {
    return { name: 'MetaMask', icon: '🦊' };
  }

  return { name: 'Browser Wallet', icon: '🌐' };
}

// Get wallet info from connector
function getWalletInfo(connector: { name?: string; id?: string; icon?: string | null }): WalletInfo {
  const name = connector.name || 'Unknown Wallet';
  const nameLower = name.toLowerCase();

  // Check for known wallets by name
  if (nameLower.includes('metamask')) {
    return { name: 'MetaMask', icon: '🦊' };
  }
  if (nameLower.includes('phantom')) {
    return { name: 'Phantom', icon: '👻' };
  }
  if (nameLower.includes('trust')) {
    return { name: 'Trust Wallet', icon: '🛡️' };
  }
  if (nameLower.includes('coinbase')) {
    return { name: 'Coinbase Wallet', icon: '🔵' };
  }
  if (nameLower.includes('rabby')) {
    return { name: 'Rabby', icon: '🐰' };
  }
  if (nameLower.includes('brave')) {
    return { name: 'Brave Wallet', icon: '🦁' };
  }
  if (nameLower === 'injected' || nameLower.includes('browser')) {
    return { name: 'Browser Wallet', icon: '🌐' };
  }

  return { name, icon: '💳' };
}

export default function WalletConnect() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [showDropdown, setShowDropdown] = useState(false);
  const [detectedWallet, setDetectedWallet] = useState<WalletInfo | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Detect installed wallet
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ethereum = (window as { ethereum?: unknown }).ethereum;
      if (ethereum) {
        setDetectedWallet(detectWalletType(ethereum));
      }
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check if any connectors are available
  const hasConnectors = connectors.length > 0;

  // Check if connected to wrong network
  const isWrongNetwork = isConnected && chain?.id !== monad.id;

  const handleConnect = (connectorId?: string) => {
    const connector = connectorId 
      ? connectors.find(c => c.id === connectorId || c.uid === connectorId)
      : connectors[0];
    if (connector) {
      connect({ connector });
      setShowDropdown(false);
    }
  };

  const handleSwitchNetwork = () => {
    switchChain({ chainId: monad.id });
  };

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2 animate-slide-in-right">
        {isWrongNetwork ? (
          <button
            onClick={handleSwitchNetwork}
            className="pixel-btn text-[8px] !px-3 !py-2 !bg-[#ffa500] !border-[#ffcc00_#cc8000_#cc8000_#ffcc00] animate-pulse smooth-transition hover-lift"
          >
            ⚠️ SWITCH TO MONAD
          </button>
        ) : (
          <div className="text-[8px] text-[#44ff88] bg-[#1a1a2e] px-3 py-2 border-2 border-[#2a2a4e] flex items-center gap-2 smooth-transition hover-lift">
            <span className="w-2 h-2 rounded-full bg-[#44ff88] animate-pulse" />
            {address.slice(0, 6)}...{address.slice(-4)}
          </div>
        )}
        <button
          onClick={() => disconnect()}
          className="pixel-btn text-[8px] !px-3 !py-2 !bg-[#ff4466] !border-[#ff6688_#aa2244_#aa2244_#ff6688] smooth-transition hover-lift"
        >
          EXIT
        </button>
      </div>
    );
  }

  // If only one connector, connect directly without dropdown
  const shouldShowDropdown = connectors.length > 1;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => shouldShowDropdown ? setShowDropdown(!showDropdown) : handleConnect()}
        disabled={!hasConnectors || isPending}
        className={`pixel-btn pixel-btn-gold text-[8px] !px-4 !py-2 smooth-transition hover-lift ${!hasConnectors || isPending ? 'opacity-50 cursor-not-allowed' : ''} ${isPending ? 'animate-pixel-pulse' : ''}`}
      >
        {isPending ? 'CONNECTING...' : hasConnectors ? (
          detectedWallet ? `${detectedWallet.icon} CONNECT` : 'CONNECT'
        ) : 'NO WALLET'}
      </button>

      {/* Wallet Selection Dropdown */}
      {showDropdown && shouldShowDropdown && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-[#1a1a2e] border-2 border-[#2a2a4e] rounded-lg shadow-xl z-50 overflow-hidden animate-slide-in-up">
          <div className="p-3 border-b border-[#2a2a4e]">
            <p className="text-[#ffd700] text-[8px] tracking-wider text-center animate-glow-pulse">
              ✦ SELECT WALLET ✦
            </p>
          </div>
          <div className="p-2 space-y-1">
            {connectors.map((connector, index) => {
              const walletInfo = getWalletInfo(connector);
              const delayClass = `animate-delay-${Math.min(index + 1, 6)}`;
              return (
                <button
                  key={connector.uid}
                  onClick={() => handleConnect(connector.uid)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-[9px] text-gray-300 hover:bg-[#2a2a4e] hover:text-[#ffd700] rounded smooth-transition hover-lift animate-slide-in-left ${delayClass}`}
                >
                  <span className="text-base smooth-transition">{walletInfo.icon}</span>
                  <span className="flex-1 text-left">{walletInfo.name}</span>
                  <span className="text-[#44ff88] text-[6px]">→</span>
                </button>
              );
            })}
          </div>
          <div className="p-2 border-t border-[#2a2a4e]">
            <p className="text-gray-600 text-[6px] text-center">
              Connect to Monad Network
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
