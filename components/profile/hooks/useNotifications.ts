import { useState, useCallback } from 'react';
import type { NotificationData } from '../types';

/**
 * Owns the notifications data cluster: the notification list and its fetch.
 */
export function useNotifications(address: string | undefined) {
  const [allNotifications, setAllNotifications] = useState<NotificationData[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);

  // Fetch all notifications
  const fetchAllNotifications = useCallback(async () => {
    if (!address) return;

    setIsLoadingNotifications(true);
    try {
      const response = await fetch(`/api/notifications?address=${address}&limit=50`);
      const data = await response.json();

      if (data.success) {
        setAllNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [address]);

  return { allNotifications, isLoadingNotifications, fetchAllNotifications };
}
