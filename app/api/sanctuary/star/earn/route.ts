/**
 * POST /api/sanctuary/star/earn
 *
 * Internal-only endpoint that credits STAR to a wallet. Called by quest /
 * activity / minigame completion handlers (server-side). NOT public — requires
 * a Bearer token matching `STAR_INTERNAL_SECRET` (or CRON_SECRET as fallback)
 * so that no client can mint STAR by hitting this URL directly.
 *
 * Body: { address, source, amount, detail? }
 *   source: 'quest' | 'minigame_first' | 'daily_login' | 'activity' | 'levelup'
 *   amount is clamped into the per-source [min, max] band defined in
 *   STAR_EARN_RATES.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { earnStar, type StarEarnSource } from '@/lib/db';
import { ethAddress, parseBody, formatZodError } from '@/lib/sanctuary/validation';
import { logger } from '@/lib/logger';
import { isCronBypassAllowed } from '@/lib/cronAuth';

const bodySchema = z.object({
  address: ethAddress,
  source: z.enum(['quest', 'minigame_first', 'daily_login', 'activity', 'levelup']),
  amount: z.coerce.number().int().min(1),
  detail: z.string().max(64).optional(),
});

function validateInternalSecret(request: Request): { valid: boolean; error?: string } {
  if (isCronBypassAllowed() && !process.env.STAR_INTERNAL_SECRET) {
    logger.warn('star/earn: internal-secret check bypassed via SANCTUARY_ALLOW_CRON_BYPASS=1');
    return { valid: true };
  }
  const secret = process.env.STAR_INTERNAL_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    logger.error('star/earn: STAR_INTERNAL_SECRET / CRON_SECRET not configured');
    return { valid: false, error: 'Internal secret not configured' };
  }
  const header = request.headers.get('Authorization');
  if (!header) return { valid: false, error: 'Missing Authorization header' };
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (token !== secret) return { valid: false, error: 'Invalid internal token' };
  return { valid: true };
}

export async function POST(request: NextRequest) {
  try {
    const auth = validateInternalSecret(request);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const parsed = parseBody(bodySchema, body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }

    const { address, source, amount, detail } = parsed.data;
    const result = earnStar(address, source as StarEarnSource, amount, detail);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to earn STAR';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
