import { Schema, defineTypes, MapSchema } from '@colyseus/schema';

export class PlayerState extends Schema {
  wallet = '';
  displayName = '';
  x: number = 0;
  y: number = 0;
  facing = 'down';
  isMoving = false;
  companionTokenId: number = -1;
  constellation = '';
  mood = 'idle';
  equippedCosmetics = '{}';
  currentLocation = '';
}

defineTypes(PlayerState, {
  wallet: 'string',
  displayName: 'string',
  x: 'float32',
  y: 'float32',
  facing: 'string',
  isMoving: 'boolean',
  companionTokenId: 'int32',
  constellation: 'string',
  mood: 'string',
  equippedCosmetics: 'string',
  currentLocation: 'string',
});

export class LocationState extends Schema {
  locationName = '';
  players = new MapSchema<PlayerState>();
}

defineTypes(LocationState, {
  locationName: 'string',
  players: { map: PlayerState },
});
