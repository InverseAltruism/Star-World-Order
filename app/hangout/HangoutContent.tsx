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
const BUBBLE_DURATION = 15000; // Chat bubble visible for 15 seconds
const MAX_LAST_MESSAGE_LENGTH = 50; // Maximum length for last message in chat bubble

// API response types
interface ApiPresenceUser {
  wallet_address: string;
  display_name: string | null;
  nft_token_id: number | null;
  star_variant: string | null;
  status: 'online' | 'away' | 'busy';
  last_message: string | null;
  last_message_at: string | null;
  last_seen: string;
}

interface ApiChatMessage {
  id: number;
  sender_address: string;
  sender_display_name: string | null;
  message: string;
  message_type: 'chat' | 'system' | 'emote';
  created_at: string;
}

interface ApiVoiceParticipant {
  id: number;
  session_id: string;
  wallet_address: string;
  is_muted: number;
  joined_at: string;
  left_at: string | null;
}

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
 * Lobby Avatar Component with fallback for large avatars
 */
function LobbyAvatar({ user }: { user: OnlineUser }) {
  const [imageError, setImageError] = useState(false);
  const profilePicUrl = user.nftTokenId 
    ? `https://ipfs-proxy.magiceden.dev/ipfs/bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu/${user.nftTokenId}.png`
    : null;
  
  if (!profilePicUrl || imageError) {
    return (
      <SkrumpeySprite 
        tokenId={user.nftTokenId}
        variant={user.starVariant}
        status={user.status}
        size="lg"
      />
    );
  }
  
  return (
    <div className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-[#ffd700] animate-pixel-float">
      <img
        src={profilePicUrl}
        alt={`Skrumpey #${user.nftTokenId}`}
        className="w-full h-full object-cover"
        onError={() => setImageError(true)}
      />
    </div>
  );
}

/**
 * Member Avatar Component with fallback
 */
function MemberAvatar({ user }: { user: OnlineUser }) {
  const [imageError, setImageError] = useState(false);
  const profilePicUrl = user.nftTokenId 
    ? `https://ipfs-proxy.magiceden.dev/ipfs/bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu/${user.nftTokenId}.png`
    : null;
  
  if (!profilePicUrl || imageError) {
    return (
      <SkrumpeySprite 
        tokenId={user.nftTokenId} 
        variant={user.starVariant} 
        status={user.status}
        size="md"
      />
    );
  }
  
  return (
    <div className="relative w-12 h-12 rounded-lg overflow-hidden border-2 border-[#ffd700] flex-shrink-0">
      <img
        src={profilePicUrl}
        alt={`Skrumpey #${user.nftTokenId}`}
        className="w-full h-full object-cover"
        onError={() => setImageError(true)}
      />
    </div>
  );
}

/**
 * Online Member Card - with profile picture
 */
function MemberCard({ user }: { user: OnlineUser }) {
  const statusText = {
    online: 'Online',
    away: 'Away',
    busy: 'Busy',
  };
  
  return (
    <div className="pixel-card p-3 flex items-center gap-3 smooth-transition hover-lift cursor-pointer">
      <MemberAvatar user={user} />
      <div className="flex-1 min-w-0">
        <p className="text-gray-200 text-sm font-bold truncate">
          {user.displayName || truncateAddress(user.address)}
        </p>
        <p className="text-gray-500 text-xs">
          {user.starVariant ? `${user.starVariant}` : 'Star Bearer'}
        </p>
      </div>
      <div className={`text-xs px-2 py-1 rounded ${
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
 * Displays individual chat messages with sender name prominently shown
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
        <span className="text-[#9966ff] text-xs italic">{message.message}</span>
      </div>
    );
  }
  
  if (isEmote) {
    return (
      <div className="py-1">
        <span className="text-[#ffd700] text-sm">
          * {message.sender} {message.message}
        </span>
      </div>
    );
  }
  
  return (
    <div className="py-2 group hover:bg-[#1a1a2e]/30 px-2 rounded smooth-transition">
      <div className="flex items-start gap-2">
        <span className="text-gray-500 text-xs shrink-0 mt-0.5">{formatTime(message.timestamp)}</span>
        <div className="flex-1 min-w-0">
          <span className="text-[#ffd700] text-sm font-bold">{message.sender}</span>
          <span className="text-gray-400 text-sm">: </span>
          <span className="text-gray-200 text-sm break-words">{message.message}</span>
        </div>
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
  
  // Enhance users with chat bubble data from server (via onlineUsers)
  const usersWithBubbles: OnlineUserWithBubble[] = onlineUsers.map(user => {
    // Use server data first, fall back to localStorage
    const serverMessage = user.lastMessage;
    const serverMessageTime = user.lastMessageAt;
    const isServerRecent = serverMessage && serverMessageTime && (now - serverMessageTime < BUBBLE_DURATION);
    
    // Fallback to localStorage bubbles if server data not available/expired
    const localBubble = chatBubbles[user.address.toLowerCase()];
    const isLocalRecent = localBubble && (now - localBubble.timestamp < BUBBLE_DURATION);
    
    return {
      ...user,
      lastMessage: isServerRecent ? serverMessage : (isLocalRecent ? localBubble.message : undefined),
      lastMessageAt: isServerRecent ? serverMessageTime : (isLocalRecent ? localBubble.timestamp : undefined),
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
        <h3 className="text-[#ffd700] text-sm tracking-wider animate-glow-pulse">
          GAME LOBBY
        </h3>
        <span className="text-[#44ff88] text-sm">
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
            <div className="text-gray-500 text-sm text-center py-8">
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
                
                <LobbyAvatar user={user} />
                <span className="text-xs text-gray-400 truncate max-w-[80px]">
                  {user.displayName || truncateAddress(user.address)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      
      {/* Voice Chat Section - Inline */}
      <VoiceChatInline address={address} onlineUsers={onlineUsers} />
      
      {/* Online Members List */}
      <h4 className="text-[#9966ff] text-sm mb-2">MEMBERS ONLINE</h4>
      <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-pixel">
        {sortedUsers.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-4">No members online</p>
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
  refreshPresence,
}: {
  address: string | undefined;
  refreshPresence?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [displayName, setDisplayName] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Load user display name once when address changes
  useEffect(() => {
    if (!address) {
      setDisplayName(undefined);
      return;
    }
    
    const fetchDisplayName = async () => {
      try {
        const response = await fetch(`/api/profile?address=${address}`);
        const data = await response.json();
        if (data.success && data.profile?.display_name) {
          setDisplayName(data.profile.display_name);
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      }
    };
    
    fetchDisplayName();
  }, [address]);
  
  // Load messages from server API
  const loadMessages = useCallback(async () => {
    try {
      const response = await fetch('/api/chat?limit=100');
      const data = await response.json();
      if (data.success && data.messages) {
        // Transform server data to ChatMessage format
        const transformedMessages = data.messages.map((dbMsg: ApiChatMessage) => ({
          id: `msg-${dbMsg.id}`,
          sender: dbMsg.sender_display_name || truncateAddress(dbMsg.sender_address),
          senderAddress: dbMsg.sender_address,
          message: dbMsg.message,
          timestamp: new Date(dbMsg.created_at).getTime(),
          type: dbMsg.message_type,
        }));
        setMessages(transformedMessages);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      // Fallback to localStorage
      setMessages(getChatMessages());
    }
  }, []);
  
  // Load messages on mount and poll every 5 seconds
  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [loadMessages]);
  
  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Send message to server API
  const sendMessage = useCallback(async () => {
    if (!address || !inputValue.trim()) return;
    
    const isEmote = inputValue.startsWith('/me ');
    const messageText = isEmote ? inputValue.slice(4) : inputValue;
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderAddress: address,
          message: messageText.trim(),
          messageType: isEmote ? 'emote' : 'chat',
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        // Also update presence with last message for chat bubble
        await fetch('/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: address,
            lastMessage: messageText.trim().slice(0, MAX_LAST_MESSAGE_LENGTH),
          }),
        });
        
        setInputValue('');
        loadMessages(); // Refresh messages
        
        // Trigger immediate presence refresh for chat bubbles
        if (refreshPresence) {
          refreshPresence();
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // Fallback to localStorage
      const messageId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? `msg-${crypto.randomUUID()}`
        : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      
      const newMessage: ChatMessage = {
        id: messageId,
        sender: displayName || truncateAddress(address),
        senderAddress: address,
        message: messageText.trim(),
        timestamp: Date.now(),
        type: isEmote ? 'emote' : 'chat',
      };
      
      saveChatMessage(newMessage);
      setMessages(prev => [...prev, newMessage]);
      setInputValue('');
    }
  }, [address, inputValue, displayName, loadMessages, refreshPresence]);
  
  // Handle key press - use onKeyDown to prevent form submission issues
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      sendMessage();
    }
  };
  
  // Emote buttons
  const emotes = ['👋', '🌟', '🔥', '💜', '🐸', '⭐', '🎮', '✨'];
  
  return (
    <div className="pixel-card p-4 h-full flex flex-col animate-slide-in-up animate-delay-1">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[#ffd700] text-sm tracking-wider animate-glow-pulse">
          STAR CHAT
        </h3>
        <span className="text-gray-500 text-xs">
          {messages.length} messages
        </span>
      </div>
      
      {/* Messages Area */}
      <div className="flex-1 bg-[#0a0a15] rounded-lg p-3 mb-4 overflow-y-auto min-h-[300px] max-h-[400px] border-2 border-[#2a2a4e] scrollbar-pixel">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <span className="text-4xl block mb-2 animate-pixel-float">💬</span>
            <p className="text-gray-500 text-sm">No messages yet</p>
            <p className="text-gray-600 text-xs">Start the conversation!</p>
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
          onKeyDown={handleKeyDown}
          placeholder={address ? "Type a message... (use /me for emotes)" : "Connect wallet to chat"}
          disabled={!address}
          className="flex-1 bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-3 py-2 text-white text-sm focus:border-[#ffd700] focus:outline-none smooth-transition disabled:opacity-50"
        />
        <button
          onClick={sendMessage}
          disabled={!address || !inputValue.trim()}
          className="pixel-btn pixel-btn-gold text-xs !px-4 smooth-transition hover-lift disabled:opacity-50"
        >
          SEND
        </button>
      </div>
      
      {/* Chat Help */}
      <div className="mt-2 text-gray-600 text-xs">
        <span className="text-[#9966ff]">/me</span> - emote action • 
        <span className="text-[#9966ff]"> Enter</span> - send message
      </div>
    </div>
  );
}

/**
 * Voice Chat Component - Inline version for Lobby
 * UI ready for WebRTC integration
 */
function VoiceChatInline({ 
  address,
  onlineUsers,
}: { 
  address: string | undefined;
  onlineUsers: OnlineUser[];
}) {
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
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        await fetch('/api/voice', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
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
        await fetch('/api/voice', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
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
  
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[#9966ff] text-xs tracking-wider flex items-center gap-2">
          <span>🎙️</span> VOICE CHAT
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#9966ff]/20 text-[#9966ff] border border-[#9966ff]/40">
            AUDIO COMING SOON
          </span>
        </h4>
        <span className={`text-[10px] px-2 py-0.5 rounded ${
          isInCall 
            ? 'text-[#44ff88] bg-[#44ff88]/10' 
            : 'text-[#9966ff] bg-[#9966ff]/10'
        }`}>
          {isInCall ? `${participants.length} IN CALL` : 'AVAILABLE'}
        </span>
      </div>
      
      <div className="bg-[#0a0a15] rounded-lg p-3 border-2 border-[#2a2a4e]">
        {!isInCall ? (
          // Not in call - show compact join button
          <div className="flex items-center justify-between">
            <p className="text-gray-400 text-xs">
              Talk with Star bearers
            </p>
            
            <button
              onClick={handleJoinCall}
              disabled={!address}
              className="pixel-btn pixel-btn-gold text-[10px] !px-3 !py-1.5 smooth-transition hover-lift disabled:opacity-50"
            >
              JOIN
            </button>
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

/**
 * Voice Chat Component - Compact version (standalone card)
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
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        await fetch('/api/voice', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
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
        await fetch('/api/voice', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
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
  
  return (
    <div className="pixel-card p-3 animate-slide-in-up animate-delay-2 relative z-50">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[#ffd700] text-xs tracking-wider animate-glow-pulse flex items-center gap-2">
          <span>🎙️</span> VOICE
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#9966ff]/20 text-[#9966ff] border border-[#9966ff]/40">
            AUDIO COMING SOON
          </span>
        </h3>
        <span className={`text-[10px] px-2 py-0.5 rounded ${
          isInCall 
            ? 'text-[#44ff88] bg-[#44ff88]/10' 
            : 'text-[#9966ff] bg-[#9966ff]/10'
        }`}>
          {isInCall ? `${participants.length} IN CALL` : 'AVAILABLE'}
        </span>
      </div>
      
      <div className="bg-[#0a0a15] rounded-lg p-3 border-2 border-[#2a2a4e]">
        {!isInCall ? (
          // Not in call - show compact join button
          <div className="flex items-center justify-between">
            <p className="text-gray-400 text-xs">
              Talk with Star bearers
            </p>
            
            <button
              onClick={handleJoinCall}
              disabled={!address}
              className="pixel-btn pixel-btn-gold text-[10px] !px-3 !py-1.5 smooth-transition hover-lift disabled:opacity-50"
            >
              JOIN
            </button>
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

/**
 * Main Hangout Content
 */
export default function HangoutContent() {
  const { address } = useAccount();
  const { onlineUsers, updatePresence, votingPower, totalStars, refresh } = useStarPoints();
  const [activeStatus, setActiveStatus] = useState<'online' | 'away' | 'busy'>('online');
  const [chatBubbles, setChatBubbles] = useState<Record<string, { message: string; timestamp: number }>>({});
  
  // Load and refresh chat bubbles
  useEffect(() => {
    const loadBubbles = () => {
      setChatBubbles(getChatBubbles());
    };
    
    loadBubbles();
    // Refresh bubbles every 2 seconds to handle expiration
    const interval = setInterval(loadBubbles, 2000);
    
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
              <span className="text-xs text-gray-500">STATUS:</span>
              <div className="flex gap-1">
                {(['online', 'away', 'busy'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    className={`text-[10px] px-2 py-1 rounded smooth-transition ${
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
          
          <div className="flex items-center gap-4 text-xs">
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
          
          {/* Right Column - Chat only */}
          <div>
            <Chat address={address} refreshPresence={refresh} />
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
