// Wallet mock for [SWO_CASINO_PLAYWRIGHT_CONNECTED].
//
// Installs a deterministic EIP-1193 provider on `window.ethereum` BEFORE
// the page hydrates and announces it through EIP-6963 so wagmi's
// `injected()` connector (see `lib/wagmi.ts`) discovers it on mount.
//
// Scope: the mock answers enough JSON-RPC for wagmi to enter the
// "connected to chain X with account Y" state. It deliberately does NOT
// attempt to back the full bet flow (eth_estimateGas, eth_sendTransaction,
// eth_getTransactionReceipt, allowlist `eth_call`, BetSettled subscription)
// — those require either an anvil fork (see `.github/workflows/casino-e2e.yml`)
// or per-spec route shims, and live outside the scope of this initial
// Playwright surface.

import type { Page } from '@playwright/test';

export interface WalletMockOptions {
  /** Address to report as the connected account. Lowercased internally. */
  address?: `0x${string}`;
  /** EVM chain id wagmi should see. Defaults to Monad testnet (10143). */
  chainId?: number;
  /** Display label announced through EIP-6963. */
  walletLabel?: string;
}

const DEFAULT_ADDRESS: `0x${string}` =
  '0x1111111111111111111111111111111111111111';
const DEFAULT_CHAIN_ID = 10143;

/**
 * Install the wallet mock for `page`. Must be called BEFORE
 * `page.goto(...)` — the script runs in every navigation context for the
 * lifetime of the page.
 */
export async function installWalletMock(
  page: Page,
  options: WalletMockOptions = {},
): Promise<void> {
  const address = (options.address ?? DEFAULT_ADDRESS).toLowerCase();
  const chainId = options.chainId ?? DEFAULT_CHAIN_ID;
  const walletLabel = options.walletLabel ?? 'SWO Mock Wallet';

  await page.addInitScript(
    ({ address, chainId, walletLabel }) => {
      // Hex-encode the chain id without leading zeros (EIP-695).
      const chainIdHex = '0x' + chainId.toString(16);
      const deterministicTxHash =
        '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
      const deterministicSignature =
        '0x' + '11'.repeat(65);

      type RpcHandler = (params: unknown[] | undefined) => unknown;

      const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

      const handlers: Record<string, RpcHandler> = {
        eth_chainId: () => chainIdHex,
        net_version: () => String(chainId),
        // Returning a non-empty array from `eth_accounts` is what makes
        // wagmi's injected connector treat the wallet as already
        // authorized, so it auto-reconnects on mount without requiring a
        // user gesture. This is the load-bearing piece of the mock.
        eth_accounts: () => [address],
        eth_requestAccounts: () => [address],
        eth_blockNumber: () => '0x1',
        eth_gasPrice: () => '0x3b9aca00',
        eth_estimateGas: () => '0x5208',
        eth_getBalance: () => '0xde0b6b3a7640000', // 1 ETH/MON
        eth_call: () => '0x',
        eth_getTransactionByHash: () => null,
        eth_getTransactionReceipt: () => null,
        eth_getBlockByNumber: () => null,
        eth_getLogs: () => [],
        eth_subscribe: () => '0x0',
        eth_unsubscribe: () => true,
        wallet_switchEthereumChain: () => null,
        wallet_addEthereumChain: () => null,
        wallet_requestPermissions: () => [
          { parentCapability: 'eth_accounts' },
        ],
        wallet_getPermissions: () => [
          { parentCapability: 'eth_accounts' },
        ],
        personal_sign: () => deterministicSignature,
        eth_sign: () => deterministicSignature,
        eth_signTypedData_v4: () => deterministicSignature,
        eth_sendTransaction: () => deterministicTxHash,
      };

      const provider: Record<string, unknown> = {
        isMetaMask: false,
        isSwoMock: true,
        chainId: chainIdHex,
        selectedAddress: address,
        request: async ({
          method,
          params,
        }: {
          method: string;
          params?: unknown[];
        }) => {
          const handler = handlers[method];
          if (handler) return handler(params);
          // Unknown methods: return null rather than throwing so the page
          // doesn't crash. wagmi/viem treats `null` as a missing value and
          // surfaces it through the corresponding hook's `error` slot.
          return null;
        },
        on: (event: string, listener: (...args: unknown[]) => void) => {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(listener);
        },
        removeListener: (
          event: string,
          listener: (...args: unknown[]) => void,
        ) => {
          listeners.get(event)?.delete(listener);
        },
        removeAllListeners: (event?: string) => {
          if (event) listeners.delete(event);
          else listeners.clear();
        },
      };

      // EIP-1193: expose on window.ethereum so legacy detection paths see
      // it. wagmi's modern detection prefers EIP-6963 announcements (see
      // the dispatch below) but the field is still required for the
      // `injected()` connector's fallback codepath.
      (window as unknown as { ethereum: unknown }).ethereum = provider;

      // EIP-6963 announcement. wagmi v2 listens for the
      // `eip6963:announceProvider` event and prefers announced providers
      // over the bare `window.ethereum`. We respond to both:
      // (a) the immediate `eip6963:requestProvider` from wagmi,
      // (b) a synchronous announce on script init so wagmi catches it
      //     even if it never fires the request event.
      const info = {
        uuid: '00000000-0000-4000-8000-000000000001',
        name: walletLabel,
        icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIvPg==',
        rdns: 'world.swo.mockwallet',
      } as const;

      const announce = () => {
        const detail = Object.freeze({ info, provider });
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', { detail }),
        );
      };

      window.addEventListener('eip6963:requestProvider', announce);
      announce();
    },
    { address, chainId, walletLabel },
  );
}

/**
 * Marker used by specs to assert the mock was installed in the active
 * page. The `installWalletMock` init script writes `window.__swoMock = true`
 * once the EIP-1193 shim is in place.
 */
export function isMockInstalled(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const eth = (window as unknown as { ethereum?: { isSwoMock?: boolean } })
      .ethereum;
    return Boolean(eth?.isSwoMock);
  });
}
