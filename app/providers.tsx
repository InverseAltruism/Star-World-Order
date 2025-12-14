'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { config } from '@/lib/wagmi';
import { useState } from 'react';
import LoadingScreen from '@/components/LoadingScreen';
import { DAOAccessProvider } from '@/lib/contexts/DAOAccessContext';
import { DemoModeProvider } from '@/lib/contexts/DemoModeContext';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <DemoModeProvider>
          <DAOAccessProvider>
            <LoadingScreen />
            {children}
          </DAOAccessProvider>
        </DemoModeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
