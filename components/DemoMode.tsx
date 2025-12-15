'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDemoMode } from '@/lib/contexts/DemoModeContext';
import { isAddress } from 'viem';

interface DemoModeProps {
  /** Optional className for button styling override */
  className?: string;
}

/**
 * Demo Mode Component
 * 
 * Allows users to enter a wallet address to view their NFTs and unlock features
 * without actually connecting a wallet. Read-only mode for demonstration purposes.
 */
export default function DemoMode({ className }: DemoModeProps) {
  const { isDemoMode, enterDemoMode, exitDemoMode, demoWalletAddress } = useDemoMode();
  const [showModal, setShowModal] = useState(false);
  const [walletInput, setWalletInput] = useState('');
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  // Close modal when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setShowModal(false);
        setError('');
        setWalletInput('');
      }
    }
    if (showModal) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showModal]);

  const handleEnterDemoMode = () => {
    setError('');
    
    // Validate wallet address
    if (!walletInput) {
      setError('Please enter a wallet address');
      return;
    }

    if (!isAddress(walletInput)) {
      setError('Invalid wallet address format');
      return;
    }

    // Enter demo mode
    enterDemoMode(walletInput);
    setShowModal(false);
    setWalletInput('');
  };

  const handleExitDemoMode = () => {
    exitDemoMode();
  };

  if (isDemoMode) {
    return (
      <div className="flex flex-col sm:flex-row items-center gap-2">
        <div className="text-[10px] sm:text-xs text-[#ffd700] bg-[#1a1a2e] px-2 sm:px-3 py-1 sm:py-2 border-2 border-[#ffd700] flex items-center gap-2 whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-[#ffd700] animate-pulse" />
          DEMO MODE
        </div>
        <button
          onClick={handleExitDemoMode}
          className="pixel-btn text-[10px] sm:text-xs !px-2 sm:!px-3 !py-1 sm:!py-2 !bg-[#ff4466] !border-[#ff6688_#aa2244_#aa2244_#ff6688] whitespace-nowrap"
        >
          EXIT DEMO
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={className || "pixel-btn text-xs !px-4 !py-2"}
      >
        🎮 DEMO MODE
      </button>

      {/* Demo Mode Modal - Rendered via Portal */}
      {typeof document !== 'undefined' && showModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4">
          <div
            ref={modalRef}
            className="pixel-card p-4 sm:p-6 max-w-md w-full animate-slide-in-up relative max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="mb-6 text-center">
              <div className="text-4xl mb-3 animate-pixel-float">🎮</div>
              <h2 className="text-[#ffd700] text-sm mb-2 tracking-wider">
                ★ DEMO MODE ★
              </h2>
              <p className="text-gray-400 text-xs leading-relaxed">
                Enter a wallet address to preview features without connecting
              </p>
            </div>

            {/* Input */}
            <div className="mb-4">
              <label className="block text-[#9966ff] text-xs mb-2 tracking-wide">
                Wallet Address
              </label>
              <input
                type="text"
                value={walletInput}
                onChange={(e) => {
                  setWalletInput(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                    handleEnterDemoMode();
                  }
                }}
                placeholder="0x..."
                className="w-full bg-[#0a0a15] border-2 border-[#2a2a4e] text-gray-300 px-3 py-2 text-xs focus:border-[#ffd700] focus:outline-none"
                style={{ fontFamily: 'monospace' }}
              />
              {error && (
                <p className="text-[#ff4466] text-xs mt-2">⚠️ {error}</p>
              )}
            </div>

            {/* Info Box */}
            <div className="bg-[#0a0a15] border-2 border-[#2a2a4e] p-4 mb-6 rounded-lg">
              <p className="text-[#44ff88] text-xs mb-2 tracking-wide">
                ✓ What works in Demo Mode:
              </p>
              <ul className="text-gray-400 text-xs space-y-1 ml-4">
                <li>• View profile and NFTs</li>
                <li>• See feature unlocks</li>
                <li>• Browse marketplace</li>
              </ul>
              <p className="text-[#ff4466] text-xs mt-3 mb-2 tracking-wide">
                ✗ What doesn't work:
              </p>
              <ul className="text-gray-400 text-xs space-y-1 ml-4">
                <li>• Username changes</li>
                <li>• Any write operations</li>
                <li>• Trading or transfers</li>
              </ul>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEnterDemoMode();
                }}
                className="pixel-btn pixel-btn-gold flex-1 text-xs"
              >
                ENTER DEMO MODE
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowModal(false);
                  setError('');
                  setWalletInput('');
                }}
                className="pixel-btn flex-1 text-xs"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
