'use client';

import React from 'react';
import type {
  ConversationData,
  DirectMessageData,
  NotificationData,
} from '../types';
import { truncateAddress } from '@/lib/format';

/**
 * MessagesTab — presentational extraction of the `messages` section of
 * ProfileCard. Renders the conversations + chat card and the all-notifications
 * card. All state lives in the parent (via useMessages / useNotifications) and
 * is passed in as props.
 */
interface MessagesTabProps {
  address: string | undefined;
  // useMessages
  conversations: ConversationData[];
  selectedChat: string | null;
  setSelectedChat: (address: string | null) => void;
  chatMessages: DirectMessageData[];
  isLoadingMessages: boolean;
  newMessage: string;
  setNewMessage: (message: string) => void;
  isSendingMessage: boolean;
  handleSendMessage: () => void;
  // useNotifications
  allNotifications: NotificationData[];
  isLoadingNotifications: boolean;
}

export default function MessagesTab({
  address,
  conversations,
  selectedChat,
  setSelectedChat,
  chatMessages,
  isLoadingMessages,
  newMessage,
  setNewMessage,
  isSendingMessage,
  handleSendMessage,
  allNotifications,
  isLoadingNotifications,
}: MessagesTabProps) {
  return (
        <>
          {/* Messages Container */}
          <div className="pixel-card p-4 animate-slide-in-up">
            <h3 className="text-[#00ffff] text-sm tracking-wider mb-4 flex items-center gap-2">
              💬 MESSAGES
            </h3>

            <div className="flex flex-col sm:flex-row gap-4 min-h-[400px]">
              {/* Conversations List */}
              <div className="w-full sm:w-1/3 border-b sm:border-b-0 sm:border-r border-[#2a2a4e] pb-4 sm:pb-0 sm:pr-4">
                <p className="text-gray-500 text-[9px] mb-2">CONVERSATIONS</p>
                {isLoadingMessages ? (
                  <div className="flex items-center justify-center py-8">
                    <span className="text-xl animate-spin">⭐</span>
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="text-center py-8">
                    <span className="text-2xl opacity-50">💬</span>
                    <p className="text-gray-500 text-[10px] mt-2">No conversations</p>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {conversations.map((convo) => {
                      const isSelected = selectedChat === convo.other_address;
                      const displayName = convo.other_display_name || `${convo.other_address.slice(0, 6)}...`;

                      return (
                        <button
                          key={convo.other_address}
                          onClick={() => setSelectedChat(convo.other_address)}
                          className={`w-full text-left p-2 rounded transition-all ${
                            isSelected
                              ? 'bg-[#00ffff]/20 border border-[#00ffff]'
                              : 'hover:bg-[#1a1a2e]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#2a2a4e] flex items-center justify-center text-sm">
                              🐸
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className={`text-[10px] font-bold truncate ${isSelected ? 'text-[#00ffff]' : 'text-white'}`}>
                                  {displayName}
                                </p>
                                {convo.unread_count > 0 && (
                                  <span className="min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold text-white bg-[#00ffff] rounded-full px-1">
                                    {convo.unread_count}
                                  </span>
                                )}
                              </div>
                              <p className="text-gray-500 text-[9px] truncate">
                                {convo.is_sender && 'You: '}{convo.last_message}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Chat Area */}
              <div className="flex-1 flex flex-col">
                {selectedChat ? (
                  <>
                    {/* Chat Header */}
                    <div className="pb-3 mb-3 border-b border-[#2a2a4e]">
                      <p className="text-white text-xs font-bold">
                        {conversations.find(c => c.other_address === selectedChat)?.other_display_name ||
                         truncateAddress(selectedChat)}
                      </p>
                      <p className="text-gray-500 text-[9px] font-mono">{selectedChat}</p>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto space-y-2 max-h-[300px] mb-3">
                      {chatMessages.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-gray-500 text-[10px]">Start the conversation!</p>
                        </div>
                      ) : (
                        chatMessages.map((msg) => {
                          const isSent = msg.sender_address === address?.toLowerCase();
                          return (
                            <div
                              key={msg.id}
                              className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={`max-w-[80%] p-2 rounded-lg ${
                                  isSent
                                    ? 'bg-[#00ffff]/20 border border-[#00ffff]/50'
                                    : 'bg-[#2a2a4e]'
                                }`}
                              >
                                <p className="text-white text-[10px] break-words">{msg.message}</p>
                                <p className="text-gray-500 text-[8px] mt-1">
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Message Input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                        placeholder="Type a message..."
                        maxLength={2000}
                        className="flex-1 bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-3 py-2 text-white text-[10px] focus:border-[#00ffff] focus:outline-none"
                        disabled={isSendingMessage}
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim() || isSendingMessage}
                        className="pixel-btn text-[10px] !px-4 disabled:opacity-50"
                      >
                        {isSendingMessage ? '...' : '→'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <span className="text-4xl opacity-50">💬</span>
                    <p className="text-gray-500 text-xs mt-2">Select a conversation</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* All Notifications */}
          <div className="pixel-card p-4 animate-slide-in-up">
            <h3 className="text-[#ffd700] text-sm tracking-wider mb-4 flex items-center gap-2">
              🔔 ALL NOTIFICATIONS
            </h3>

            {isLoadingNotifications ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-2xl animate-spin">⭐</span>
              </div>
            ) : allNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4">
                <span className="text-4xl mb-2 opacity-50">🔔</span>
                <p className="text-gray-500 text-xs text-center">No notifications yet</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {allNotifications.map((notification) => {
                  const isUnread = notification.is_read === 0;
                  const typeColors: Record<string, string> = {
                    quest: '#ffd700',
                    achievement: '#ff6ec7',
                    system: '#00ffff',
                    social: '#9966ff',
                    governance: '#44ff88',
                  };
                  const color = typeColors[notification.type] || '#ffd700';

                  return (
                    <div
                      key={notification.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                        isUnread
                          ? 'bg-[#1a1a2e]/50 border-[#2a2a4e]'
                          : 'bg-[#0a0a15] border-[#1a1a2e] opacity-60'
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                        style={{
                          backgroundColor: `${color}20`,
                          border: `1px solid ${color}40`,
                        }}
                      >
                        {notification.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className={`text-xs font-bold truncate ${isUnread ? 'text-white' : 'text-gray-400'}`}>
                            {notification.title}
                          </h4>
                          {isUnread && (
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                          )}
                        </div>
                        <p className="text-gray-400 text-[10px] line-clamp-2 mt-0.5">
                          {notification.message}
                        </p>
                        <p className="text-gray-600 text-[9px] mt-1">
                          {new Date(notification.created_at).toLocaleDateString()} at{' '}
                          {new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
  );
}
