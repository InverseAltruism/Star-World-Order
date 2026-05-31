import { useState, useCallback } from 'react';
import { useAuthHeaders } from './useAuthHeaders';
import type { FriendWithProfileData } from '../types';

/**
 * Owns the friends + pending-requests data cluster: fetching the lists and
 * acting on friend requests (accept/decline/remove), which refreshes the lists.
 */
export function useFriends(address: string | undefined) {
  const getAuthenticatedJsonHeaders = useAuthHeaders(address);

  const [friends, setFriends] = useState<FriendWithProfileData[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendWithProfileData[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);

  // Fetch friends data
  const fetchFriends = useCallback(async () => {
    if (!address) return;

    setIsLoadingFriends(true);
    try {
      const [friendsRes, pendingRes] = await Promise.all([
        fetch(`/api/friends?address=${address}&type=all`),
        fetch(`/api/friends?address=${address}&type=pending`),
      ]);

      const friendsData = await friendsRes.json();
      const pendingData = await pendingRes.json();

      if (friendsData.success) {
        setFriends(friendsData.friends || []);
      }
      if (pendingData.success) {
        setPendingRequests(pendingData.pending || []);
      }
    } catch (error) {
      console.error('Failed to fetch friends:', error);
    } finally {
      setIsLoadingFriends(false);
    }
  }, [address]);

  // Handle friend request action
  const handleFriendAction = useCallback(async (targetAddress: string, action: string) => {
    if (!address) return;

    try {
      const headers = await getAuthenticatedJsonHeaders();
      if (!headers) {
        return;
      }

      const response = await fetch('/api/friends', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          walletAddress: address,
          targetAddress,
          action,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Refresh friends list
        await fetchFriends();
      }
    } catch (error) {
      console.error('Failed to process friend action:', error);
    }
  }, [address, getAuthenticatedJsonHeaders, fetchFriends]);

  return { friends, pendingRequests, isLoadingFriends, fetchFriends, handleFriendAction };
}
