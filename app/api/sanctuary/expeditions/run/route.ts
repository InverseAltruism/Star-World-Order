/**
 * GET /api/sanctuary/expeditions/run?address=0x..&token_id=123&row_id=42
 *
 * Returns the full {@link ExpeditionRunView} for one run: the row record,
 * the reducer state primed at `current_step_id`, and the matching
 * {@link ExpeditionDefinition} so the overlay can render the current
 * narrative + choices without re-loading the catalog client-side.
 *
 * Used by ExpeditionDialog to resume an in-flight run after a remount or
 * page reload: the QuestBoard hands the dialog the `active_row_id` from
 * {@link listExpeditions}, the dialog hits this endpoint to hydrate.
 *
 * Read-only: no rate limit, no wallet signature — same posture as the
 * sibling `/list` route. Returns 404 when the run does not belong to
 * (address, token_id).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getExpeditionRun } from '@/lib/db';
import {
  ethAddress,
  tokenId,
  parseSearchParams,
  formatZodError,
} from '@/lib/sanctuary/validation';

const querySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  row_id: z.coerce.number().int().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseSearchParams(querySchema, searchParams);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 },
      );
    }
    const { address, token_id: tid, row_id } = parsed.data;
    const run = getExpeditionRun(address, tid, row_id);
    if (!run) {
      return NextResponse.json(
        { success: false, error: 'NOT_FOUND' },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, run });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : 'Failed to load expedition run';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
