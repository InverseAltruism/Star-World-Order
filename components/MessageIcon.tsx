'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';

interface Conversation {
  other_address: string;
  other_display_name?: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  is_sender: boolean;
}

/**
 * Format relative time
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
}

/**
 * Format address for display
 */
function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * MessageIcon Component
 * 
 * Displays a message icon with unread count badge.
 * Clicking opens a dropdown with recent conversations.
 */
export default function MessageIcon() {
  const { address, isConnected } = useAccount();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!address) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/messages?address=${address}&type=conversations`);
      const data = await response.json();
      
      if (data.success) {
        setConversations(data.conversations || []);
        setUnreadTotal(data.unreadTotal || 0);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setIsLoading(false);
    }
  }, [address]);
  
  // Initial fetch and polling
  useEffect(() => {
    if (isConnected && address) {
      fetchConversations();
      
      // Poll every 60 seconds for new messages
      // This reduces server load while still providing reasonably up-to-date info
      const interval = setInterval(fetchConversations, 60000);
      return () => clearInterval(interval);
    }
  }, [isConnected, address, fetchConversations]);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Don't render if not connected
  if (!isConnected) {
    return null;
  }
  
  return (
    <div className="relative" ref={dropdownRef}>
      {/* Message Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-300 hover:text-[#00ffff] transition-colors"
        aria-label="Messages"
      >
        <span className="text-xl">💬</span>
        
        {/* Unread Badge */}
        {unreadTotal > 0 && (
          <span 
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-[#00ffff] rounded-full px-1 animate-pulse"
            style={{ boxShadow: '0 0 8px #00ffff' }}
          >
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
      </button>
      
      {/* Dropdown */}
      {isOpen && (
        <div 
          className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[70vh] overflow-hidden rounded-lg border-2 border-[#2a2a4e] bg-[#0d0d1a] shadow-xl z-50"
          style={{ boxShadow: '0 0 20px rgba(0, 255, 255, 0.3)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a4e] bg-[#1a1a2e]">
            <h3 className="text-[#00ffff] text-xs font-bold tracking-wider">
              💬 MESSAGES
            </h3>
            {unreadTotal > 0 && (
              <span className="text-[10px] text-[#00ffff]">
                {unreadTotal} unread
              </span>
            )}
          </div>
          
          {/* Conversations List */}
          <div className="max-h-[calc(70vh-100px)] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-2xl animate-spin">⭐</span>
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4">
                <span className="text-3xl mb-2 opacity-50">💬</span>
                <p className="text-gray-500 text-xs text-center">No messages yet</p>
                <p className="text-gray-600 text-[10px] text-center mt-1">
                  Start a conversation from the Members page
                </p>
              </div>
            ) : (
              <div>
                {conversations.map((convo) => {
                  const hasUnread = convo.unread_count > 0;
                  const displayName = convo.other_display_name || formatAddress(convo.other_address);
                  
                  return (
                    <Link 
                      key={convo.other_address} 
                      href={`/profile?tab=messages&chat=${convo.other_address}`}
                      onClick={() => setIsOpen(false)}
                    >
                      <div
                        className={`flex items-start gap-3 px-4 py-3 border-b border-[#2a2a4e]/50 cursor-pointer transition-all hover:bg-[#1a1a2e] ${
                          hasUnread ? 'bg-[#00ffff]/5' : ''
                        }`}
                      >
                        {/* Avatar placeholder */}
                        <div 
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm flex-shrink-0 bg-[#2a2a4e] border border-[#3a3a5e]"
                        >
                          🐸
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className={`text-xs font-bold truncate ${hasUnread ? 'text-white' : 'text-gray-300'}`}>
                              {displayName}
                            </h4>
                            <span className="text-gray-600 text-[9px] flex-shrink-0">
                              {formatRelativeTime(convo.last_message_at)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className={`text-[10px] line-clamp-1 flex-1 ${hasUnread ? 'text-gray-300' : 'text-gray-500'}`}>
                              {convo.is_sender && <span className="text-gray-600">You: </span>}
                              {convo.last_message}
                            </p>
                            {hasUnread && (
                              <span 
                                className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-[#00ffff] rounded-full px-1 flex-shrink-0"
                              >
                                {convo.unread_count}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="px-4 py-3 border-t border-[#2a2a4e] bg-[#1a1a2e]">
            <Link 
              href="/profile?tab=messages"
              onClick={() => setIsOpen(false)}
              className="block w-full text-center text-[10px] text-[#00ffff] hover:text-[#ffd700] transition-colors"
            >
              View all messages →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
