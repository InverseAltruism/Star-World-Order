import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';
import type { RoomKey } from '../config/worldLayout';

const ROOM_W = 480;
const ROOM_H = 320;

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
    cam.setZoom(2);
    cam.centerOn(ROOM_W / 2, ROOM_H / 2);
    cam.fadeIn(250, 0, 0, 0);

    this.add.image(0, 0, 'room-placeholder').setOrigin(0, 0);

    this.add
      .text(ROOM_W / 2, 48, this.room.toUpperCase(), {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '14px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.add
      .text(ROOM_W / 2, ROOM_H / 2, 'placeholder room\n\n(interior art coming soon)', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '6px',
        color: '#00f7ff',
        align: 'center',
      })
      .setOrigin(0.5);

    const exitBtn = this.add
      .text(ROOM_W / 2, ROOM_H - 40, '< EXIT', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '8px',
        color: '#ff00ff',
        stroke: '#000000',
        strokeThickness: 3,
        backgroundColor: '#1a0033',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    exitBtn.on('pointerdown', () => this.exit());

    this.input.keyboard!.on('keydown-ESC', () => this.exit());
    this.input.keyboard!.on('keydown-E', () => this.exit());
  }

  private exit() {
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.time.delayedCall(260, () => {
      EventBus.emit('room-exit', { returnTo: this.returnTo });
    });
  }
}
