'use client';

import { useState, useEffect, useRef } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import Link from 'next/link';
import { monad } from '@/lib/wagmi';
import NotificationBell from './NotificationBell';
import MessageIcon from './MessageIcon';

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

// Helper function to check if wallet provider is available
function hasWalletProvider(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as { ethereum?: unknown }).ethereum;
}

// Helper function to get the ethereum provider
function getEthereumProvider(): unknown | null {
  if (typeof window === 'undefined') return null;
  return (window as { ethereum?: unknown }).ethereum || null;
}

export default function WalletConnect() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [detectedWallet, setDetectedWallet] = useState<WalletInfo | null>(null);
  const [showNoWalletMessage, setShowNoWalletMessage] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // Detect installed wallet
  useEffect(() => {
    const provider = getEthereumProvider();
    if (provider) {
      setDetectedWallet(detectWalletType(provider));
    }
  }, []);

  // Show helpful message when connection fails due to no wallet
  // Check for common error patterns indicating missing wallet
  useEffect(() => {
    if (error) {
      const errorMessage = error.message?.toLowerCase() || '';
      const isNoWalletError = 
        errorMessage.includes('not found') || 
        errorMessage.includes('no provider') ||
        errorMessage.includes('not installed') ||
        errorMessage.includes('no ethereum');
      
      if (isNoWalletError) {
        setShowNoWalletMessage(true);
      }
    }
  }, [error]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target && dropdownRef.current && !dropdownRef.current.contains(target)) {
        setShowDropdown(false);
        setShowNoWalletMessage(false);
      }
      if (target && accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setShowAccountMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check if any connectors are available
  const hasConnectors = connectors.length > 0;
  
  // Check if wallet provider is actually available (not just a connector)
  const walletAvailable = hasWalletProvider();

  // Check if connected to wrong network
  const isWrongNetwork = isConnected && chain?.id !== monad.id;

  const handleConnect = (connectorId?: string) => {
    // Check if wallet provider exists before attempting connection
    if (!walletAvailable) {
      setShowNoWalletMessage(true);
      return;
    }
    
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
            className="pixel-btn text-[10px] sm:text-xs !px-2 sm:!px-3 !py-2 !bg-[#ffa500] !border-[#ffcc00_#cc8000_#cc8000_#ffcc00] animate-pulse smooth-transition hover-lift whitespace-nowrap"
          >
            ⚠️ SWITCH TO MONAD
          </button>
        ) : (
          <div className="relative" ref={accountMenuRef}>
            {/* Wallet Address Button - Opens Dropdown */}
            <button
              onClick={() => setShowAccountMenu(!showAccountMenu)}
              className="text-[10px] sm:text-xs text-[#44ff88] bg-[#1a1a2e] px-2 sm:px-3 py-2 border-2 border-[#2a2a4e] flex items-center gap-2 smooth-transition hover:border-[#44ff88] hover-lift whitespace-nowrap cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-[#44ff88] animate-pulse" />
              {address.slice(0, 6)}...{address.slice(-4)}
              <span className={`text-[8px] transition-transform ${showAccountMenu ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {/* Account Dropdown Menu */}
            {showAccountMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-[#1a1a2e] border-2 border-[#2a2a4e] rounded-lg shadow-xl z-50 overflow-hidden animate-slide-in-up">
                <div className="p-2 border-b border-[#2a2a4e]">
                  <p className="text-[10px] text-gray-500 tracking-wider text-center">CONNECTED</p>
                </div>
                <div className="p-1">
                  <Link
                    href="/profile"
                    onClick={() => setShowAccountMenu(false)}
                    className="flex items-center gap-3 px-3 py-2 text-xs text-gray-300 hover:bg-[#2a2a4e] hover:text-[#ffd700] rounded smooth-transition"
                  >
                    <span className="text-base">👤</span>
                    <span>Profile</span>
                  </Link>
                  <button
                    onClick={() => {
                      disconnect();
                      setShowAccountMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs text-gray-300 hover:bg-[#2a2a4e] hover:text-[#ff4466] rounded smooth-transition"
                  >
                    <span className="text-base">🚪</span>
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Message Icon - positioned between wallet and notifications */}
        <MessageIcon />
        
        {/* Notification Bell - positioned to the right */}
        <NotificationBell />
      </div>
    );
  }

  // If only one connector, connect directly without dropdown
  const shouldShowDropdown = connectors.length > 1;

  return (
    <div className="relative z-50" ref={dropdownRef}>
      <button
        onClick={() => shouldShowDropdown ? setShowDropdown(!showDropdown) : handleConnect()}
        disabled={isPending}
        className={`pixel-btn pixel-btn-gold text-[10px] sm:text-xs !px-3 sm:!px-4 !py-2 smooth-transition hover-lift whitespace-nowrap ${isPending ? 'opacity-50 cursor-not-allowed' : ''} ${isPending ? 'animate-pixel-pulse' : ''}`}
      >
        {isPending ? 'CONNECTING...' : (
          detectedWallet ? `${detectedWallet.icon} CONNECT` : 'CONNECT'
        )}
      </button>

      {/* No Wallet Detected Message */}
      {showNoWalletMessage && (
        <div className="fixed md:absolute right-4 md:right-0 top-auto md:top-full bottom-20 md:bottom-auto mt-0 md:mt-2 w-[calc(100vw-2rem)] md:w-64 max-h-[60vh] md:max-h-[80vh] bg-[#1a1a2e] border-2 border-[#ff4466] rounded-lg shadow-xl z-50 overflow-y-auto animate-slide-in-up">
          <div className="p-3 border-b border-[#2a2a4e]">
            <p className="text-[#ff4466] text-xs tracking-wider text-center">
              ⚠️ NO WALLET DETECTED
            </p>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-gray-300 text-xs text-center">
              Install a Web3 wallet to connect:
            </p>
            <div className="space-y-2">
              <a 
                href="https://metamask.io/download/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block w-full text-center px-3 py-2 text-xs text-[#ffd700] bg-[#2a2a4e] hover:bg-[#3a3a5e] rounded smooth-transition"
              >
                🦊 Get MetaMask
              </a>
              <a 
                href="https://phantom.app/download" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block w-full text-center px-3 py-2 text-xs text-[#ffd700] bg-[#2a2a4e] hover:bg-[#3a3a5e] rounded smooth-transition"
              >
                👻 Get Phantom
              </a>
              <a 
                href="https://trustwallet.com/download" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block w-full text-center px-3 py-2 text-xs text-[#ffd700] bg-[#2a2a4e] hover:bg-[#3a3a5e] rounded smooth-transition"
              >
                🛡️ Get Trust Wallet
              </a>
              <a 
                href="https://rabby.io/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block w-full text-center px-3 py-2 text-xs text-[#ffd700] bg-[#2a2a4e] hover:bg-[#3a3a5e] rounded smooth-transition"
              >
                🐰 Get Rabby
              </a>
            </div>
            <button
              onClick={() => setShowNoWalletMessage(false)}
              className="w-full text-xs text-gray-500 hover:text-gray-300 smooth-transition mt-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Wallet Selection Dropdown */}
      {showDropdown && shouldShowDropdown && !showNoWalletMessage && (
        <div className="fixed md:absolute right-4 md:right-0 top-auto md:top-full bottom-20 md:bottom-auto mt-0 md:mt-2 w-[calc(100vw-2rem)] md:w-56 max-h-[60vh] md:max-h-[80vh] bg-[#1a1a2e] border-2 border-[#2a2a4e] rounded-lg shadow-xl z-50 overflow-hidden animate-slide-in-up flex flex-col">
          <div className="p-3 border-b border-[#2a2a4e] flex-shrink-0">
            <p className="text-[#ffd700] text-xs tracking-wider text-center animate-glow-pulse">
              ✦ SELECT WALLET ✦
            </p>
          </div>
          <div className="p-2 space-y-1 overflow-y-auto flex-1">
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
                  <span className="text-[#44ff88] text-xs">→</span>
                </button>
              );
            })}
          </div>
          <div className="p-2 border-t border-[#2a2a4e] flex-shrink-0">
            <p className="text-gray-600 text-xs text-center">
              Connect to Monad Network
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
