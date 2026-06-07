// Wallet mock for [SWO_CASINO_PLAYWRIGHT_CONNECTED].
//
// Two layers, used in tandem:
//
//   1. EIP-1193 + EIP-6963 provider installed via `installWalletMock`
//      (page.addInitScript). Wagmi's `injected()` connector picks it up
//      on hydration and treats the wallet as already authorised. This
//      layer answers signing-side RPC (`eth_accounts`, `eth_chainId`,
//      `eth_sendTransaction`, etc.) and pins `game.allowlist()` to the
//      zero address so `useAllowlistGate` short-circuits to `passthrough`.
//
//   2. HTTP JSON-RPC interceptor installed via `installRpcRoute`
//      (page.route). Intercepts wagmi's HTTP transport calls to the public
//      Monad RPC endpoints and serves a deterministic, in-memory chain.
//      Includes a `pushLog` helper so a spec can inject a synthetic
//      `BetSettled` / `SessionCashedOut` / `StepPlayed` log; the next
//      `useWatchContractEvent` poll picks it up and the surface flips into
//      its post-settle state. This is what unlocks the Won/Lost (Coinflip,
//      Dice) and SessionCashedOut/SessionLost/SessionPushed (Climb)
//      assertions in the wallet-mocked specs without requiring an anvil
//      fork.

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

  // Skip the STAR-64 boot/cartridge overlay (components/LoadingScreen.tsx).
  // It renders fixed at zIndex 9999, only advances on a user click, and
  // short-circuits when `sessionStorage["swo-loading-seen"]` is truthy —
  // fresh Playwright contexts never have it, so without this every click in
  // the connected specs is intercepted by the overlay. (visual.spec.ts sets
  // the same key independently.)
  await page.addInitScript(() => {
    window.sessionStorage.setItem('swo-loading-seen', '1');
  });

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

      // Selector → eth_call response map. Pre-seeded with the
      // `game.allowlist()` selector (`0x2b47da52`,
      // = keccak256("allowlist()")[:4]) returning the ABI-encoded zero
      // address. That short-circuits `useAllowlistGate` to `passthrough`
      // (see lib/casino/useAllowlistGate.ts §1) so the bet CTA becomes
      // clickable rather than getting stuck in the gate's loading or
      // denied branches. Other selectors fall through to `0x`.
      const ALLOWLIST_SELECTOR = '0x2b47da52';
      const ABI_ENCODED_ZERO_ADDRESS =
        '0x0000000000000000000000000000000000000000000000000000000000000000';

      function ethCallResponse(params: unknown[] | undefined): string {
        const call = params?.[0] as
          | { data?: string; input?: string }
          | undefined;
        const calldata = (call?.data ?? call?.input ?? '').toLowerCase();
        if (calldata.startsWith(ALLOWLIST_SELECTOR)) {
          return ABI_ENCODED_ZERO_ADDRESS;
        }
        return '0x';
      }

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
        eth_call: (params) => ethCallResponse(params),
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

/* ------------------------------------------------------------------ */
/* HTTP JSON-RPC interceptor (eth_getLogs / event-log injection layer) */
/* ------------------------------------------------------------------ */

export interface SyntheticLog {
  /** Contract emitting the event. Lowercased on injection. */
  address: `0x${string}`;
  /** event topic + indexed topics (topic[0] is the event signature hash). */
  topics: `0x${string}`[];
  /** ABI-encoded non-indexed data. */
  data: `0x${string}`;
}

// Per-page queue of synthetic logs the interceptor will return on the
// next `eth_getLogs` poll. Keyed by browser context id so concurrent
// specs don't bleed state into each other.
const logQueues: WeakMap<Page, SyntheticLog[]> = new WeakMap();

// RPC URLs wagmi's HTTP transport hits when NEXT_PUBLIC_MONAD_CHAIN_ID
// is 10143 (testnet) — the playwright.config locks the chain to testnet
// so we don't have to mirror the mainnet fallback list here.
// Patterns are simple glob substrings matched anywhere in the URL; this
// is intentionally permissive so we catch retries/fallbacks.
const RPC_URL_PATTERNS: RegExp[] = [
  /\/\/testnet-rpc\.monad\.xyz/i,
  /\/\/monad-testnet\.drpc\.org/i,
  /\/\/rpc[0-9]*\.monad\.xyz/i,
  /\/\/monad-mainnet\.drpc\.org/i,
  /\/\/rpc-mainnet\.monadinfra\.com/i,
];

