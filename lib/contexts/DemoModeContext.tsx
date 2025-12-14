'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface DemoModeContextType {
  isDemoMode: boolean;
  demoWalletAddress: string | null;
  enterDemoMode: (walletAddress: string) => void;
  exitDemoMode: () => void;
}

const DemoModeContext = createContext<DemoModeContextType | undefined>(undefined);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoWalletAddress, setDemoWalletAddress] = useState<string | null>(null);

  const enterDemoMode = useCallback((walletAddress: string) => {
    setIsDemoMode(true);
    setDemoWalletAddress(walletAddress);
  }, []);

  const exitDemoMode = useCallback(() => {
    setIsDemoMode(false);
    setDemoWalletAddress(null);
  }, []);

  return (
    <DemoModeContext.Provider value={{ isDemoMode, demoWalletAddress, enterDemoMode, exitDemoMode }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  const context = useContext(DemoModeContext);
  if (context === undefined) {
    throw new Error('useDemoMode must be used within a DemoModeProvider');
  }
  return context;
}
