/**
 * Voice Chat API Route
 * 
 * GET /api/voice - Get active voice session and participants
 * POST /api/voice - Create/join voice session
 * PATCH /api/voice - Update mute status
 * DELETE /api/voice - Leave/end voice session
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getActiveVoiceSession,
  createVoiceSession,
  joinVoiceSession,
  leaveVoiceSession,
  endVoiceSession,
  getVoiceParticipants,
  updateMuteStatus,
} from '@/lib/db';

export async function GET() {
  try {
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
  } catch (error) {
    console.error('Failed to get voice session:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get voice session' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, action } = body;
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address required' },
        { status: 400 }
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
        message: session ? 'Joined session' : 'Created and joined session',
      });
    }
    
    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Failed to handle voice action:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to handle voice action' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, sessionId, isMuted } = body;
    
    if (!walletAddress || !sessionId || isMuted === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    updateMuteStatus(sessionId, walletAddress, isMuted);
    
    return NextResponse.json({
      success: true,
      message: isMuted ? 'Muted' : 'Unmuted',
    });
  } catch (error) {
    console.error('Failed to update mute status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update mute status' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, sessionId, endSession } = body;
    
    if (!walletAddress || !sessionId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
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
  } catch (error) {
    console.error('Failed to leave voice session:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to leave voice session' },
      { status: 500 }
    );
  }
}