function isJsonRpcUrl(url: string): boolean {
  return RPC_URL_PATTERNS.some((re) => re.test(url));
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: unknown[];
}

/**
 * Install the JSON-RPC route interceptor. Must be called BEFORE
 * `page.goto(...)`. Pairs with `installWalletMock`: the EIP-1193 provider
 * handles signing-side RPC inside the page, while this route intercepts
 * wagmi's HTTP transport so `useWatchContractEvent` can pick up logs we
 * queue via `pushLog`.
 *
 * Returns a plain object handle whose `pushLog(...)` method queues a
 * synthetic log to be served on the next matching `eth_getLogs` poll. The
 * queue is drained on each poll, so `pushLog` is one-shot per call.
 */
export async function installRpcRoute(
  page: Page,
  options: WalletMockOptions = {},
): Promise<{
  pushLog: (log: SyntheticLog) => void;
  clearLogs: () => void;
}> {
  const chainId = options.chainId ?? DEFAULT_CHAIN_ID;
  const chainIdHex = '0x' + chainId.toString(16);

  // Per-page block height — bumped on every poll so wagmi's
  // watchContractEvent (which keys its log range on the latest block)
  // always sees a fresh tip.
  let blockHeight = 0x10;
  const ALLOWLIST_SELECTOR = '0x2b47da52';
  const ABI_ENCODED_ZERO_ADDRESS =
    '0x0000000000000000000000000000000000000000000000000000000000000000';

  logQueues.set(page, []);

  // Filter registry for the eth_newFilter / eth_getFilterChanges path.
  // viem's watchContractEvent PREFERS installed filters when the node
  // accepts eth_newFilter — and each of HiLo's three parallel
  // subscriptions installs its own. Returning a shared id and ignoring
  // the stored topics (the old behaviour) made the first poller drain
  // the whole queue topic-blind, starving the other subscriptions —
  // SessionCashedOut/StepPlayed logs vanished into the SessionPushed
  // watcher and the climb specs hung. Store each filter's topics and
  // replay them through the same drain-by-topic logic instead.
  const filters = new Map<string, { topics?: Array<string | string[] | null> }>();
  let nextFilterId = 1;

  function handleSingle(req: JsonRpcRequest): unknown {
    const queue = logQueues.get(page) ?? [];
    switch (req.method) {
      case 'eth_chainId':
        return chainIdHex;
      case 'net_version':
        return String(chainId);
      case 'eth_blockNumber': {
        blockHeight += 1;
        return '0x' + blockHeight.toString(16);
      }
      case 'eth_getBlockByNumber':
        return {
          number: '0x' + blockHeight.toString(16),
          hash: '0x' + 'aa'.repeat(32),
          parentHash: '0x' + 'bb'.repeat(32),
          nonce: '0x0000000000000000',
          sha3Uncles:
            '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
          logsBloom: '0x' + '00'.repeat(256),
          transactionsRoot: '0x' + '00'.repeat(32),
          stateRoot: '0x' + '00'.repeat(32),
          receiptsRoot: '0x' + '00'.repeat(32),
          miner: '0x0000000000000000000000000000000000000000',
          difficulty: '0x0',
          totalDifficulty: '0x0',
          extraData: '0x',
          size: '0x0',
          gasLimit: '0x1c9c380',
          gasUsed: '0x0',
          timestamp: '0x0',
          transactions: [],
          uncles: [],
          baseFeePerGas: '0x0',
        };
      case 'eth_gasPrice':
        return '0x3b9aca00';
      case 'eth_estimateGas':
        return '0x5208';
      case 'eth_getBalance':
        return '0xde0b6b3a7640000';
      case 'eth_call': {
        const call = req.params?.[0] as
          | { data?: string; input?: string }
          | undefined;
        const calldata = (call?.data ?? call?.input ?? '').toLowerCase();
        if (calldata.startsWith(ALLOWLIST_SELECTOR)) {
          return ABI_ENCODED_ZERO_ADDRESS;
        }
        return '0x';
      }
      case 'eth_getLogs': {
        // Serve any queued log whose topic[0] matches the filter (or
        // every queued log if the filter has no topic constraint). Logs
        // are removed from the queue as soon as they're served so the
        // same synthetic event doesn't replay across multiple polls.
        // Filtering by topic matters: HiLoContent registers three
        // separate `useWatchContractEvent` subscriptions in parallel,
        // and without this filter the first poll (whichever subscription
        // wins the race) would drain the queue and starve the others.
        if (queue.length === 0) return [];
        const filter = req.params?.[0] as
          | { topics?: Array<string | string[] | null> }
          | undefined;
        const wantTopic = (() => {
          const t = filter?.topics?.[0];
          if (!t) return null;
          if (Array.isArray(t)) return t.map((s) => s.toLowerCase());
          return [t.toLowerCase()];
        })();
        const matched: SyntheticLog[] = [];
        for (let i = queue.length - 1; i >= 0; i--) {
          const log = queue[i];
          if (
            wantTopic === null ||
            wantTopic.includes(log.topics[0].toLowerCase())
          ) {
            matched.unshift(log);
            queue.splice(i, 1);
          }
        }
        return matched.map((l, i) => ({
          address: l.address.toLowerCase(),
          topics: l.topics,
          data: l.data,
          blockNumber: '0x' + blockHeight.toString(16),
          transactionHash: '0x' + 'cc'.repeat(32),
          transactionIndex: '0x0',
          blockHash: '0x' + 'aa'.repeat(32),
          logIndex: '0x' + i.toString(16),
          removed: false,
        }));
      }
      case 'eth_newFilter': {
        const id = '0x' + (nextFilterId++).toString(16);
        filters.set(
          id,
          (req.params?.[0] as { topics?: Array<string | string[] | null> }) ??
            {},
        );
        return id;
      }
      case 'eth_newBlockFilter':
        return '0x' + (nextFilterId++).toString(16);
      case 'eth_getFilterChanges': {
        // Filter-based polling: params[0] is the filter ID, not a filter
        // object — resolve it to the stored topics and reuse the
        // drain-by-topic logic above so parallel subscriptions don't
        // starve each other.
        const id = String(req.params?.[0] ?? '');
        const stored = filters.get(id);
        if (!stored) return [];
        return handleSingle({
          ...req,
          method: 'eth_getLogs',
          params: [stored],
        });
      }
      case 'eth_uninstallFilter': {
        filters.delete(String(req.params?.[0] ?? ''));
        return true;
      }
      case 'eth_getTransactionReceipt':
        return null;
      case 'eth_getTransactionByHash':
        return null;
      default:
        return null;
    }
  }

  await page.route(
    (url) => isJsonRpcUrl(url.toString()),
    async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') {
        await route.fulfill({ status: 200, body: 'ok' });
        return;
      }
      let body: unknown;
      try {
        body = JSON.parse(request.postData() ?? '{}');
      } catch {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'parse error' },
          }),
        });
        return;
      }
      const respond = (payload: unknown) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(payload),
        });
      if (Array.isArray(body)) {
        const batch = body.map((req: JsonRpcRequest) => ({
          jsonrpc: '2.0' as const,
          id: req.id,
          result: handleSingle(req),
        }));
        await respond(batch);
        return;
      }
      const req = body as JsonRpcRequest;
      await respond({
        jsonrpc: '2.0',
        id: req.id ?? null,
        result: handleSingle(req),
      });
    },
  );

  return {
    pushLog(log: SyntheticLog) {
      const q = logQueues.get(page);
      if (q) q.push(log);
    },
    clearLogs() {
      const q = logQueues.get(page);
      if (q) q.length = 0;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Pre-encoded event-log builders for the three casino surfaces       */
/* ------------------------------------------------------------------ */

// Event topic hashes (keccak256 of the canonical signature). Re-derived
// in this file rather than imported from viem so the fixture stays a
// pure browser/runtime utility and doesn't pull viem into the test
// bundle for what is ultimately a 32-byte constant.
//
//   BetSettled(uint256,address,uint8,bool,uint256,bytes32)  ← coinflip + dice
//   SessionCashedOut(uint256,address,uint256,uint256)
//   StepPlayed(uint256,address,uint8,uint8,uint8,bool,uint256,bytes32,bytes32)
//   SessionPushed(uint256,address,uint256,uint8,uint256)
const TOPIC_BET_SETTLED =
  '0x71a206fb817fa18f14d95185b76d884136aa48a497b1a01c08af466696096b65' as const;
const TOPIC_SESSION_CASHED_OUT =
  '0xe787a936135700554a54560928c1a4d7f122d01ba4959b43f5aa91e9d3e87c45' as const;
const TOPIC_STEP_PLAYED =
  '0xcce87fd9d0075b729d9e741c2d45dd69980c62dc225d9d414d0971e801646347' as const;
const TOPIC_SESSION_PUSHED =
  '0xf87a789c7cb7b38f4cfea04996e26f24e2814051a5dc3bd8170922b17425823d' as const;

function topicAddress(addr: `0x${string}`): `0x${string}` {
  // 20-byte address → 32-byte topic (left-padded).
  const stripped = addr.toLowerCase().replace(/^0x/, '');
  return ('0x' + '0'.repeat(24) + stripped) as `0x${string}`;
}

function topicUint(n: bigint | number): `0x${string}` {
  const v = typeof n === 'bigint' ? n : BigInt(n);
  return ('0x' + v.toString(16).padStart(64, '0')) as `0x${string}`;
}

function abiWord(n: bigint | number | boolean): string {
  if (typeof n === 'boolean') return n ? '1'.padStart(64, '0') : '0'.padStart(64, '0');
  const v = typeof n === 'bigint' ? n : BigInt(n);
  return v.toString(16).padStart(64, '0');
}

function abiBytes32(hex: `0x${string}`): string {
  const stripped = hex.replace(/^0x/, '');
  return stripped.padStart(64, '0').slice(0, 64);
}

/** Build a synthetic Coinflip/Dice `BetSettled` log. */
export function makeBetSettledLog(args: {
  contractAddress: `0x${string}`;
  player: `0x${string}`;
  betId: bigint | number;
  outcome: number; // dice "roll" / coinflip "outcome" — 1 byte
  won: boolean;
  payoutWei?: bigint;
  serverReveal?: `0x${string}`;
}): SyntheticLog {
  const payout = args.payoutWei ?? 0n;
  const reveal: `0x${string}` =
    args.serverReveal ?? ('0x' + '11'.repeat(32)) as `0x${string}`;
  // Non-indexed: outcome (uint8), won (bool), payout (uint256), serverReveal (bytes32)
  const data =
    '0x' +
    abiWord(args.outcome) +
    abiWord(args.won) +
    abiWord(payout) +
    abiBytes32(reveal);
  return {
    address: args.contractAddress,
    topics: [
      TOPIC_BET_SETTLED,
      topicUint(args.betId),
      topicAddress(args.player),
    ],
    data: data as `0x${string}`,
  };
}

/** Build a synthetic HiLo `SessionCashedOut` log. */
export function makeSessionCashedOutLog(args: {
  contractAddress: `0x${string}`;
  player: `0x${string}`;
  sessionId: bigint | number;
  payoutWei?: bigint;
  finalMultiplierWad?: bigint;
}): SyntheticLog {
  const payout = args.payoutWei ?? 0n;
  const mult = args.finalMultiplierWad ?? 1_000_000_000_000_000_000n;
  const data = '0x' + abiWord(payout) + abiWord(mult);
  return {
    address: args.contractAddress,
    topics: [
      TOPIC_SESSION_CASHED_OUT,
      topicUint(args.sessionId),
      topicAddress(args.player),
    ],
    data: data as `0x${string}`,
  };
}

/** Build a synthetic HiLo `StepPlayed` log with `won=false` (drives 'lost'). */
export function makeStepPlayedLostLog(args: {
  contractAddress: `0x${string}`;
  player: `0x${string}`;
  sessionId: bigint | number;
}): SyntheticLog {
  // direction (uint8), prevCard (uint8), newCard (uint8), won (bool),
  // newMultiplier (uint256), serverReveal (bytes32), nextCommit (bytes32)
  const data =
    '0x' +
    abiWord(0) +
    abiWord(7) +
    abiWord(2) +
    abiWord(false) +
    abiWord(1_000_000_000_000_000_000n) +
    abiBytes32(('0x' + '22'.repeat(32)) as `0x${string}`) +
    abiBytes32(('0x' + '33'.repeat(32)) as `0x${string}`);
  return {
    address: args.contractAddress,
    topics: [
      TOPIC_STEP_PLAYED,
      topicUint(args.sessionId),
      topicAddress(args.player),
    ],
    data: data as `0x${string}`,
  };
}

/** Build a synthetic HiLo `SessionPushed` log. */
export function makeSessionPushedLog(args: {
  contractAddress: `0x${string}`;
  player: `0x${string}`;
  sessionId: bigint | number;
}): SyntheticLog {
  const stake = 1_000_000_000_000_000n; // 0.001 MON
  const card = 7;
  const mult = 1_000_000_000_000_000_000n;
  const data = '0x' + abiWord(stake) + abiWord(card) + abiWord(mult);
  return {
    address: args.contractAddress,
    topics: [
      TOPIC_SESSION_PUSHED,
      topicUint(args.sessionId),
      topicAddress(args.player),
    ],
    data: data as `0x${string}`,
  };
}
