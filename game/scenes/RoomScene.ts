import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';
import type { RoomKey } from '../config/worldLayout';

const ROOM_W = 1448;
const ROOM_H = 1086;

export class RoomScene extends Phaser.Scene {
  private room!: RoomKey;
  private returnTo!: { x: number; y: number };

  constructor() {
    super({ key: 'RoomScene' });
  }

  create(data: { room: RoomKey; returnTo: { x: number; y: number } }) {
    this.room = data.room;
    this.returnTo = data.returnTo;

    const cam = this.cameras.main;
    cam.setBounds(0, 0, ROOM_W, ROOM_H);
    cam.setZoom(1);
    cam.centerOn(ROOM_W / 2, ROOM_H / 2);
    cam.setBackgroundColor('#0a0015');
    cam.fadeIn(250, 0, 0, 0);

    const bgKey = `room-bg-${this.room}`;
    if (this.textures.exists(bgKey)) {
      this.add.image(0, 0, bgKey).setOrigin(0, 0).setDisplaySize(ROOM_W, ROOM_H);
    } else {
      this.add.image(0, 0, 'room-placeholder').setOrigin(0, 0).setDisplaySize(ROOM_W, ROOM_H);
    }

    const screenW = this.scale.width;
    const screenH = this.scale.height;

    const nameplate = this.add
      .text(screenW / 2, 32, this.room.toUpperCase(), {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '16px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 4,
        backgroundColor: 'rgba(10,0,21,0.75)',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(100);

    const exitBtn = this.add
      .text(screenW / 2, screenH - 36, '< EXIT  [E]', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '12px',
        color: '#ff00ff',
        stroke: '#000000',
        strokeThickness: 3,
        backgroundColor: 'rgba(26,0,51,0.85)',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive({ useHandCursor: true });

    exitBtn.on('pointerdown', () => this.exit());
    this.input.keyboard!.on('keydown-ESC', () => this.exit());
    this.input.keyboard!.on('keydown-E', () => this.exit());

    void nameplate;
  }

  private exit() {
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.time.delayedCall(260, () => {
      EventBus.emit('room-exit', { returnTo: this.returnTo });
    });
  }
}
