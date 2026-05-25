/**
 * POST /api/sanctuary/star/process-onchain   (cron-gated)
 *
 * Reconciles the deployed soulbound STAR token to the off-chain ledger. For each
 * wallet with un-synced activity it computes `delta = offchainBalance −
 * onchainBalance` and mints (delta>0) or burns (delta<0) ONLY the difference, so
 * the on-chain balance converges to the ledger. This is self-healing — it
 * backfills pre-existing balances and never strands on an insufficient-balance
 * burn (we only ever burn what's on-chain). No claim button; runs on a short cron.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 * [SWO_V2_SANCTUARY_STAR_ONCHAIN]
 */
import { NextResponse } from 'next/server';
import { validateCronSecret } from '@/lib/cronAuth';
import {
  isStarOnchainEnabled,
  getDirtyOnchainWallets,
  markWalletOnchainSynced,
  markWalletOnchainReconcileFailed,
  getStarBalance,
  getStarOnchainQueueStats,
} from '@/lib/db';
import { getStarChainClient } from '@/lib/sanctuary/starChain';

export async function POST(request: Request) {
  const auth = validateCronSecret(request, 'star-process-onchain');
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
  }
  if (!isStarOnchainEnabled()) {
    return NextResponse.json({ success: false, error: 'STAR_ONCHAIN_ENABLED is off' }, { status: 409 });
  }
  const client = getStarChainClient();
  if (!client) {
    return NextResponse.json(
      { success: false, error: 'STAR on-chain not configured (STAR_CONTRACT_ADDRESS / STAR_SIGNER_KEY)' },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit') || '25')));
  const wallets = getDirtyOnchainWallets(limit);

  const results: Array<{ wallet: string; offchain: number; onchain: number; delta: number; op?: string; hash?: string; ok: boolean; error?: string }> = [];
  for (const wallet of wallets) {
    try {
      const offchain = getStarBalance(wallet).balance;
      const onchain = Math.round(Number(await client.balanceOf(wallet)));
      const delta = offchain - onchain;
      let hash: string | null = null;
      let op: string | undefined;
      if (delta > 0) {
        op = 'mint'; hash = await client.mint(wallet, delta);
        if ((await client.waitForReceipt(hash as `0x${string}`)) !== 'success') throw new Error('mint reverted');
      } else if (delta < 0) {
        op = 'burn'; hash = await client.burn(wallet, -delta);
        if ((await client.waitForReceipt(hash as `0x${string}`)) !== 'success') throw new Error('burn reverted');
      } else {
        op = 'noop'; // already in sync
      }
      markWalletOnchainSynced(wallet, hash);
      results.push({ wallet, offchain, onchain, delta, op, hash: hash ?? undefined, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'reconcile failed';
      markWalletOnchainReconcileFailed(wallet, msg);
      results.push({ wallet, offchain: 0, onchain: 0, delta: 0, ok: false, error: msg });
    }
  }

  return NextResponse.json({
    success: true,
    reconciled: results.length,
    results,
    queue: getStarOnchainQueueStats(),
    contract: client.address,
    signer: client.signer,
  });
}

export const GET = POST;
