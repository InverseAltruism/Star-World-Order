// [SWO_V2_SANCTUARY_STAR_ONCHAIN] viem client for the soulbound STAR token on
// Monad. The Sanctuary backend holds MINTER_ROLE/BURNER_ROLE and auto-mirrors
// the off-chain ledger on-chain (no claim button) — earn → mint, spend → burn.
// All on-chain writes go through the outbox worker, never the request path, so
// a slow RPC never blocks gameplay. Reads config from env at call time.
import {
  createWalletClient, createPublicClient, http, defineChain,
  parseUnits, formatUnits, type Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const STAR_ABI = [
  { type: 'function', name: 'mint', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'burn', stateMutability: 'nonpayable', inputs: [{ name: 'from', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

const MONAD_TESTNET_RPC = 'https://testnet-rpc.monad.xyz';

function chainId(): number {
  return Number(process.env.STAR_CHAIN_ID || '10143');
}
function rpcUrl(): string {
  return process.env.MONAD_TESTNET_RPC || process.env.STAR_RPC_URL || MONAD_TESTNET_RPC;
}
function contractAddress(): `0x${string}` | null {
  const a = process.env.STAR_CONTRACT_ADDRESS;
  return a && /^0x[0-9a-fA-F]{40}$/.test(a) ? (a as `0x${string}`) : null;
}
function signerKey(): `0x${string}` | null {
  let k = process.env.STAR_SIGNER_KEY || '';
  if (k && !k.startsWith('0x')) k = `0x${k}`;
  return /^0x[0-9a-fA-F]{64}$/.test(k) ? (k as `0x${string}`) : null;
}

function monadChain() {
  const id = chainId();
  return defineChain({
    id,
    name: id === 143 ? 'Monad' : 'Monad Testnet',
    nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl()] } },
  });
}

export interface StarChainClient {
  address: `0x${string}`;
  signer: `0x${string}`;
  mint(to: string, amountInteger: number): Promise<Hash>;
  burn(from: string, amountInteger: number): Promise<Hash>;
  waitForReceipt(hash: Hash): Promise<'success' | 'reverted'>;
  balanceOf(account: string): Promise<string>;
}

/** Build the client, or null if env isn't configured (contract address + signer key). */
export function getStarChainClient(): StarChainClient | null {
  const address = contractAddress();
  const pk = signerKey();
  if (!address || !pk) return null;

  const chain = monadChain();
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl()) });
  const pub = createPublicClient({ chain, transport: http(rpcUrl()) });
  // STAR is 18-decimal; the ledger uses integer units → scale up.
  const scale = (n: number) => parseUnits(String(Math.floor(n)), 18);

  return {
    address,
    signer: account.address,
    async mint(to, amountInteger) {
      return wallet.writeContract({ address, abi: STAR_ABI, functionName: 'mint', args: [to as `0x${string}`, scale(amountInteger)] });
    },
    async burn(from, amountInteger) {
      return wallet.writeContract({ address, abi: STAR_ABI, functionName: 'burn', args: [from as `0x${string}`, scale(amountInteger)] });
    },
    async waitForReceipt(hash) {
      const r = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
      return r.status;
    },
    async balanceOf(account) {
      const bal = (await pub.readContract({ address, abi: STAR_ABI, functionName: 'balanceOf', args: [account as `0x${string}`] })) as bigint;
      return formatUnits(bal, 18);
    },
  };
}
