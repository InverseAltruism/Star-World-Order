'use client';

import { useMultiplayer } from '@/lib/colyseus/useMultiplayer';

export default function MultiplayerBridge({
  wallet,
  displayName,
  companionTokenId,
}: {
  wallet: string;
  displayName: string;
  companionTokenId: number;
}) {
  useMultiplayer({
    wallet,
    displayName,
    companionTokenId,
    constellation: '',
    mood: 'idle',
  });
  return null;
}
