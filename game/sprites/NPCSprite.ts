import Phaser from 'phaser';
import EventBus from '@/components/sanctuary/EventBus';
import { npcSpriteTextureKey, type NPCDefinition } from '../config/npcDefinitions';

const IDLE_BOB_SPEED = 0.002;
const IDLE_BOB_AMPLITUDE = 1.5;
const INDICATOR_BOB_SPEED = 0.004;
const INDICATOR_BOB_AMPLITUDE = 3;

const NPC_DISPLAY_HEIGHT = 60;
const PLACEHOLDER_SCALE = 1.5;
const ALPHA_THRESHOLD = 16;

function npcFrame0TextureKey(id: string): string {
  return `npc-frame0-${id}`;
}

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
  private indicatorBaseY: number;

  constructor(scene: Phaser.Scene, def: NPCDefinition) {
    super(scene, def.x, def.y);

    this.npcId = def.id;
    this.npcName = def.name;
    this.zone = def.zone;
    this.dialogue = def.dialogue;
    this.baseY = def.y;

    const cropKey = npcFrame0TextureKey(def.id);
    const cropTex = scene.textures.get(cropKey);
    const hasCrop = cropTex && cropTex.key !== '__MISSING';
    const textureKey = hasCrop ? cropKey : `npc-${def.id}`;
    this.sprite = scene.add.sprite(0, 0, textureKey);
    if (hasCrop) {
      const src = cropTex.getSourceImage() as { height?: number };
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

    if (this.hasQuest) {
      const indicatorBob = Math.sin(time * INDICATOR_BOB_SPEED) * INDICATOR_BOB_AMPLITUDE;
      this.indicator.setY(this.indicatorBaseY + indicatorBob);

      const glow = 0.7 + 0.3 * Math.sin(time * 0.005);
      this.indicator.setAlpha(glow);
    }
  }

  /**
   * Register a tightly-cropped "frame 0" texture for one NPC's spritesheet.
   * The source sheets are 1254×1254 with a 4×4 grid (so cells are ~313.5 px,
   * non-integer pitch). We only ever show the down-idle pose, so this scans
   * the top-left cell's alpha channel, finds the character bbox, and creates
   * a small canvas texture cropped to it. Result: a clean per-NPC sprite at
   * its natural pixel size, no neighbor-cell bleed and no whole-sheet blob.
   */
  static registerFrames(scene: Phaser.Scene, npcId: string) {
    const destKey = npcFrame0TextureKey(npcId);
    if (scene.textures.exists(destKey)) return;
    const srcKey = npcSpriteTextureKey(npcId);
    const srcTex = scene.textures.get(srcKey);
    if (!srcTex || srcTex.key === '__MISSING') return;
    const srcImg = srcTex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const srcW = (srcImg as { width?: number }).width;
    const srcH = (srcImg as { height?: number }).height;
    if (!srcW || !srcH) return;

    // Top-left cell. We use ~30% of the sheet to give the character a margin
    // even if the artist drew slightly outside the nominal cell boundary.
    const cellW = Math.floor(srcW * 0.3);
    const cellH = Math.floor(srcH * 0.3);

    // Read the cell's pixels via a scratch canvas.
    const scratch = document.createElement('canvas');
    scratch.width = cellW;
    scratch.height = cellH;
    const sctx = scratch.getContext('2d');
    if (!sctx) return;
    sctx.drawImage(
      srcImg as CanvasImageSource,
      0, 0, cellW, cellH,
      0, 0, cellW, cellH,
    );
    const data = sctx.getImageData(0, 0, cellW, cellH).data;

    let minX = cellW, maxX = -1, minY = cellH, maxY = -1;
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        if (data[(y * cellW + x) * 4 + 3] > ALPHA_THRESHOLD) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return; // Empty cell.

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;

    const canvas = scene.textures.createCanvas(destKey, w, h);
    if (!canvas) return;
    const ctx = canvas.getContext();
    ctx.drawImage(srcImg as CanvasImageSource, minX, minY, w, h, 0, 0, w, h);
    canvas.refresh();
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
