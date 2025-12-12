import { http, createConfig } from 'wagmi';
import { defineChain } from 'viem';
import { injected } from 'wagmi/connectors';

// Monad Chain Configuration
// Supports both Mainnet (Chain ID: 143) and Testnet (Chain ID: 10143)
// Set NEXT_PUBLIC_MONAD_CHAIN_ID in your .env file to switch networks
const MONAD_CHAIN_ID = process.env.NEXT_PUBLIC_MONAD_CHAIN_ID 
  ? parseInt(process.env.NEXT_PUBLIC_MONAD_CHAIN_ID, 10) 
  : 143;

const MONAD_RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL || 'https://rpc.monad.xyz';

// Determine if we're on testnet based on chain ID
const isTestnet = MONAD_CHAIN_ID === 10143;

// WalletConnect Project ID (optional - enables mobile wallet support)
// Get a free project ID at https://cloud.walletconnect.com/
export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

// Network configuration
// Mainnet: Chain ID 143, Currency: MON, Block Gas Limit: 200,000,000
// Testnet: Chain ID 10143, Currency: MON (testnet), Faucet: https://faucet.monad.xyz
export const monad = defineChain({
  id: MONAD_CHAIN_ID,
  name: isTestnet ? 'Monad Testnet' : 'Monad',
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
    default: { 
      name: isTestnet ? 'Testnet Monadscan' : 'Monadscan', 
      url: isTestnet ? 'https://testnet.monadscan.com' : 'https://monadscan.com' 
    },
  },
  testnet: isTestnet,
});

// Export network info for use elsewhere in the app
export const networkInfo = {
  chainId: MONAD_CHAIN_ID,
  isTestnet,
  explorerUrl: isTestnet ? 'https://testnet.monadscan.com' : 'https://monadscan.com',
  faucetUrl: isTestnet ? 'https://faucet.monad.xyz' : undefined,
};

// Connectors for wallet connection
// injected() supports browser extension wallets (MetaMask, Trust Wallet, Phantom, etc.)
// We use multiple injected connectors with different targets for better wallet detection
const connectors = [
  // Generic injected connector - auto-detects available wallets
  injected({
    shimDisconnect: true,
  }),
];

export const config = createConfig({
  chains: [monad],
  connectors,
  transports: {
    [monad.id]: http(),
  },
  ssr: true,
});
