'use client';

import { useState, useEffect, useCallback } from 'react';
import { OnlineUser } from '@/lib/hooks/useStarPoints';
import { truncateAddress } from '@/lib/governance';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';

/**
 * Voice chat panel (UI ready for WebRTC; audio still stubbed — "AUDIO COMING
 * SOON"). Previously this lived twice in HangoutContent.tsx as VoiceChatInline
 * and VoiceChat — byte-identical logic, differing only in the outer wrapper and
 * header. Unified here behind a `variant`:
 *   - 'inline' → bare wrapper + h4 (used inside the Lobby column)
 *   - 'card'   → pixel-card wrapper + gold h3 (standalone card)
 */

interface ApiVoiceParticipant {
  id: number;
  session_id: string;
  wallet_address: string;
  is_muted: number;
  joined_at: string;
  left_at: string | null;
}

async function voiceAuthHeaders(address?: string): Promise<Record<string, string> | null> {
  if (!address) return null;
  const walletAuthHeader = await getWalletAuthHeader(address);
  if (!walletAuthHeader) return null;
  return { 'Content-Type': 'application/json', 'x-wallet-auth': walletAuthHeader };
}

interface VoiceChatPanelProps {
  address: string | undefined;
  onlineUsers: OnlineUser[];
  variant: 'inline' | 'card';
}

