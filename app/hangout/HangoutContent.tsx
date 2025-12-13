'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount } from 'wagmi';
import AccessGate from '@/components/AccessGate';
import { useStarPoints, OnlineUser, formatStarAmount } from '@/lib/hooks/useStarPoints';
import { truncateAddress } from '@/lib/governance';

// Chat message interface
interface ChatMessage {
  id: string;
  sender: string;
  senderAddress: string;
  message: string;
  timestamp: number;
  type: 'chat' | 'system' | 'emote';
}

// Extended online user with chat bubble
interface OnlineUserWithBubble extends OnlineUser {
  lastMessage?: string;
  lastMessageAt?: number;
}

// Storage keys
const CHAT_STORAGE_KEY = 'swo_hangout_chat';
const CHAT_BUBBLES_KEY = 'swo_chat_bubbles';
const MAX_MESSAGES = 100;
const BUBBLE_DURATION = 8000; // Chat bubble visible for 8 seconds

/**
 * Get chat messages from storage
 */
function getChatMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Get chat bubbles (recent messages per user)
 */
function getChatBubbles(): Record<string, { message: string; timestamp: number }> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(CHAT_BUBBLES_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * Save chat bubble for a user
 */
function saveChatBubble(address: string, message: string): void {
  if (typeof window === 'undefined') return;
  try {
    const bubbles = getChatBubbles();
    bubbles[address.toLowerCase()] = {
      message: message.slice(0, 50), // Limit bubble message length
      timestamp: Date.now(),
    };
    localStorage.setItem(CHAT_BUBBLES_KEY, JSON.stringify(bubbles));
  } catch (error) {
    console.error('Failed to save chat bubble:', error);
  }
}

/**
 * Save chat message
 */
function saveChatMessage(message: ChatMessage): void {
  if (typeof window === 'undefined') return;
  try {
    const messages = getChatMessages();
    messages.push(message);
    // Keep only last MAX_MESSAGES
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
    
    // Also update chat bubble for this user
    if (message.type === 'chat') {
      saveChatBubble(message.senderAddress, message.message);
    }
  } catch (error) {
    console.error('Failed to save chat message:', error);
  }
}

/**
 * Chat Bubble Component - Shows above avatars in the lobby
 */
function ChatBubble({ message, isVisible }: { message: string; isVisible: boolean }) {
  if (!isVisible || !message) return null;
  
  return (
    <div className="absolute -top-14 left-1/2 -translate-x-1/2 z-20 animate-slide-in-up">
      {/* Bubble */}
      <div className="relative bg-[#1a1a3a] border-2 border-[#ffd700] rounded-lg px-2 py-1 max-w-[140px]">
        <p className="text-[8px] text-gray-200 break-words text-center whitespace-pre-wrap leading-tight">
          {message}
        </p>
        {/* Bubble tail */}
        <div className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-[#ffd700]" />
        <div className="absolute -bottom-[4px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-[#1a1a3a]" />
      </div>
    </div>
  );
}

/**
 * Pixel Art Sprite Component for Skrumpey
 */
function SkrumpeySprite({ 
  tokenId, 
  variant, 
  size = 'md',
  isOnline = true,
  status = 'online'
}: { 
  tokenId?: number; 
  variant?: string; 
  size?: 'sm' | 'md' | 'lg';
  isOnline?: boolean;
  status?: 'online' | 'away' | 'busy';
}) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };
  
  const variantColors: Record<string, string> = {
    aether: '#00ffff',
    spectra: '#ff00ff',
    solveil: '#ffd700',
    nebulu: '#9966ff',
    chroma: '#ff4466',
    rose: '#ff9999',
    monflare: '#ff8800',
    auracore: '#44ff88',
    parallel: '#6666ff',
    prime: '#ffffff',
  };
  
  const color = variant ? variantColors[variant] || '#ffd700' : '#ffd700';
  const statusColor = status === 'online' ? '#44ff88' : status === 'away' ? '#ffd700' : '#ff4466';
  
  return (
    <div className={`relative ${sizeClasses[size]} flex items-center justify-center`}>
      {/* Pixel art frog with star */}
      <div 
        className="relative animate-pixel-float"
        style={{ 
          filter: `drop-shadow(0 0 4px ${color})`,
          opacity: isOnline ? 1 : 0.5 
        }}
      >
        <span className="text-2xl" style={{ fontSize: size === 'sm' ? '1rem' : size === 'md' ? '1.5rem' : '2rem' }}>
          🐸
        </span>
        <span 
          className="absolute -top-1 -right-1 text-xs animate-pixel-pulse"
          style={{ fontSize: size === 'sm' ? '0.5rem' : '0.65rem', color }}
        >
          ⭐
        </span>
      </div>
      
      {/* Online status indicator */}
      {isOnline && (
        <div 
          className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#0d0d1a]"
          style={{ backgroundColor: statusColor }}
        />
      )}
    </div>
  );
}

