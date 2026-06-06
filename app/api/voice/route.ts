/**
 * Voice Chat API Route
 *
 * GET /api/voice - Get active voice session and participants
 * POST /api/voice - Create/join voice session
 * PATCH /api/voice - Update mute status
 * DELETE /api/voice - Leave/end voice session
 */

import { NextResponse } from 'next/server';
import {
  getActiveVoiceSession,
  createVoiceSession,
  joinVoiceSession,
  leaveVoiceSession,
  endVoiceSession,
  getVoiceParticipants,
  updateMuteStatus,
} from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { route } from '@/lib/api/route';

export const GET = route({ error: 'Failed to get voice session' }, async () => {
  const session = getActiveVoiceSession();

  if (!session) {
    return NextResponse.json({
      success: true,
      session: null,
      participants: [],
    });
  }

  const participants = getVoiceParticipants(session.session_id);

  return NextResponse.json({
    success: true,
    session,
    participants,
    timestamp: new Date().toISOString(),
  });
});

export const POST = route({ error: 'Failed to handle voice action' }, async (request) => {
  const body = await request.json();
  const { walletAddress, action } = body;

  if (!walletAddress) {
    return NextResponse.json(
      { success: false, error: 'Wallet address required' },
      { status: 400 }
    );
  }

  const auth = await verifyWalletAccess(request, walletAddress);
  if (!auth.valid) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: 401 }
    );
  }

  if (action === 'create') {
    // Create a new session
    const existingSession = getActiveVoiceSession();
    if (existingSession) {
      // Join existing session instead
      const participant = joinVoiceSession(existingSession.session_id, walletAddress);
      const participants = getVoiceParticipants(existingSession.session_id);

      return NextResponse.json({
        success: true,
        session: existingSession,
        participant,
        participants,
        message: 'Joined existing session',
      });
    }

    const session = createVoiceSession(walletAddress);
    const participant = joinVoiceSession(session.session_id, walletAddress);

    return NextResponse.json({
      success: true,
      session,
      participant,
      participants: [participant],
      message: 'Session created',
    });
  }

  if (action === 'join') {
    let session = getActiveVoiceSession();
    const sessionCreated = !session;

    // Auto-create session if none exists (Issue 4 fix)
    if (!session) {
      session = createVoiceSession(walletAddress);
    }

    const participant = joinVoiceSession(session.session_id, walletAddress);
    const participants = getVoiceParticipants(session.session_id);

    return NextResponse.json({
      success: true,
      session,
      participant,
      participants,
      message: sessionCreated ? 'Created and joined session' : 'Joined session',
    });
  }

  return NextResponse.json(
    { success: false, error: 'Invalid action' },
    { status: 400 }
  );
});

export const PATCH = route({ error: 'Failed to update mute status' }, async (request) => {
  const body = await request.json();
  const { walletAddress, sessionId, isMuted } = body;

  if (!walletAddress || !sessionId || isMuted === undefined) {
    return NextResponse.json(
      { success: false, error: 'Missing required fields' },
      { status: 400 }
    );
  }

  const auth = await verifyWalletAccess(request, walletAddress);
  if (!auth.valid) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: 401 }
    );
  }

  updateMuteStatus(sessionId, walletAddress, isMuted);

  return NextResponse.json({
    success: true,
    message: isMuted ? 'Muted' : 'Unmuted',
  });
});

export const DELETE = route({ error: 'Failed to leave voice session' }, async (request) => {
  const body = await request.json();
  const { walletAddress, sessionId, endSession } = body;

  if (!walletAddress || !sessionId) {
    return NextResponse.json(
      { success: false, error: 'Missing required fields' },
      { status: 400 }
    );
  }

  const auth = await verifyWalletAccess(request, walletAddress);
  if (!auth.valid) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: 401 }
    );
  }

  if (endSession) {
    // End the entire session
    endVoiceSession(sessionId);
    return NextResponse.json({
      success: true,
      message: 'Session ended',
    });
  }

  // Just leave the session
  leaveVoiceSession(sessionId, walletAddress);

  // Check if there are any participants left
  const participants = getVoiceParticipants(sessionId);
  if (participants.length === 0) {
    endVoiceSession(sessionId);
  }

  return NextResponse.json({
    success: true,
    message: 'Left session',
    remainingParticipants: participants.length,
  });
});
