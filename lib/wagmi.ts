import { http, createConfig } from 'wagmi';
import { defineChain } from 'viem';
import { injected } from 'wagmi/connectors';

// Monad Chain Configuration
// Chain ID: 143 (0x8f), Currency: MON, Block Gas Limit: 200,000,000
// Explorers: https://monadvision.com, https://monadscan.com
const MONAD_CHAIN_ID = process.env.NEXT_PUBLIC_MONAD_CHAIN_ID 
  ? parseInt(process.env.NEXT_PUBLIC_MONAD_CHAIN_ID, 10) 
  : 143;

const MONAD_RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL || 'https://rpc.monad.xyz';

// WalletConnect Project ID (optional - enables mobile wallet support)
// Get a free project ID at https://cloud.walletconnect.com/
export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

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
    default: { name: 'Monadscan', url: 'https://monadscan.com' },
  },
});

// Connectors for wallet connection
// injected() supports browser extension wallets (MetaMask, Trust Wallet, Phantom, etc.)
// WalletConnect can be dynamically added when project ID is configured
const connectors = [
  injected(),
];

export const config = createConfig({
  chains: [monad],
  connectors,
  transports: {
    [monad.id]: http(),
  },
  ssr: true,
});
