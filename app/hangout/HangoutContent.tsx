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

// Storage key for chat
const CHAT_STORAGE_KEY = 'swo_hangout_chat';
const MAX_MESSAGES = 100;

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
 * Save chat message
 */
function saveChatMessage(message: ChatMessage): void {
  if (typeof window === 'undefined') return;
  try {
    const messages = getChatMessages();
    messages.push(message);
    // Keep only last MAX_MESSAGES
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
  } catch (error) {
    console.error('Failed to save chat message:', error);
  }
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
        <p className="text-gray-200 text-[9px] font-bold truncate">
          {user.displayName || truncateAddress(user.address)}
        </p>
        <p className="text-gray-500 text-[7px]">
          {user.starVariant ? `${user.starVariant} ⭐` : 'Star Bearer'}
        </p>
      </div>
      <div className={`text-[6px] px-2 py-1 rounded ${
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
        <span className="text-[#9966ff] text-[7px] italic">{message.message}</span>
      </div>
    );
  }
  
  if (isEmote) {
    return (
      <div className="py-1">
        <span className="text-[#ffd700] text-[8px]">
          * {message.sender} {message.message}
        </span>
      </div>
    );
  }
  
  return (
    <div className="py-1 group hover:bg-[#1a1a2e]/30 px-2 rounded smooth-transition">
      <div className="flex items-baseline gap-2">
        <span className="text-gray-500 text-[6px]">{formatTime(message.timestamp)}</span>
        <span className="text-[#9966ff] text-[8px] font-bold">{message.sender}:</span>
        <span className="text-gray-300 text-[8px] break-words">{message.message}</span>
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
}: {
  onlineUsers: OnlineUser[];
  address: string | undefined;
}) {
  // Sort users - current user first, then by last seen
  const sortedUsers = [...onlineUsers].sort((a, b) => {
    if (address && a.address.toLowerCase() === address.toLowerCase()) return -1;
    if (address && b.address.toLowerCase() === address.toLowerCase()) return 1;
    return b.lastSeen - a.lastSeen;
  });
  
  return (
    <div className="pixel-card p-4 h-full animate-slide-in-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[#ffd700] text-[10px] tracking-wider animate-glow-pulse">
          🎮 GAME LOBBY
        </h3>
        <span className="text-[#44ff88] text-[8px]">
          {onlineUsers.length} Online
        </span>
      </div>
      
      {/* Visual Lobby Area */}
      <div className="bg-[#0a0a15] rounded-lg p-4 mb-4 min-h-[200px] relative border-2 border-[#2a2a4e]">
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
        
        {/* Users in lobby */}
        <div className="relative z-10 flex flex-wrap justify-center gap-4 py-4">
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
                className="flex flex-col items-center gap-1 animate-slide-in-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
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
      <h4 className="text-[#9966ff] text-[8px] mb-2">MEMBERS ONLINE</h4>
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
        <h3 className="text-[#ffd700] text-[10px] tracking-wider animate-glow-pulse">
          💬 STAR CHAT
        </h3>
        <span className="text-gray-500 text-[6px]">
          {messages.length} messages
        </span>
      </div>
      
      {/* Messages Area */}
      <div className="flex-1 bg-[#0a0a15] rounded-lg p-2 mb-4 overflow-y-auto min-h-[300px] max-h-[400px] border-2 border-[#2a2a4e] scrollbar-pixel">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <span className="text-4xl block mb-2 animate-pixel-float">💬</span>
            <p className="text-gray-500 text-[8px]">No messages yet</p>
            <p className="text-gray-600 text-[6px]">Start the conversation!</p>
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
          className="flex-1 bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-3 py-2 text-white text-[9px] focus:border-[#ffd700] focus:outline-none smooth-transition disabled:opacity-50"
        />
        <button
          onClick={sendMessage}
          disabled={!address || !inputValue.trim()}
          className="pixel-btn pixel-btn-gold text-[8px] !px-4 smooth-transition hover-lift disabled:opacity-50"
        >
          SEND
        </button>
      </div>
      
      {/* Chat Help */}
      <div className="mt-2 text-gray-600 text-[6px]">
        <span className="text-[#9966ff]">/me</span> - emote action • 
        <span className="text-[#9966ff]"> Enter</span> - send message
      </div>
    </div>
  );
}

/**
 * Voice Chat Component (Placeholder)
 */
function VoiceChat() {
  const [isMuted, setIsMuted] = useState(true);
  
  return (
    <div className="pixel-card p-4 animate-slide-in-up animate-delay-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[#ffd700] text-[10px] tracking-wider animate-glow-pulse">
          🎤 VOICE CHAT
        </h3>
        <span className="text-[#ff4466] text-[6px] px-2 py-1 bg-[#ff4466]/10 rounded">
          COMING SOON
        </span>
      </div>
      
      <div className="bg-[#0a0a15] rounded-lg p-4 text-center border-2 border-[#2a2a4e]">
        <div className="text-4xl mb-2 opacity-50">🎙️</div>
        <p className="text-gray-500 text-[8px] mb-4">
          Voice chat is coming soon!
          <br />
          Talk with fellow Star bearers in real-time.
        </p>
        
        <div className="flex justify-center gap-3">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`pixel-btn text-[7px] !px-3 !py-1 smooth-transition ${
              isMuted 
                ? '!bg-[#ff4466] !border-[#ff6688_#aa2244_#aa2244_#ff6688]' 
                : '!bg-[#44ff88] !border-[#66ffaa_#22aa44_#22aa44_#66ffaa]'
            }`}
            disabled
          >
            {isMuted ? '🔇 MUTED' : '🔊 UNMUTED'}
          </button>
        </div>
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
  
  // Update status
  const handleStatusChange = (status: 'online' | 'away' | 'busy') => {
    setActiveStatus(status);
    updatePresence(status);
  };
  
  return (
    <>
      {/* Page Header */}
      <div className="text-center mb-8 animate-slide-in-up">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-2xl animate-pixel-float hover-lift smooth-transition">🎮</span>
          <h1 className="text-lg md:text-xl text-[#ffd700] pixel-glow-gold tracking-wider">
            HANGOUT HUB
          </h1>
          <span className="text-2xl animate-pixel-float hover-lift smooth-transition" style={{ animationDelay: '0.5s' }}>🌟</span>
        </div>
        <p className="text-[#9966ff] text-[10px] tracking-wide animate-glow-pulse">
          ✦ MEET FELLOW STAR BEARERS ✦
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
            <Lobby onlineUsers={onlineUsers} address={address} />
          </div>
          
          {/* Right Column - Chat & Voice */}
          <div className="space-y-6">
            <Chat address={address} />
            <VoiceChat />
          </div>
        </div>

        {/* Info Section */}
        <div className="pixel-card p-4 mt-6 bg-[#0a0a15] animate-slide-in-up animate-delay-3">
          <p className="text-[#9966ff] text-[8px] tracking-wide mb-2">✦ HANGOUT RULES ✦</p>
          <ul className="text-gray-500 text-[6px] space-y-1">
            <li>• Be respectful to fellow Star bearers</li>
            <li>• Keep conversations appropriate and on-topic</li>
            <li>• No spam or excessive emote usage</li>
            <li>• Have fun and make new cosmic friends! 🌟</li>
          </ul>
        </div>
      </AccessGate>
    </>
  );
}
