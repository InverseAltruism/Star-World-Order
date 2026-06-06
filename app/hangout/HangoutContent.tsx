'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount } from 'wagmi';
import Image from 'next/image';
import SkrumpeyAccessGate from '@/components/SkrumpeyAccessGate';
import VoiceChatPanel from './VoiceChatPanel';
import { useStarPoints, OnlineUser, formatStarAmount } from '@/lib/hooks/useStarPoints';
import { truncateAddress } from '@/lib/governance';
import { checkStarOwnershipBatched } from '@/lib/starSkrumpey';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';

// Chat message interface
interface ChatMessage {
  id: string;
  sender: string;
  senderAddress: string;
  message: string;
  timestamp: number;
  type: 'chat' | 'system' | 'emote';
  isStarHolder?: boolean;
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
  isStarHolder?: boolean;
}


async function getAuthenticatedJsonHeaders(address?: string): Promise<Record<string, string> | null> {
  if (!address) {
    return null;
  }
  // Include the signed wallet-auth header so the chat/presence/voice routes can
  // verify the caller actually controls this address (getWalletAuthHeader caches
  // the signature for ~5 min, so it doesn't re-prompt on every action).
  const walletAuthHeader = await getWalletAuthHeader(address);
  if (!walletAuthHeader) {
    return null;
  }
  return {
    'Content-Type': 'application/json',
    'x-wallet-auth': walletAuthHeader,
  };
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
 * Shows date + time for messages, and Star badge for Star Skrumpey holders
 * 
 * Layout: [TIMESTAMP] [STAR?] [USERNAME]: [MESSAGE]
 * - Timestamp: fixed width, monospace, right-aligned
 * - Star badge: fixed width slot for consistency
 * - Username: bold, color-coded
 * - Message: wraps naturally
 */
function ChatMessageItem({ message, isStarHolder }: { message: ChatMessage; isStarHolder?: boolean }) {
  const isSystem = message.type === 'system';
  const isEmote = message.type === 'emote';
  
  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    // Compact time format: "2:14 PM" instead of "02:14 PM"
    const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    
    if (isToday) {
      return time; // Just time for today
    } else if (isYesterday) {
      return `Yest ${time}`; // Short "Yest" instead of "Yesterday"
    } else {
      // Compact date: "Jan 7" without time for older messages, or "1/7 2:14 PM"
      const shortDate = `${date.getMonth() + 1}/${date.getDate()}`;
      return `${shortDate} ${time}`;
    }
  };
  
  if (isSystem) {
    return (
      <div className="text-center py-1.5">
        <span className="text-[#9966ff] text-xs italic">{message.message}</span>
      </div>
    );
  }
  
  // Star holder badge component - consistent size slot
  const StarBadge = () => (
    <span className="inline-flex items-center justify-center w-5 shrink-0">
      {isStarHolder ? (
        <Image 
          src="/skr_str_mon2.png" 
          alt="★" 
          width={14}
          height={14}
          className="animate-pixel-float" 
          style={{ filter: 'drop-shadow(0 0 4px rgba(255, 215, 0, 0.5))' }}
          title="Star Skrumpey Holder"
        />
      ) : (
        <span className="text-gray-600 text-xs">•</span>
      )}
    </span>
  );
  
  if (isEmote) {
    return (
      <div className="py-1.5 group hover:bg-[#1a1a2e]/30 px-2 -mx-2 rounded smooth-transition">
        <div className="flex items-baseline gap-0">
          {/* Timestamp - compact fixed width */}
          <span 
            className="text-gray-600 text-[10px] shrink-0 font-mono text-right mr-1"
            style={{ width: '75px', minWidth: '75px' }}
          >
            {formatDateTime(message.timestamp)}
          </span>
          
          {/* Star badge slot */}
          <StarBadge />
          
          {/* Emote content */}
          <span className="text-[#ffd700] text-sm italic">
            {message.sender} {message.message}
          </span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="py-1.5 group hover:bg-[#1a1a2e]/30 px-2 -mx-2 rounded smooth-transition">
      <div className="flex items-baseline gap-0">
        {/* Timestamp - compact fixed width, monospace for alignment */}
        <span 
          className="text-gray-600 text-[10px] shrink-0 font-mono text-right mr-1"
          style={{ width: '75px', minWidth: '75px' }}
        >
          {formatDateTime(message.timestamp)}
        </span>
        
        {/* Star badge slot - always takes same space */}
        <StarBadge />
        
        {/* Username and message */}
        <span className="flex-1 min-w-0">
          <span className="text-[#ffd700] text-sm font-semibold">{message.sender}</span>
          <span className="text-gray-500 text-sm">: </span>
          <span className="text-gray-200 text-sm break-words">{message.message}</span>
        </span>
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
      <VoiceChatPanel variant="inline" address={address} onlineUsers={onlineUsers} />
      
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
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true); // Track if we should auto-scroll
  const userSentMessageRef = useRef(false); // Track if user just sent a message
  
  // Load user display name once when address changes
  useEffect(() => {
    if (!address) {
      setDisplayName(undefined);
      return;
    }
    
    let cancelled = false;
    const fetchDisplayName = async () => {
      try {
        const response = await fetch(`/api/profile?address=${address}`);
        const data = await response.json();
        if (!cancelled && data.success && data.profile?.display_name) {
          setDisplayName(data.profile.display_name);
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      }
    };

    fetchDisplayName();
    return () => {
      cancelled = true;
    };
  }, [address]);
  
  // Scroll threshold for auto-scroll behavior (in pixels)
  const SCROLL_THRESHOLD = 100;
  
  // Check if user is near bottom of scroll
  const isNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight < SCROLL_THRESHOLD;
  }, []);
  
  // Handle scroll to update shouldAutoScroll
  const handleScroll = useCallback(() => {
    shouldAutoScrollRef.current = isNearBottom();
  }, [isNearBottom]);
  
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
          isStarHolder: dbMsg.isStarHolder || false,
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
  
  // Scroll the CHAT CONTAINER (not the page) to its bottom — only when the user
  // just sent a message or is already near the bottom. Using scrollIntoView here
  // scrolled the whole window down on every 5s poll; scrolling the container's
  // own scrollTop keeps the page where the user left it.
  useEffect(() => {
    if (userSentMessageRef.current || shouldAutoScrollRef.current) {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
      userSentMessageRef.current = false;
    }
  }, [messages]);
  
  // Send message to server API
  const sendMessage = useCallback(async () => {
    if (!address || !inputValue.trim()) return;
    
    const isEmote = inputValue.startsWith('/me ');
    const messageText = isEmote ? inputValue.slice(4) : inputValue;
    
    // Mark that user sent a message - should scroll to show their message
    userSentMessageRef.current = true;
    
    try {
      const headers = await getAuthenticatedJsonHeaders(address);
      if (!headers) {
        return;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          senderAddress: address,
          message: messageText.trim(),
          messageType: isEmote ? 'emote' : 'chat',
        }),
      });
      
      const data = await response.json();
      if (data.success && data.message) {
        // Add the new message immediately with proper timestamp from server
        // The server returns the full message object with created_at
        const serverTimestamp = data.message.created_at 
          ? new Date(data.message.created_at).getTime()
          : Date.now(); // Fallback to current time if not provided
        
        const newMessage: ChatMessage = {
          id: `msg-${data.message.id}`,
          sender: data.message.sender_display_name || truncateAddress(address),
          senderAddress: address,
          message: data.message.message,
          timestamp: serverTimestamp,
          type: data.message.message_type,
          isStarHolder: false, // Will be updated when loadMessages runs
        };
        
        // Also update presence with last message for chat bubble
        const presenceHeaders = await getAuthenticatedJsonHeaders(address);
        if (!presenceHeaders) {
          return;
        }

        await fetch('/api/presence', {
          method: 'POST',
          headers: presenceHeaders,
          body: JSON.stringify({
            walletAddress: address,
            lastMessage: messageText.trim().slice(0, MAX_LAST_MESSAGE_LENGTH),
          }),
        });
        
        setInputValue('');
        
        // Add the new message immediately (optimistic update with proper timestamp)
        setMessages(prev => {
          // Check if message already exists (avoid duplicates)
          const exists = prev.some(msg => msg.id === newMessage.id);
          if (exists) return prev;
          return [...prev, newMessage];
        });
        
        // Refresh messages after a short delay to get Star holder status and ensure consistency
        // This allows the optimistic update to show immediately with the correct timestamp
        setTimeout(() => {
          loadMessages();
        }, 500);
        
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
      
      // Check if current user is a Star holder for local fallback
      let isStarHolder = false;
      try {
        const starTokens = await checkStarOwnershipBatched(address);
        isStarHolder = starTokens.length > 0;
      } catch {
        // Ignore errors in fallback
      }
      
      const newMessage: ChatMessage = {
        id: messageId,
        sender: displayName || truncateAddress(address),
        senderAddress: address,
        message: messageText.trim(),
        timestamp: Date.now(),
        type: isEmote ? 'emote' : 'chat',
        isStarHolder,
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
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 bg-[#0a0a15] rounded-lg p-3 mb-4 overflow-y-auto min-h-[300px] max-h-[400px] border-2 border-[#2a2a4e] scrollbar-pixel"
      >
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <span className="text-4xl block mb-2 animate-pixel-float">💬</span>
            <p className="text-gray-500 text-sm">No messages yet</p>
            <p className="text-gray-600 text-xs">Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessageItem key={msg.id} message={msg} isStarHolder={msg.isStarHolder} />
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
      <div className="text-center mb-8 animate-slide-in-up px-4">
        <h1 className="text-base sm:text-lg md:text-xl text-[#ffd700] pixel-glow-gold tracking-wider mb-2 whitespace-nowrap">
          HANGOUT HUB
        </h1>
        <p className="text-xs sm:text-sm text-[#9966ff] tracking-wide animate-glow-pulse">
          Meet fellow Star bearers
        </p>
      </div>

      {/* Access-gated content */}
      <SkrumpeyAccessGate
        title="HANGOUT ACCESS LOCKED"
        message="Only Skrumpey holders may enter the Hangout Hub."
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
      </SkrumpeyAccessGate>
    </>
  );
}
