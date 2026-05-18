import * as Phaser from 'phaser';
import type { Direction } from './PlayerSprite';
import type { RemotePlayer } from '@/lib/colyseus/types';

const LERP_SPEED = 0.2;
const NAME_TAG_OFFSET_Y = -12;
const COMPANION_OFFSET = 15;
const POOL_INITIAL_SIZE = 8;
const CAMERA_MARGIN = 48;

export class OtherPlayerSprite {
  private sprite: Phaser.GameObjects.Sprite;
  private nameTag: Phaser.GameObjects.Text;
  private companionSprite: Phaser.GameObjects.Sprite;
  private scene: Phaser.Scene;

  private targetX = 0;
  private targetY = 0;
  private facing: Direction = 'down';
  private isMoving = false;
  private constellation = '';
  private companionBaseY = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.sprite = scene.add.sprite(0, 0, 'player-down-0');
    this.sprite.setDepth(10);
    this.sprite.setVisible(false);

    this.nameTag = scene.add.text(0, 0, '', {
      fontFamily: '"Pixelify Sans", monospace',
      fontSize: '3px',
      color: '#00f7ff',
      stroke: '#000000',
      strokeThickness: 1,
    });
    this.nameTag.setOrigin(0.5, 1);
    this.nameTag.setDepth(11);
    this.nameTag.setVisible(false);

    this.companionSprite = scene.add.sprite(0, 0, 'companion-placeholder');
    this.companionSprite.setDepth(9);
    this.companionSprite.setScale(1.5);
    this.companionSprite.setVisible(false);
  }

  assign(player: RemotePlayer): void {
    this.targetX = player.x;
    this.targetY = player.y;
    this.sprite.setPosition(player.x, player.y);
    this.facing = (player.facing as Direction) || 'down';
    this.isMoving = player.isMoving;

    this.nameTag.setText(player.displayName || player.wallet.slice(0, 6));
    this.applyCompanionTexture(player.constellation);

    const offsetX = this.getCompanionOffsetX();
    const offsetY = this.getCompanionOffsetY();
    this.companionSprite.setPosition(player.x + offsetX, player.y + offsetY);
    this.companionBaseY = player.y + offsetY;

    this.setAllVisible(true);
    this.refreshPlayerTexture();
  }

  release(): void {
    this.setAllVisible(false);
    this.constellation = '';
  }

  syncState(player: RemotePlayer): void {
    this.targetX = player.x;
    this.targetY = player.y;

    const newFacing = (player.facing as Direction) || 'down';
    const facingChanged = newFacing !== this.facing;
    const movingChanged = player.isMoving !== this.isMoving;

    this.facing = newFacing;
    this.isMoving = player.isMoving;

    if (facingChanged || movingChanged) {
      this.refreshPlayerTexture();
    }

    const name = player.displayName || player.wallet.slice(0, 6);
    if (this.nameTag.text !== name) {
      this.nameTag.setText(name);
    }

    this.applyCompanionTexture(player.constellation);
  }

  interpolate(): void {
    const x = this.sprite.x + (this.targetX - this.sprite.x) * LERP_SPEED;
    const y = this.sprite.y + (this.targetY - this.sprite.y) * LERP_SPEED;

    this.sprite.setPosition(x, y);
    this.nameTag.setPosition(x, y + NAME_TAG_OFFSET_Y);

    const cTargetX = x + this.getCompanionOffsetX();
    const cTargetY = y + this.getCompanionOffsetY();
    this.companionSprite.x += (cTargetX - this.companionSprite.x) * 0.1;
    this.companionBaseY += (cTargetY - this.companionBaseY) * 0.1;

    const bob = Math.sin(this.scene.time.now * 0.003) * 0.5;
    this.companionSprite.y = this.companionBaseY + bob;

    if (this.facing === 'left') {
      this.companionSprite.setFlipX(true);
    } else if (this.facing === 'right') {
      this.companionSprite.setFlipX(false);
    }
  }

  show(): void {
    this.setAllVisible(true);
  }

  hide(): void {
    this.setAllVisible(false);
  }

  destroy(): void {
    this.sprite.destroy();
    this.nameTag.destroy();
    this.companionSprite.destroy();
  }

  private setAllVisible(visible: boolean): void {
    this.sprite.setVisible(visible);
    this.nameTag.setVisible(visible);
    this.companionSprite.setVisible(visible);
  }

  private refreshPlayerTexture(): void {
    if (this.isMoving) {
      const animKey = `player-walk-${this.facing}`;
      if (this.scene.anims.exists(animKey)) {
        this.sprite.play(animKey, true);
      }
    } else {
      this.sprite.stop();
      this.sprite.setTexture(`player-${this.facing}-0`);
    }
  }

  private applyCompanionTexture(constellation: string): void {
    if (!constellation || constellation === this.constellation) return;
    this.constellation = constellation;
    const key = `companion-${constellation}`;
    if (this.scene.textures.exists(key)) {
      this.companionSprite.setTexture(key);
    }
  }

  private getCompanionOffsetX(): number {
    switch (this.facing) {
      case 'left': return COMPANION_OFFSET;
      case 'right': return -COMPANION_OFFSET;
      default: return COMPANION_OFFSET / 2;
    }
  }

  private getCompanionOffsetY(): number {
    switch (this.facing) {
      case 'up': return COMPANION_OFFSET;
      case 'down': return -COMPANION_OFFSET;
      default: return COMPANION_OFFSET / 2;
    }
  }
}

