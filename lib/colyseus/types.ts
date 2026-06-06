export interface RemotePlayer {
  sessionId: string;
  wallet: string;
  displayName: string;
  x: number;
  y: number;
  facing: string;
  isMoving: boolean;
  companionTokenId: number;
  constellation: string;
  mood: string;
  equippedCosmetics: string;
  currentLocation: string;
}

export interface ChatMessage {
  sessionId: string;
  displayName: string;
  text: string;
}

export interface JoinRoomOptions {
  locationName: string;
  wallet: string;
  displayName: string;
  x: number;
  y: number;
  companionTokenId: number;
  constellation: string;
  mood: string;
  equippedCosmetics?: string;
}