export default function VoiceChatPanel({ address, onlineUsers, variant }: VoiceChatPanelProps) {
  const isCard = variant === 'card';
  const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Array<{ address: string; isMuted: boolean; isSpeaking: boolean }>>([]);

  // Load participants from server
  const loadParticipants = useCallback(async () => {
    try {
      const response = await fetch('/api/voice');
      const data = await response.json();
      if (data.success && data.participants) {
        const transformedParticipants = data.participants.map((p: ApiVoiceParticipant) => ({
          address: p.wallet_address,
          isMuted: p.is_muted === 1,
          isSpeaking: false, // WebRTC speaking detection would be needed for this
        }));
        setParticipants(transformedParticipants);

        // Check if current user is in the call
        if (address && data.participants.some((p: ApiVoiceParticipant) => p.wallet_address.toLowerCase() === address.toLowerCase())) {
          setIsInCall(true);
          if (data.session) {
            setSessionId(data.session.session_id);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load voice participants:', error);
    }
  }, [address]);

  // Poll for participants updates
  useEffect(() => {
    if (isInCall) {
      loadParticipants();
      const interval = setInterval(loadParticipants, 10000);
      return () => clearInterval(interval);
    }
  }, [isInCall, loadParticipants]);

  // Join voice call via server API
  const handleJoinCall = useCallback(async () => {
    if (!address) return;

    try {
      const headers = await voiceAuthHeaders(address);
      if (!headers) {
        return;
      }

      const response = await fetch('/api/voice', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          walletAddress: address,
          action: 'join',
        }),
      });

      const data = await response.json();
      if (data.success) {
        setIsInCall(true);
        setIsMuted(true);
        if (data.session) {
          setSessionId(data.session.session_id);
        }
        loadParticipants();
      }
    } catch (error) {
      console.error('Failed to join voice:', error);
      // Fallback to local state
      setIsInCall(true);
      setIsMuted(true);
      setParticipants([{ address, isMuted: true, isSpeaking: false }]);
    }
  }, [address, loadParticipants]);

  // Leave voice call via server API
  const handleLeaveCall = useCallback(async () => {
    if (!address) {
      // If no address, just clean up local state
      setIsInCall(false);
      setParticipants([]);
      setIsMuted(true);
      setIsDeafened(false);
      setSessionId(null);
      return;
    }

    // Try to leave via API if we have a sessionId
    if (sessionId) {
      try {
        const headers = await voiceAuthHeaders(address);
        if (!headers) {
          return;
        }

        await fetch('/api/voice', {
          method: 'DELETE',
          headers,
          body: JSON.stringify({
            walletAddress: address,
            sessionId,
          }),
        });
      } catch (error) {
        console.error('Failed to leave voice:', error);
      }
    }

    // Always clean up local state
    setIsInCall(false);
    setParticipants([]);
    setIsMuted(true);
    setIsDeafened(false);
    setSessionId(null);
  }, [address, sessionId]);

  // Toggle mute via server API
  const toggleMute = useCallback(async () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);

    if (sessionId && address) {
      try {
        const headers = await voiceAuthHeaders(address);
        if (!headers) {
          return;
        }

        await fetch('/api/voice', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            walletAddress: address,
            sessionId,
            isMuted: newMutedState,
          }),
        });
        loadParticipants();
      } catch (error) {
        console.error('Failed to update mute status:', error);
      }
    }

    // Update local participant status
    setParticipants(prev => prev.map(p =>
      p.address.toLowerCase() === address?.toLowerCase() ? { ...p, isMuted: newMutedState } : p
    ));
  }, [address, isMuted, sessionId, loadParticipants]);

  const toggleDeafen = useCallback(() => {
    setIsDeafened(prev => !prev);
    if (!isDeafened) {
      setIsMuted(true);
    }
  }, [isDeafened]);

  // handleJoinCall is wired for the upcoming WebRTC flow (the "Coming Soon" stub
  // doesn't surface a join button yet); reference it so it isn't flagged unused.
  void handleJoinCall;

  const statusBadge = (
    <span className={`text-[10px] px-2 py-0.5 rounded ${
      isInCall
        ? 'text-[#44ff88] bg-[#44ff88]/10'
        : 'text-[#9966ff] bg-[#9966ff]/10'
    }`}>
      {isInCall ? `${participants.length} IN CALL` : 'AVAILABLE'}
    </span>
  );

  const comingSoonBadge = (
    <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#9966ff]/20 text-[#9966ff] border border-[#9966ff]/40">
      AUDIO COMING SOON
    </span>
  );

  return (
    <div className={isCard ? 'pixel-card p-3 animate-slide-in-up animate-delay-2 relative z-50' : 'mb-4'}>
      <div className="flex items-center justify-between mb-2">
        {isCard ? (
          <h3 className="text-[#ffd700] text-xs tracking-wider animate-glow-pulse flex items-center gap-2">
            <span>🎙️</span> VOICE
            {comingSoonBadge}
          </h3>
        ) : (
          <h4 className="text-[#9966ff] text-xs tracking-wider flex items-center gap-2">
            <span>🎙️</span> VOICE CHAT
            {comingSoonBadge}
          </h4>
        )}
        {statusBadge}
      </div>

      <div className="bg-[#0a0a15] rounded-lg p-3 border-2 border-[#2a2a4e]">
        {!isInCall ? (
          // Not in call - show Coming Soon message
          <div className="flex items-center justify-center py-2">
            <p className="text-[#9966ff] text-xs tracking-wide">
              Coming Soon ~DN
            </p>
          </div>
        ) : (
          // In call - show compact controls and participants
          <div className="space-y-2">
            {/* Participants - compact */}
            <div className="flex flex-wrap gap-1">
              {participants.map((p) => (
                <div
                  key={p.address}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${
                    p.isSpeaking
                      ? 'bg-[#44ff88]/20 border border-[#44ff88]'
                      : 'bg-[#1a1a2e] border border-[#2a2a4e]'
                  }`}
                >
                  <span className={p.isMuted ? 'opacity-50' : ''}>
                    {p.isMuted ? '🔇' : '🎤'}
                  </span>
                  <span className="text-gray-300">
                    {truncateAddress(p.address)}
                  </span>
                  {p.address.toLowerCase() === address?.toLowerCase() && (
                    <span className="text-[#ffd700]">(you)</span>
                  )}
                </div>
              ))}

              {/* Show other online users as potential participants */}
              {onlineUsers.slice(0, 2).filter(u => u.address.toLowerCase() !== address?.toLowerCase()).map((user) => (
                <div
                  key={user.address}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[#1a1a2e] border border-[#2a2a4e] opacity-50"
                  title="Available to join voice"
                >
                  <span>🔇</span>
                  <span className="text-gray-400">
                    {truncateAddress(user.address)}
                  </span>
                </div>
              ))}
            </div>

            {/* Voice level indicator - compact */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500">LEVEL</span>
              <div className="flex-1 h-1.5 bg-[#1a1a2e] rounded overflow-hidden">
                <div
                  className={`h-full transition-all duration-75 ${
                    isMuted ? 'w-0' : 'w-1/4'
                  } bg-gradient-to-r from-[#44ff88] via-[#ffd700] to-[#ff4466]`}
                />
              </div>
            </div>

            {/* Controls - compact buttons */}
            <div className="flex justify-center gap-2">
              <button
                onClick={toggleMute}
                className={`pixel-btn text-[10px] !px-2 !py-1 smooth-transition ${
                  isMuted
                    ? '!bg-[#ff4466] !border-[#ff6688_#aa2244_#aa2244_#ff6688]'
                    : '!bg-[#44ff88] !border-[#66ffaa_#22aa44_#22aa44_#66ffaa] text-black'
                }`}
              >
                {isMuted ? '🔇' : '🎤'}
              </button>

              <button
                onClick={toggleDeafen}
                className={`pixel-btn text-[10px] !px-2 !py-1 smooth-transition ${
                  isDeafened
                    ? '!bg-[#ff4466] !border-[#ff6688_#aa2244_#aa2244_#ff6688]'
                    : '!bg-[#1a1a2e] !border-[#3a3a5e_#1a1a2e_#1a1a2e_#3a3a5e]'
                }`}
              >
                {isDeafened ? '🔇' : '🔊'}
              </button>

              <button
                onClick={handleLeaveCall}
                className="pixel-btn text-[10px] !px-2 !py-1 smooth-transition !bg-[#ff4466] !border-[#ff6688_#aa2244_#aa2244_#ff6688]"
              >
                📴
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
