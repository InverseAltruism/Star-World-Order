import { Client, Room } from 'colyseus.js';
import type { JoinRoomOptions, RemotePlayer } from './types';

const COLYSEUS_URL =
  (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_COLYSEUS_URL) ||
  'ws://localhost:2567';

let clientInstance: Client | null = null;

function getClient(): Client {
  if (!clientInstance) {
    clientInstance = new Client(COLYSEUS_URL);
  }
  return clientInstance;
}

export async function joinLocationRoom(
  options: JoinRoomOptions,
): Promise<Room> {
  const client = getClient();
  return client.joinOrCreate('location', options);
}

export function parsePlayer(
  sessionId: string,
  state: Record<string, unknown>,
): RemotePlayer {
  return {
    sessionId,
    wallet: (state.wallet as string) || '',
    displayName: (state.displayName as string) || '',
    x: (state.x as number) || 0,
    y: (state.y as number) || 0,
    facing: (state.facing as string) || 'down',
    isMoving: (state.isMoving as boolean) || false,
    companionTokenId: (state.companionTokenId as number) ?? -1,
    constellation: (state.constellation as string) || '',
    mood: (state.mood as string) || 'idle',
    equippedCosmetics: (state.equippedCosmetics as string) || '{}',
    currentLocation: (state.currentLocation as string) || '',
  };
}
