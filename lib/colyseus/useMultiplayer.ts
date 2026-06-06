'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room } from 'colyseus.js';
import { getStateCallbacks } from 'colyseus.js';
import EventBus from '@/components/sanctuary/EventBus';
import { joinLocationRoom, parsePlayer } from './client';
import {
  findEchoIndex,
  LOCAL_ONLY_SESSION_ID,
  pruneExpiredEchoes,
  type PendingEcho,
} from './chatDedup';
import type { RemotePlayer, JoinRoomOptions, ChatMessage } from './types';

interface UseMultiplayerOptions {
  wallet: string;
  displayName: string;
  companionTokenId: number;
  constellation: string;
  mood: string;
  equippedCosmetics?: string;
}

interface MultiplayerState {
  players: Map<string, RemotePlayer>;
  isConnected: boolean;
  currentLocation: string | null;
  sendPosition: (x: number, y: number, facing: string, isMoving: boolean) => void;
  sendMood: (mood: string) => void;
  sendChat: (text: string) => void;
}

export function useMultiplayer(options: UseMultiplayerOptions): MultiplayerState {
  const [players, setPlayers] = useState<Map<string, RemotePlayer>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const detachersRef = useRef<Array<() => void>>([]);
  const optionsRef = useRef(options);
  const pendingLocalEchoesRef = useRef<PendingEcho[]>([]);

  useEffect(() => {
    optionsRef.current = options;
  });

  const sendPosition = useCallback(
    (x: number, y: number, facing: string, isMoving: boolean) => {
      roomRef.current?.send('move', { x, y, facing, isMoving });
    },
    [],
  );

  const sendMood = useCallback((mood: string) => {
    roomRef.current?.send('updateMood', { mood });
  }, []);

  const sendChat = useCallback((text: string) => {
    const trimmed = text.slice(0, 100).trim();
    if (!trimmed) return;

    const opts = optionsRef.current;
    const room = roomRef.current;
    const sessionId = room?.sessionId ?? LOCAL_ONLY_SESSION_ID;
    const now = Date.now();

    pendingLocalEchoesRef.current = pruneExpiredEchoes(
      pendingLocalEchoesRef.current,
      now,
    );
    pendingLocalEchoesRef.current.push({ text: trimmed, sessionId, timestamp: now });

    EventBus.emit('chat-message', {
      sessionId,
      displayName: opts.displayName,
      text: trimmed,
      isLocal: true,
    });

    if (room) {
      room.send('chat', { text: trimmed });
    }
  }, []);

  useEffect(() => {
    const cleanupListeners = () => {
      for (const detach of detachersRef.current) {
        detach();
      }
      detachersRef.current = [];
    };

    const leaveRoom = async () => {
      cleanupListeners();
      if (roomRef.current) {
        try {
          await roomRef.current.leave();
        } catch {
          // Connection may already be closed
        }
        roomRef.current = null;
        setPlayers(new Map());
        setIsConnected(false);
        setCurrentLocation(null);
      }
    };

    const handleLocationEntered = async (data: { name: string }) => {
      await leaveRoom();

      const opts = optionsRef.current;
      const joinOptions: JoinRoomOptions = {
        locationName: data.name,
        wallet: opts.wallet,
        displayName: opts.displayName,
        x: 0,
        y: 0,
        companionTokenId: opts.companionTokenId,
        constellation: opts.constellation,
        mood: opts.mood,
        equippedCosmetics: opts.equippedCosmetics,
      };

      try {
        const room = await joinLocationRoom(joinOptions);
        roomRef.current = room;
        setIsConnected(true);
        setCurrentLocation(data.name);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const $ = getStateCallbacks(room as any);

        const updatePlayer = (sessionId: string, playerState: Record<string, unknown>) => {
          const player = parsePlayer(sessionId, playerState);
          setPlayers((prev) => {
            const next = new Map(prev);
            next.set(sessionId, player);
            return next;
          });
          EventBus.emit('remote-player-update', player);
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detachAdd = ($(room.state as any).players as any).onAdd(
          (playerState: Record<string, unknown>, sessionId: string) => {
            if (sessionId === room.sessionId) return;
            updatePlayer(sessionId, playerState);
            EventBus.emit('remote-player-add', parsePlayer(sessionId, playerState));

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const $player = $(playerState as any) as any;
            const fields = ['x', 'y', 'facing', 'isMoving', 'mood'] as const;
            for (const field of fields) {
              const detach = $player.listen(field, () => updatePlayer(sessionId, playerState));
              detachersRef.current.push(detach);
            }
          },
        );
        detachersRef.current.push(detachAdd);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detachRemove = ($(room.state as any).players as any).onRemove(
          (_playerState: unknown, sessionId: string) => {
            setPlayers((prev) => {
              const next = new Map(prev);
              next.delete(sessionId);
              return next;
            });
            EventBus.emit('remote-player-remove', sessionId);
          },
        );
        detachersRef.current.push(detachRemove);

        room.onMessage('chat', (msg: ChatMessage) => {
          const isLocal = msg.sessionId === room.sessionId;
          if (isLocal) {
            const now = Date.now();
            pendingLocalEchoesRef.current = pruneExpiredEchoes(
              pendingLocalEchoesRef.current,
              now,
            );
            const idx = findEchoIndex(
              pendingLocalEchoesRef.current,
              { text: msg.text, sessionId: msg.sessionId },
              now,
            );
            if (idx !== -1) {
              pendingLocalEchoesRef.current.splice(idx, 1);
              return;
            }
          }
          EventBus.emit('chat-message', {
            sessionId: msg.sessionId,
            displayName: msg.displayName,
            text: msg.text,
            isLocal,
          });
        });

        room.onLeave(() => {
          cleanupListeners();
          roomRef.current = null;
          setPlayers(new Map());
          setIsConnected(false);
          setCurrentLocation(null);
        });
      } catch (err) {
        console.error('Failed to join location room:', err);
      }
    };

    const handleLocationExited = () => {
      leaveRoom();
    };

    const handleSendChat = (text: string) => {
      const trimmed = String(text || '').slice(0, 100).trim();
      if (!trimmed) return;

      const opts = optionsRef.current;
      const room = roomRef.current;
      const sessionId = room?.sessionId ?? LOCAL_ONLY_SESSION_ID;
      const now = Date.now();

      pendingLocalEchoesRef.current = pruneExpiredEchoes(
        pendingLocalEchoesRef.current,
        now,
      );
      pendingLocalEchoesRef.current.push({ text: trimmed, sessionId, timestamp: now });

      EventBus.emit('chat-message', {
        sessionId,
        displayName: opts.displayName,
        text: trimmed,
        isLocal: true,
      });

      if (room) {
        room.send('chat', { text: trimmed });
      }
    };

    EventBus.on('location-entered', handleLocationEntered);
    EventBus.on('location-exited', handleLocationExited);
    EventBus.on('send-chat', handleSendChat);

    return () => {
      EventBus.off('location-entered', handleLocationEntered);
      EventBus.off('location-exited', handleLocationExited);
      EventBus.off('send-chat', handleSendChat);
      leaveRoom();
    };
  }, []);

  return { players, isConnected, currentLocation, sendPosition, sendMood, sendChat };
}
