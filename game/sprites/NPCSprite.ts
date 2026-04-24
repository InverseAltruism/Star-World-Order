import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';
import { npcSpriteTextureKey, type NPCDefinition } from '../config/npcDefinitions';

const IDLE_BOB_SPEED = 0.002;
const IDLE_BOB_AMPLITUDE = 1.5;
const INDICATOR_BOB_SPEED = 0.004;
const INDICATOR_BOB_AMPLITUDE = 3;

const NPC_DISPLAY_HEIGHT = 32;
const PLACEHOLDER_SCALE = 1.5;

export class NPCSprite extends Phaser.GameObjects.Container {
  readonly npcId: string;
  readonly npcName: string;
  readonly zone: string;
  readonly dialogue: string;

  private sprite: Phaser.GameObjects.Sprite;
  private nameTag: Phaser.GameObjects.Text;
  private indicator: Phaser.GameObjects.Text;
  private baseY: number;
  private hasQuest = false;
  private idleFrame = 0;
  private idleTimer = 0;
  private indicatorBaseY: number;

  constructor(scene: Phaser.Scene, def: NPCDefinition) {
    super(scene, def.x, def.y);

    this.npcId = def.id;
    this.npcName = def.name;
    this.zone = def.zone;
    this.dialogue = def.dialogue;
    this.baseY = def.y;

    const realKey = npcSpriteTextureKey(def.id);
    const realTex = scene.textures.get(realKey);
    const hasReal = realTex && realTex.key !== '__MISSING';
    const textureKey = hasReal ? realKey : `npc-${def.id}`;
    this.sprite = scene.add.sprite(0, 0, textureKey);
    if (hasReal) {
      const src = realTex.getSourceImage() as { height?: number };
      const h = src && typeof src.height === 'number' && src.height > 0 ? src.height : NPC_DISPLAY_HEIGHT;
      this.sprite.setScale(NPC_DISPLAY_HEIGHT / h);
    } else {
      this.sprite.setScale(PLACEHOLDER_SCALE);
    }
    this.add(this.sprite);

    const halfH = this.sprite.displayHeight / 2;
    const nameTagY = -halfH - 2;
    this.indicatorBaseY = nameTagY - 10;

    this.nameTag = scene.add.text(0, nameTagY, def.name, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '5px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
    });
    this.nameTag.setOrigin(0.5, 1);
    this.add(this.nameTag);

    this.indicator = scene.add.text(0, this.indicatorBaseY, '!', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    });
    this.indicator.setOrigin(0.5, 1);
    this.indicator.setVisible(false);
    this.add(this.indicator);

    const hitW = Math.max(24, this.sprite.displayWidth);
    const hitH = Math.max(24, this.sprite.displayHeight);
    this.setSize(hitW, hitH);
    this.setInteractive({ useHandCursor: true });

    this.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const camera = scene.cameras.main;
      const canvas = scene.game.canvas;
      const screenX = (this.x - camera.worldView.x) * camera.zoom + canvas.offsetLeft;
      const screenY = (this.y - camera.worldView.y) * camera.zoom + canvas.offsetTop;

      EventBus.emit('npc-clicked', {
        npcId: this.npcId,
        npcName: this.npcName,
        zone: this.zone,
        dialogue: this.dialogue,
        screenX,
        screenY,
      });

      pointer.event.stopPropagation();
    });

    scene.add.existing(this);
    this.setDepth(8);
  }

  setQuestAvailable(available: boolean) {
    this.hasQuest = available;
    this.indicator.setVisible(available);
  }

  update(time: number) {
    const bobOffset = Math.sin(time * IDLE_BOB_SPEED) * IDLE_BOB_AMPLITUDE;
    this.y = this.baseY + bobOffset;

    this.idleTimer += 16;
    if (this.idleTimer > 800) {
      this.idleTimer = 0;
      this.idleFrame = this.idleFrame === 0 ? 1 : 0;
      this.sprite.setFlipX(this.idleFrame === 1);
    }

    if (this.hasQuest) {
      const indicatorBob = Math.sin(time * INDICATOR_BOB_SPEED) * INDICATOR_BOB_AMPLITUDE;
      this.indicator.setY(this.indicatorBaseY + indicatorBob);

      const glow = 0.7 + 0.3 * Math.sin(time * 0.005);
      this.indicator.setAlpha(glow);
    }
  }

  static generatePlaceholderTexture(scene: Phaser.Scene, npcId: string, color: number) {
    const key = `npc-${npcId}`;
    if (scene.textures.exists(key)) return;

    const g = scene.make.graphics();

    g.fillStyle(color, 1);
    g.fillRoundedRect(2, 2, 12, 14, 2);

    g.fillStyle(0xffeedd, 1);
    g.fillCircle(8, 5, 4);

    g.fillStyle(0x000000, 1);
    g.fillRect(6, 4, 2, 2);
    g.fillRect(10, 4, 2, 2);

    g.fillStyle(color, 0.6);
    g.fillTriangle(4, 2, 8, -2, 12, 2);

    g.generateTexture(key, 16, 16);
    g.destroy();
  }
}

export class NPCManager {
  private npcs: NPCSprite[] = [];
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, definitions: NPCDefinition[]) {
    this.scene = scene;

    for (const def of definitions) {
      NPCSprite.generatePlaceholderTexture(scene, def.id, def.spriteColor);
    }

    for (const def of definitions) {
      const npc = new NPCSprite(scene, def);
      this.npcs.push(npc);
    }
  }

  update(time: number) {
    for (const npc of this.npcs) {
      npc.update(time);
    }
  }

  setQuestIndicators(npcQuestMap: Record<string, boolean>) {
    for (const npc of this.npcs) {
      const hasQuest = npcQuestMap[npc.npcId] ?? false;
      npc.setQuestAvailable(hasQuest);
    }
  }

  getNPC(npcId: string): NPCSprite | undefined {
    return this.npcs.find((n) => n.npcId === npcId);
  }

  destroy() {
    for (const npc of this.npcs) {
      npc.destroy();
    }
    this.npcs = [];
  }
}
