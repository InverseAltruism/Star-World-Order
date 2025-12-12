import { http, createConfig } from 'wagmi';
import { defineChain } from 'viem';

// Monad Chain Configuration
// Uses environment variables with fallback placeholder values for development
const MONAD_CHAIN_ID = process.env.NEXT_PUBLIC_MONAD_CHAIN_ID 
  ? parseInt(process.env.NEXT_PUBLIC_MONAD_CHAIN_ID, 10) 
  : 41454;

const MONAD_RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL || 'https://rpc.monad.xyz';

export const monad = defineChain({
  id: MONAD_CHAIN_ID,
  name: 'Monad',
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: [MONAD_RPC_URL],
    },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explorer.monad.xyz' },
  },
});

export const config = createConfig({
  chains: [monad],
  transports: {
    [monad.id]: http(),
  },
  ssr: true,
});
