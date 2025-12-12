import { http, createConfig } from 'wagmi';
import { defineChain } from 'viem';

// Monad Chain Configuration
// Note: Update these values when Monad mainnet details are finalized
export const monad = defineChain({
  id: 41454, // Placeholder - update with actual Monad chain ID
  name: 'Monad',
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.monad.xyz'], // Placeholder - update with actual RPC URL
    },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explorer.monad.xyz' }, // Placeholder
  },
});

export const config = createConfig({
  chains: [monad],
  transports: {
    [monad.id]: http(),
  },
  ssr: true,
});
