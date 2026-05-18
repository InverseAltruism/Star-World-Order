import * as Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';
import { npcSpriteKey, type NPCDefV3 } from '../config/npcDefinitionsV3';

const FRAME_W = 48;
const FRAME_H = 48;
const SCALE = 1;

export class NPCSpriteV3 extends Phaser.GameObjects.Container {
  readonly npcId: string;
  private sprite: Phaser.GameObjects.Sprite;
  private nameTag: Phaser.GameObjects.Text;
  private shadow: Phaser.GameObjects.Ellipse;
  private baseY: number;

  static preload(scene: Phaser.Scene, def: NPCDefV3) {
    const k = npcSpriteKey(def.id);
    if (scene.textures.exists(k)) return;
    scene.load.spritesheet(k, `/sanctuary-v3/npcs/${def.id}.png`, {
      frameWidth: FRAME_W, frameHeight: FRAME_H,
    });
  }

  constructor(scene: Phaser.Scene, def: NPCDefV3) {
    super(scene, def.x, def.y);
    this.npcId = def.id;
    this.baseY = def.y;

    const key = npcSpriteKey(def.id);
    const hasSheet = scene.textures.exists(key);
    // 4×4 sheet rows are counter-clockwise: 0=up, 1=left, 2=down, 3=right.
    // Frame 8 = row 2 col 0 = down-facing (verified by extracting each row
    // of multiple sheets). NPCs greet the camera by default.
    this.sprite = scene.add.sprite(0, 0, hasSheet ? key : '__MISSING', 8);
    this.sprite.setScale(SCALE);
    this.add(this.sprite);

    this.shadow = scene.add.ellipse(def.x, def.y + 20, 24, 8, 0x000000, 0.35);
    this.shadow.setDepth(7);

    this.nameTag = scene.add.text(0, -28, def.name, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    });
    this.nameTag.setOrigin(0.5, 1);
    this.add(this.nameTag);

    this.setSize(FRAME_W, FRAME_H);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const cam = scene.cameras.main;
      const canvas = scene.game.canvas;
      const screenX = (this.x - cam.worldView.x) * cam.zoom + canvas.offsetLeft;
      const screenY = (this.y - cam.worldView.y) * cam.zoom + canvas.offsetTop;
      EventBus.emit('npc-clicked', {
        npcId: this.npcId,
        npcName: def.name,
        zone: def.zone,
        dialogue: def.dialogue,
        screenX, screenY,
      });
      pointer.event.stopPropagation();
    });

    scene.add.existing(this);
    this.setDepth(8);
  }

  update(time: number) {
    // Subtle 1.5px idle bob (sprite, not shadow).
    const bob = Math.sin(time * 0.002) * 1.5;
    this.sprite.y = bob;
  }

  destroy(fromScene?: boolean) {
    this.shadow?.destroy();
    super.destroy(fromScene);
  }
}
