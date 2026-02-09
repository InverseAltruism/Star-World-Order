import { http, createConfig, fallback } from 'wagmi';
import { defineChain } from 'viem';
import { injected } from '@wagmi/core';

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

// Fallback RPC URLs to handle rate limiting (429 errors)
// Multiple endpoints provide redundancy and load balancing
const MONAD_MAINNET_RPC_URLS = [
  MONAD_RPC_URL,
  'https://rpc1.monad.xyz',
  'https://rpc2.monad.xyz',
  'https://rpc3.monad.xyz',
  'https://rpc4.monad.xyz',
  'https://rpc-mainnet.monadinfra.com',
  'https://monad-mainnet.drpc.org',
];

const MONAD_TESTNET_RPC_URLS = [
  'https://testnet-rpc.monad.xyz',
  'https://monad-testnet.drpc.org',
];

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
      http: isTestnet ? MONAD_TESTNET_RPC_URLS : MONAD_MAINNET_RPC_URLS,
    },
  },
  blockExplorers: {
    default: { 
      name: isTestnet ? 'Testnet Monadscan' : 'Monadscan', 
      url: isTestnet ? 'https://testnet.monadscan.com' : 'https://monadscan.com' 
    },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      // Multicall3 deployed at canonical address on Monad mainnet
      // Used for batched RPC calls to prevent rate limiting
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
// Note: For mobile wallet support via QR code, set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
// and install @walletconnect/ethereum-provider
const connectors = [
  // Generic injected connector - auto-detects available wallets
  // Supports: MetaMask, Trust Wallet, Phantom, Coinbase Wallet, Rabby, Brave Wallet, etc.
  injected({
    shimDisconnect: true,
  }),
];

// Create fallback transport with multiple RPC endpoints
// This helps avoid 429 rate limiting errors by distributing requests
const rpcUrls = isTestnet ? MONAD_TESTNET_RPC_URLS : MONAD_MAINNET_RPC_URLS;
const transports = rpcUrls.map(url => http(url, {
  retryCount: 3,
  retryDelay: 1000,
  timeout: 10000,
}));

export const config = createConfig({
  chains: [monad],
  connectors,
  transports: {
    [monad.id]: fallback(transports),
  },
  ssr: true,
});