interface TrackedPlayer {
  data: RemotePlayer;
  spriteIndex: number;
}

export class OtherPlayersManager {
  private scene: Phaser.Scene;
  private pool: OtherPlayerSprite[] = [];
  private tracked = new Map<string, TrackedPlayer>();
  private assignedSprites = new Map<number, string>();
  private freeIndices: number[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    for (let i = 0; i < POOL_INITIAL_SIZE; i++) {
      this.pool.push(new OtherPlayerSprite(scene));
      this.freeIndices.push(i);
    }
  }

  addPlayer(player: RemotePlayer): void {
    if (this.tracked.has(player.sessionId)) {
      this.updatePlayer(player);
      return;
    }
    this.tracked.set(player.sessionId, { data: player, spriteIndex: -1 });
  }

  removePlayer(sessionId: string): void {
    const entry = this.tracked.get(sessionId);
    if (!entry) return;

    if (entry.spriteIndex >= 0) {
      this.releaseSprite(entry.spriteIndex);
      entry.spriteIndex = -1;
    }
    this.tracked.delete(sessionId);
  }

  updatePlayer(player: RemotePlayer): void {
    const entry = this.tracked.get(player.sessionId);
    if (!entry) return;

    entry.data = player;

    if (entry.spriteIndex >= 0) {
      this.pool[entry.spriteIndex].syncState(player);
    }
  }

  update(camera: Phaser.Cameras.Scene2D.Camera): void {
    const view = camera.worldView;

    for (const [sessionId, entry] of this.tracked) {
      const onCamera = this.isOnCamera(entry.data, view);

      if (onCamera && entry.spriteIndex < 0) {
        const idx = this.acquireSprite();
        if (idx >= 0) {
          entry.spriteIndex = idx;
          this.assignedSprites.set(idx, sessionId);
          this.pool[idx].assign(entry.data);
        }
      } else if (!onCamera && entry.spriteIndex >= 0) {
        this.releaseSprite(entry.spriteIndex);
        this.assignedSprites.delete(entry.spriteIndex);
        entry.spriteIndex = -1;
      }

      if (entry.spriteIndex >= 0) {
        this.pool[entry.spriteIndex].interpolate();
      }
    }
  }

  clear(): void {
    for (const [, entry] of this.tracked) {
      if (entry.spriteIndex >= 0) {
        this.releaseSprite(entry.spriteIndex);
      }
    }
    this.tracked.clear();
    this.assignedSprites.clear();
  }

  destroy(): void {
    this.clear();
    for (const sprite of this.pool) {
      sprite.destroy();
    }
    this.pool = [];
    this.freeIndices = [];
  }

  getActiveCount(): number {
    return this.tracked.size;
  }

  private acquireSprite(): number {
    if (this.freeIndices.length > 0) {
      return this.freeIndices.pop()!;
    }
    const idx = this.pool.length;
    this.pool.push(new OtherPlayerSprite(this.scene));
    return idx;
  }

  private releaseSprite(index: number): void {
    this.pool[index].release();
    this.freeIndices.push(index);
  }

  private isOnCamera(player: RemotePlayer, view: Phaser.Geom.Rectangle): boolean {
    return (
      player.x >= view.x - CAMERA_MARGIN &&
      player.x <= view.right + CAMERA_MARGIN &&
      player.y >= view.y - CAMERA_MARGIN &&
      player.y <= view.bottom + CAMERA_MARGIN
    );
  }
}
