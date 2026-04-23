import Phaser from 'phaser';

const FOLLOW_LERP = 0.15;
const FOLLOW_OFFSET_X = -24;
const FOLLOW_OFFSET_Y = 12;

const CONSTELLATIONS = [
  'aether', 'spectra', 'solveil', 'nebulu', 'chroma',
  'rose', 'monflare', 'auracore', 'parallel', 'prime',
] as const;

export type Constellation = (typeof CONSTELLATIONS)[number];

export { CONSTELLATIONS };

export class CompanionSprite extends Phaser.GameObjects.Sprite {
  private targetX: number;
  private targetY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, constellation?: Constellation) {
    const textureKey = constellation ? `companion-${constellation}` : 'companion-fallback';
    super(scene, x, y, textureKey);

    this.targetX = x;
    this.targetY = y;

    scene.add.existing(this);
    this.setDepth(9);
    this.setScale(1.5);
  }

  static loadAssets(scene: Phaser.Scene): void {
    for (const c of CONSTELLATIONS) {
      scene.load.image(`companion-${c}`, `/sanctuary/companions/${c}/idle.png`);
    }
  }

  static generateFallbackTexture(scene: Phaser.Scene): void {
    const size = 32;
    const g = scene.make.graphics({ x: 0, y: 0 });

    // Gold star shape
    g.fillStyle(0xffd700);
    const cx = size / 2;
    const cy = size / 2;
    const outerR = 12;
    const innerR = 5;

    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();

    // Inner glow
    g.fillStyle(0xffee88);
    g.fillCircle(cx, cy, 4);

    g.generateTexture('companion-fallback', size, size);
    g.destroy();
  }

  setConstellation(constellation: Constellation): void {
    const key = `companion-${constellation}`;
    if (this.scene.textures.exists(key)) {
      this.setTexture(key);
    }
  }

  followPlayer(playerX: number, playerY: number): void {
    this.targetX = playerX + FOLLOW_OFFSET_X;
    this.targetY = playerY + FOLLOW_OFFSET_Y;
  }

  update(): void {
    this.x += (this.targetX - this.x) * FOLLOW_LERP;
    this.y += (this.targetY - this.y) * FOLLOW_LERP;
  }
}
