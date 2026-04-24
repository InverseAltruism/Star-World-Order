import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { ROOMS } from '../config/worldLayout';
import { ROOM_LAYOUTS, getRoomLayout } from '../config/roomLayouts';

describe('Room layouts config', () => {
  it('has an entry for every room key', () => {
    for (const room of ROOMS) {
      expect(ROOM_LAYOUTS[room]).toBeDefined();
      expect(Array.isArray(ROOM_LAYOUTS[room].collision)).toBe(true);
    }
  });

  it('getRoomLayout returns a layout for every room', () => {
    for (const room of ROOMS) {
      const layout = getRoomLayout(room);
      expect(layout).toBeDefined();
      expect(Array.isArray(layout.collision)).toBe(true);
    }
  });
});

describe('RoomScene gameplay wiring', () => {
  const source = fs.readFileSync(
    new URL('../scenes/RoomScene.ts', import.meta.url),
    'utf-8',
  );

  it('spawns a PlayerSprite inside the room', () => {
    expect(source).toContain('new PlayerSprite(this, spawnX, spawnY)');
    expect(source).toContain('ROOM_H - 60');
  });

  it('spawns a CompanionSprite that follows the player', () => {
    expect(source).toContain('new CompanionSprite(this');
    expect(source).toContain('this.companion.followPlayer(');
  });

  it('uses per-room collision bodies inside a StaticGroup', () => {
    expect(source).toContain('this.collisionGroup = this.physics.add.staticGroup()');
    expect(source).toContain('this.collisionGroup.add(zone)');
    expect(source).toContain('this.physics.add.collider(this.player, this.collisionGroup)');
    expect(source).toContain("from '../config/roomLayouts'");
  });

  it('binds the camera to room bounds and follows the player', () => {
    expect(source).toContain('cam.setBounds(0, 0, ROOM_W, ROOM_H)');
    expect(source).toContain('cam.startFollow(this.player');
  });

  it('registers an exit trigger zone at the bottom center', () => {
    expect(source).toContain('this.physics.add.overlap(this.player, zone');
    expect(source).toContain('ROOM_W / 2');
  });

  it('supports keyboard-driven movement and pathfinding click-to-move', () => {
    expect(source).toContain('this.player.handleKeyboardInput()');
    expect(source).toContain('this.player.updatePathMovement()');
    expect(source).toContain('EasyStar');
  });
});
