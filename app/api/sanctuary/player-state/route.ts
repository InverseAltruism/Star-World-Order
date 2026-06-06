import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getPlayerState,
  upsertPlayerVisit,
  markIntroCompleted,
  setOnboardingStep,
  skipOnboarding,
  ONBOARDING_STEPS,
  type OnboardingStep,
} from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { ethAddress, parseSearchParams, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const querySchema = z.object({
  address: ethAddress,
});

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    address: ethAddress,
    action: z.literal('visit'),
  }),
  z.object({
    address: ethAddress,
    action: z.literal('complete-intro'),
  }),
  z.object({
    address: ethAddress,
    action: z.literal('set-onboarding-step'),
    step: z.enum(ONBOARDING_STEPS as readonly [OnboardingStep, ...OnboardingStep[]]),
  }),
  z.object({
    address: ethAddress,
    action: z.literal('skip-onboarding'),
  }),
]);

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

    const state = getPlayerState(parsed.data.address);
    return NextResponse.json({ success: true, state });
  } catch (error) {
    console.error('Sanctuary player-state GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch player state' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(bodySchema, body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const { address, action } = data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    let state;
    switch (action) {
      case 'complete-intro':
        state = markIntroCompleted(address);
        break;
      case 'set-onboarding-step':
        state = setOnboardingStep(address, data.step);
        break;
      case 'skip-onboarding':
        state = skipOnboarding(address);
        break;
      case 'visit':
      default:
        state = upsertPlayerVisit(address);
        break;
    }

    return NextResponse.json({ success: true, state });
  } catch (error) {
    console.error('Sanctuary player-state POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update player state' },
      { status: 500 },
    );
  }
}
