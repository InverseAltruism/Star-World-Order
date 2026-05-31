import { useState, useEffect, useCallback } from 'react';
import type { ConversationData, DirectMessageData } from '../types';

/**
 * Owns the direct-messaging data cluster: conversation list, the selected
 * chat and its messages, the send-message handler, and the effect that loads
 * a chat's messages (aborting the in-flight request) when the selection
 * changes. The current send path posts a plain (unauthenticated) JSON
 * request, matching the pre-refactor behavior.
 */
export function useMessages(address: string | undefined) {
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<DirectMessageData[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!address) return;

    setIsLoadingMessages(true);
    try {
      const response = await fetch(`/api/messages?address=${address}&type=conversations`);
      const data = await response.json();

      if (data.success) {
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [address]);

  // Fetch chat messages for selected conversation
  const fetchChatMessages = useCallback(async (otherAddress: string, signal?: AbortSignal) => {
    if (!address) return;

    setIsLoadingMessages(true);
    try {
      const response = await fetch(`/api/messages?address=${address}&type=conversation&otherAddress=${otherAddress}`, { signal });
      const data = await response.json();

      if (data.success) {
        setChatMessages(data.messages || []);
      }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch chat messages:', error);
      }
    } finally {
      if (!signal?.aborted) setIsLoadingMessages(false);
    }
  }, [address]);

  // Handle sending a message
  const handleSendMessage = async () => {
    if (!address || !selectedChat || !newMessage.trim() || isSendingMessage) return;

    setIsSendingMessage(true);
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderAddress: address,
          recipientAddress: selectedChat,
          message: newMessage.trim(),
        }),
      });

      const data = await response.json();
      if (data.success) {
        setNewMessage('');
        // Refresh messages
        await fetchChatMessages(selectedChat);
        await fetchConversations();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Load chat when selected (abort the in-flight request when switching chats)
  useEffect(() => {
    if (selectedChat && address) {
      const controller = new AbortController();
      fetchChatMessages(selectedChat, controller.signal);
      return () => controller.abort();
    }
  }, [selectedChat, address, fetchChatMessages]);

  return {
    conversations,
    selectedChat,
    setSelectedChat,
    chatMessages,
    isLoadingMessages,
    newMessage,
    setNewMessage,
    isSendingMessage,
    fetchConversations,
    fetchChatMessages,
    handleSendMessage,
  };
}
