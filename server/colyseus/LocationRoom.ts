import { Room, type Client } from 'colyseus';
import { PlayerState, LocationState } from './PlayerState.js';

interface JoinOptions {
  wallet: string;
  displayName: string;
  x: number;
  y: number;
  companionTokenId: number;
  constellation: string;
  mood: string;
  equippedCosmetics?: string;
}

interface MoveMessage {
  x: number;
  y: number;
  facing: string;
  isMoving: boolean;
}

export class LocationRoom extends Room<{ state: LocationState }> {
  maxClients = 50;

  onCreate(options: { locationName: string }) {
    this.setState(new LocationState());
    this.state.locationName = options.locationName || 'unknown';

    this.onMessage('move', (client: Client, data: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.x = data.x;
      player.y = data.y;
      player.facing = data.facing;
      player.isMoving = data.isMoving;
    });

    this.onMessage('updateMood', (client: Client, data: { mood: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.mood = data.mood;
    });

    this.onMessage('updateCosmetics', (client: Client, data: { equippedCosmetics: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.equippedCosmetics = data.equippedCosmetics;
    });

    this.onMessage('chat', (client: Client, data: { text: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const text = String(data.text || '').slice(0, 100).trim();
      if (!text) return;
      this.broadcast('chat', {
        sessionId: client.sessionId,
        displayName: player.displayName || player.wallet.slice(0, 6),
        text,
      });
    });
  }

  onJoin(client: Client, options: JoinOptions) {
    const player = new PlayerState();
    player.wallet = options.wallet;
    player.displayName = options.displayName;
    player.x = options.x;
    player.y = options.y;
    player.facing = 'down';
    player.isMoving = false;
    player.companionTokenId = options.companionTokenId;
    player.constellation = options.constellation;
    player.mood = options.mood;
    player.equippedCosmetics = options.equippedCosmetics || '{}';
    player.currentLocation = this.state.locationName;

    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
    // Room is being disposed — no cleanup needed
  }
}