/**
 * Online Member Card
 */
function MemberCard({ user }: { user: OnlineUser }) {
  const statusText = {
    online: 'Online',
    away: 'Away',
    busy: 'Busy',
  };
  
  return (
    <div className="pixel-card p-3 flex items-center gap-3 smooth-transition hover-lift cursor-pointer">
      <SkrumpeySprite 
        tokenId={user.nftTokenId} 
        variant={user.starVariant} 
        status={user.status}
        size="md"
      />
      <div className="flex-1 min-w-0">
        <p className="text-gray-200 text-[11px] font-bold truncate">
          {user.displayName || truncateAddress(user.address)}
        </p>
        <p className="text-gray-500 text-[9px]">
          {user.starVariant ? `${user.starVariant} ⭐` : 'Star Bearer'}
        </p>
      </div>
      <div className={`text-[8px] px-2 py-1 rounded ${
        user.status === 'online' ? 'bg-[#44ff88]/20 text-[#44ff88]' :
        user.status === 'away' ? 'bg-[#ffd700]/20 text-[#ffd700]' :
        'bg-[#ff4466]/20 text-[#ff4466]'
      }`}>
        {statusText[user.status]}
      </div>
    </div>
  );
}

/**
 * Chat Message Component
 */
function ChatMessageItem({ message }: { message: ChatMessage }) {
  const isSystem = message.type === 'system';
  const isEmote = message.type === 'emote';
  
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  if (isSystem) {
    return (
      <div className="text-center py-1">
        <span className="text-[#9966ff] text-[9px] italic">{message.message}</span>
      </div>
    );
  }
  
  if (isEmote) {
    return (
      <div className="py-1">
        <span className="text-[#ffd700] text-[10px]">
          * {message.sender} {message.message}
        </span>
      </div>
    );
  }
  
  return (
    <div className="py-1 group hover:bg-[#1a1a2e]/30 px-2 rounded smooth-transition">
      <div className="flex items-baseline gap-2">
        <span className="text-gray-500 text-[8px]">{formatTime(message.timestamp)}</span>
        <span className="text-[#9966ff] text-[10px] font-bold">{message.sender}:</span>
        <span className="text-gray-300 text-[10px] break-words">{message.message}</span>
      </div>
    </div>
  );
}

/**
 * Main Lobby Component
 */
function Lobby({
  onlineUsers,
  address,
  chatBubbles,
}: {
  onlineUsers: OnlineUser[];
  address: string | undefined;
  chatBubbles: Record<string, { message: string; timestamp: number }>;
}) {
  const now = Date.now();
  
  // Enhance users with chat bubble data
  const usersWithBubbles: OnlineUserWithBubble[] = onlineUsers.map(user => {
    const bubble = chatBubbles[user.address.toLowerCase()];
    const isRecent = bubble && (now - bubble.timestamp < BUBBLE_DURATION);
    return {
      ...user,
      lastMessage: isRecent ? bubble.message : undefined,
      lastMessageAt: isRecent ? bubble.timestamp : undefined,
    };
  });
  
  // Sort users - current user first, then by last seen
  const sortedUsers = [...usersWithBubbles].sort((a, b) => {
    if (address && a.address.toLowerCase() === address.toLowerCase()) return -1;
    if (address && b.address.toLowerCase() === address.toLowerCase()) return 1;
    return b.lastSeen - a.lastSeen;
  });
  
  return (
    <div className="pixel-card p-4 h-full animate-slide-in-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[#ffd700] text-[12px] tracking-wider animate-glow-pulse">
          🎮 GAME LOBBY
        </h3>
        <span className="text-[#44ff88] text-[10px]">
          {onlineUsers.length} Online
        </span>
      </div>
      
      {/* Visual Lobby Area */}
      <div className="bg-[#0a0a15] rounded-lg p-4 mb-4 min-h-[250px] relative border-2 border-[#2a2a4e] overflow-hidden">
        {/* Retro grid floor */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'linear-gradient(#9966ff 1px, transparent 1px), linear-gradient(90deg, #9966ff 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        
        {/* Arcade machines decoration */}
        <div className="absolute top-2 left-2 text-xl opacity-30">🕹️</div>
        <div className="absolute top-2 right-2 text-xl opacity-30">🎰</div>
        <div className="absolute bottom-2 left-2 text-xl opacity-30">📺</div>
        <div className="absolute bottom-2 right-2 text-xl opacity-30">🎮</div>
        
        {/* Neon lights decoration */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#9966ff]/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#ffd700]/50 to-transparent" />
        
        {/* Users in lobby with chat bubbles */}
        <div className="relative z-10 flex flex-wrap justify-center gap-6 py-8 pt-12">
          {sortedUsers.length === 0 ? (
            <div className="text-gray-500 text-[8px] text-center py-8">
              <span className="text-4xl block mb-2 animate-pixel-float">🌟</span>
              No one else in the lobby yet...
              <br />
              Be the first to hang out!
            </div>
          ) : (
            sortedUsers.map((user, index) => (
              <div 
                key={user.address}
                className="relative flex flex-col items-center gap-1 animate-slide-in-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {/* Chat Bubble */}
                <ChatBubble 
                  message={user.lastMessage || ''} 
                  isVisible={!!user.lastMessage}
                />
                
                <SkrumpeySprite 
                  tokenId={user.nftTokenId}
                  variant={user.starVariant}
                  status={user.status}
                  size="lg"
                />
                <span className="text-[6px] text-gray-400 truncate max-w-[60px]">
                  {truncateAddress(user.address)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      
      {/* Online Members List */}
      <h4 className="text-[#9966ff] text-[10px] mb-2">MEMBERS ONLINE</h4>
      <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-pixel">
        {sortedUsers.length === 0 ? (
          <p className="text-gray-500 text-[7px] text-center py-4">No members online</p>
        ) : (
          sortedUsers.map((user) => (
            <MemberCard key={user.address} user={user} />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Chat Component
 */
function Chat({
  address,
}: {
  address: string | undefined;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Load messages
  useEffect(() => {
    const loadMessages = () => {
      setMessages(getChatMessages());
    };
    
    loadMessages();
    // Poll for new messages every 5 seconds (reduced frequency for efficiency)
    // Note: Consider WebSocket for real-time chat in production
    const interval = setInterval(loadMessages, 5000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Send message
  const sendMessage = useCallback(() => {
    if (!address || !inputValue.trim()) return;
    
    const isEmote = inputValue.startsWith('/me ');
    const messageText = isEmote ? inputValue.slice(4) : inputValue;
    
    // Use crypto.randomUUID if available for robust ID generation
    const messageId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? `msg-${crypto.randomUUID()}`
      : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    
    const newMessage: ChatMessage = {
      id: messageId,
      sender: truncateAddress(address),
      senderAddress: address,
      message: messageText.trim(),
      timestamp: Date.now(),
      type: isEmote ? 'emote' : 'chat',
    };
    
    saveChatMessage(newMessage);
    setMessages(prev => [...prev, newMessage]);
    setInputValue('');
  }, [address, inputValue]);
  
  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  
  // Emote buttons
  const emotes = ['👋', '🌟', '🔥', '💜', '🐸', '⭐', '🎮', '✨'];
  
  return (
    <div className="pixel-card p-4 h-full flex flex-col animate-slide-in-up animate-delay-1">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[#ffd700] text-[12px] tracking-wider animate-glow-pulse">
          💬 STAR CHAT
        </h3>
        <span className="text-gray-500 text-[8px]">
          {messages.length} messages
        </span>
      </div>
      
      {/* Messages Area */}
      <div className="flex-1 bg-[#0a0a15] rounded-lg p-2 mb-4 overflow-y-auto min-h-[300px] max-h-[400px] border-2 border-[#2a2a4e] scrollbar-pixel">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <span className="text-4xl block mb-2 animate-pixel-float">💬</span>
            <p className="text-gray-500 text-[10px]">No messages yet</p>
            <p className="text-gray-600 text-[8px]">Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessageItem key={msg.id} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Emote Bar */}
      <div className="flex gap-1 mb-2">
        {emotes.map((emote) => (
          <button
            key={emote}
            onClick={() => setInputValue(prev => prev + emote)}
            className="w-6 h-6 flex items-center justify-center bg-[#1a1a2e] rounded hover:bg-[#2a2a4e] smooth-transition text-sm"
          >
            {emote}
          </button>
        ))}
      </div>
      
      {/* Input Area */}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={address ? "Type a message... (use /me for emotes)" : "Connect wallet to chat"}
          disabled={!address}
          className="flex-1 bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-3 py-2 text-white text-[11px] focus:border-[#ffd700] focus:outline-none smooth-transition disabled:opacity-50"
        />
        <button
          onClick={sendMessage}
          disabled={!address || !inputValue.trim()}
          className="pixel-btn pixel-btn-gold text-[10px] !px-4 smooth-transition hover-lift disabled:opacity-50"
        >
          SEND
        </button>
      </div>
      
      {/* Chat Help */}
      <div className="mt-2 text-gray-600 text-[8px]">
        <span className="text-[#9966ff]">/me</span> - emote action • 
        <span className="text-[#9966ff]"> Enter</span> - send message
      </div>
    </div>
  );
}

/**
 * Voice Chat Component
 * UI ready for WebRTC integration
 */
function VoiceChat({ 
  address,
  onlineUsers,
}: { 
  address: string | undefined;
  onlineUsers: OnlineUser[];
}) {
  const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [participants, setParticipants] = useState<Array<{ address: string; isMuted: boolean; isSpeaking: boolean }>>([]);
  
  // Simulate joining/leaving voice chat
  const handleJoinCall = useCallback(() => {
    if (!address) return;
    setIsInCall(true);
    setIsMuted(true);
    // Add current user as participant
    setParticipants([{ address, isMuted: true, isSpeaking: false }]);
  }, [address]);
  
  const handleLeaveCall = useCallback(() => {
    setIsInCall(false);
    setParticipants([]);
    setIsMuted(true);
    setIsDeafened(false);
  }, []);
  
  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
    // Update participant status
    setParticipants(prev => prev.map(p => 
      p.address === address ? { ...p, isMuted: !isMuted } : p
    ));
  }, [address, isMuted]);
  
  const toggleDeafen = useCallback(() => {
    setIsDeafened(prev => !prev);
    if (!isDeafened) {
      setIsMuted(true);
    }
  }, [isDeafened]);
  
  return (
    <div className="pixel-card p-4 animate-slide-in-up animate-delay-2 relative z-50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[#ffd700] text-[12px] tracking-wider animate-glow-pulse">
          🎤 VOICE CHAT
        </h3>
        <span className={`text-[8px] px-2 py-1 rounded ${
          isInCall 
            ? 'text-[#44ff88] bg-[#44ff88]/10' 
            : 'text-[#9966ff] bg-[#9966ff]/10'
        }`}>
          {isInCall ? `${participants.length} IN CALL` : 'LOBBY CHAT'}
        </span>
      </div>
      
      <div className="bg-[#0a0a15] rounded-lg p-4 border-2 border-[#2a2a4e]">
        {!isInCall ? (
          // Not in call - show join button
          <div className="text-center">
            <div className="text-4xl mb-3 animate-pixel-pulse">🎙️</div>
            <p className="text-gray-400 text-[8px] mb-4">
              Join the voice channel to talk with
              <br />
              fellow Star bearers in real-time.
            </p>
            
            <button
              onClick={handleJoinCall}
              disabled={!address}
              className="pixel-btn pixel-btn-gold text-[8px] !px-6 smooth-transition hover-lift disabled:opacity-50"
            >
              🔊 JOIN VOICE
            </button>
            
            {!address && (
              <p className="text-gray-600 text-[6px] mt-2">
                Connect wallet to use voice chat
              </p>
            )}
          </div>
        ) : (
          // In call - show controls and participants
          <div>
            {/* Participants */}
            <div className="mb-4">
              <p className="text-[#9966ff] text-[7px] mb-2">IN CHANNEL</p>
              <div className="flex flex-wrap gap-2">
                {participants.map((p) => (
                  <div 
                    key={p.address}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-[6px] ${
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
                
                {/* 
                 * Demo: Show other online users as potential voice participants
                 * In production, replace with actual voice session participants from /api/voice
                 * These are shown with opacity-50 to indicate they haven't actually joined voice
                 */}
                {onlineUsers.slice(0, 2).filter(u => u.address.toLowerCase() !== address?.toLowerCase()).map((user) => (
                  <div 
                    key={user.address}
                    className="flex items-center gap-1 px-2 py-1 rounded-full text-[6px] bg-[#1a1a2e] border border-[#2a2a4e] opacity-50"
                    title="Available to join voice"
                  >
                    <span>🔇</span>
                    <span className="text-gray-400">
                      {truncateAddress(user.address)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Voice level indicator (visual only - replace with actual audio level in production) */}
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <span className="text-[6px] text-gray-500">LEVEL:</span>
                <div className="flex-1 h-2 bg-[#1a1a2e] rounded overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-75 ${
                      isMuted ? 'w-0' : 'w-1/4'
                    } bg-gradient-to-r from-[#44ff88] via-[#ffd700] to-[#ff4466]`}
                  />
                </div>
              </div>
            </div>
            
            {/* Controls */}
            <div className="flex justify-center gap-3">
              <button
                onClick={toggleMute}
                className={`pixel-btn text-[7px] !px-3 !py-2 smooth-transition ${
                  isMuted 
                    ? '!bg-[#ff4466] !border-[#ff6688_#aa2244_#aa2244_#ff6688]' 
                    : '!bg-[#44ff88] !border-[#66ffaa_#22aa44_#22aa44_#66ffaa] text-black'
                }`}
              >
                {isMuted ? '🔇 UNMUTE' : '🎤 MUTE'}
              </button>
              
              <button
                onClick={toggleDeafen}
                className={`pixel-btn text-[7px] !px-3 !py-2 smooth-transition ${
                  isDeafened 
                    ? '!bg-[#ff4466] !border-[#ff6688_#aa2244_#aa2244_#ff6688]' 
                    : '!bg-[#1a1a2e] !border-[#3a3a5e_#1a1a2e_#1a1a2e_#3a3a5e]'
                }`}
              >
                {isDeafened ? '🔇 DEAFENED' : '🔊 DEAFEN'}
              </button>
              
              <button
                onClick={handleLeaveCall}
                className="pixel-btn text-[7px] !px-3 !py-2 smooth-transition !bg-[#ff4466] !border-[#ff6688_#aa2244_#aa2244_#ff6688]"
              >
                📴 LEAVE
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Voice chat info */}
      <div className="mt-3 text-center">
        <p className="text-gray-600 text-[6px]">
          💡 Voice uses WebRTC for peer-to-peer audio
        </p>
      </div>
    </div>
  );
}

/**
 * Main Hangout Content
 */
export default function HangoutContent() {
  const { address } = useAccount();
  const { onlineUsers, updatePresence, votingPower, totalStars } = useStarPoints();
  const [activeStatus, setActiveStatus] = useState<'online' | 'away' | 'busy'>('online');
  const [chatBubbles, setChatBubbles] = useState<Record<string, { message: string; timestamp: number }>>({});
  
  // Load and refresh chat bubbles
  useEffect(() => {
    const loadBubbles = () => {
      setChatBubbles(getChatBubbles());
    };
    
    loadBubbles();
    // Refresh bubbles every second to handle expiration
    const interval = setInterval(loadBubbles, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Update status
  const handleStatusChange = (status: 'online' | 'away' | 'busy') => {
    setActiveStatus(status);
    updatePresence(status);
  };
  
  return (
    <>
      {/* Page Header */}
      <div className="text-center mb-8 animate-slide-in-up">
        <h1 className="text-lg md:text-xl text-[#ffd700] pixel-glow-gold tracking-wider mb-2">
          HANGOUT HUB
        </h1>
        <p className="text-[#9966ff] text-sm tracking-wide animate-glow-pulse">
          Meet fellow Star bearers
        </p>
      </div>

      {/* Access-gated content */}
      <AccessGate
        title="HANGOUT ACCESS LOCKED"
        message="Only Star Skrumpey holders may enter the Hangout Hub."
      >
        {/* Status Bar */}
        <div className="pixel-card p-3 mb-6 flex flex-wrap items-center justify-between gap-4 animate-slide-in-up">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[8px] text-gray-500">STATUS:</span>
              <div className="flex gap-1">
                {(['online', 'away', 'busy'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    className={`text-[7px] px-2 py-1 rounded smooth-transition ${
                      activeStatus === status
                        ? status === 'online' ? 'bg-[#44ff88] text-black' :
                          status === 'away' ? 'bg-[#ffd700] text-black' :
                          'bg-[#ff4466] text-white'
                        : 'bg-[#1a1a2e] text-gray-400 hover:bg-[#2a2a4e]'
                    }`}
                  >
                    {status.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4 text-[8px]">
            <div>
              <span className="text-gray-500">STAR Balance:</span>
              <span className="text-[#ffd700] ml-1">{formatStarAmount(totalStars)} ⭐</span>
            </div>
            {votingPower && (
              <div>
                <span className="text-gray-500">Voting Power:</span>
                <span className="text-[#9966ff] ml-1">{votingPower.weightedVotingPower.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Lobby */}
          <div className="lg:row-span-2">
            <Lobby onlineUsers={onlineUsers} address={address} chatBubbles={chatBubbles} />
          </div>
          
          {/* Right Column - Chat & Voice */}
          <div className="space-y-6">
            <Chat address={address} />
            <VoiceChat address={address} onlineUsers={onlineUsers} />
          </div>
        </div>

        {/* Info Section */}
        <div className="pixel-card p-4 mt-6 bg-[#0a0a15] animate-slide-in-up animate-delay-3">
          <p className="text-[#9966ff] text-sm tracking-wide mb-2">HANGOUT RULES</p>
          <ul className="text-gray-400 text-sm space-y-1">
            <li>• Be respectful to fellow Star bearers</li>
            <li>• Keep conversations appropriate and on-topic</li>
            <li>• No spam or excessive emote usage</li>
            <li>• Have fun and make new friends!</li>
          </ul>
        </div>
      </AccessGate>
    </>
  );
}
