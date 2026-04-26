/**
 * SWO_V2_DESLOP_SHADER
 *
 * Phaser PostFX pipeline that quantises the rendered canvas to a fixed
 * 16-color SWO palette, optionally with 4x4 Bayer-matrix ordered dithering.
 * Attach to a camera with `cam.setPostPipeline(DeslopPostFXPipeline)` and
 * detach with `cam.removePostPipeline(DeslopPostFXPipeline)`. Toggling does
 * not require restarting the scene.
 *
 * Registered in `game/config/GameConfig.ts` under the `pipeline:` key so
 * Phaser auto-installs the class on `Phaser.Game` boot.
 */

import Phaser from 'phaser';

import {
  DESLOP_PALETTE_HEX,
  PALETTE_SIZE,
  paletteToFloat32,
} from './deslopPalette';

export const DESLOP_PIPELINE_KEY = 'DeslopPostFX';

/**
 * GLSL ES 1.00 fragment shader. Two passes:
 *  1. Optional 4x4 Bayer offset added to the source RGB to scatter
 *     quantisation error.
 *  2. Nearest-color search across the 16-color palette uniform.
 * The if/else cascade for the Bayer matrix is verbose but avoids dynamic
 * matrix indexing, which has spotty support across mid-tier GPUs.
 */
const FRAG_SHADER = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform vec3 uPalette[${PALETTE_SIZE}];
uniform float uDitherStrength;

varying vec2 outTexCoord;

float bayerOffset(vec2 fragPos) {
  vec2 p = mod(fragPos, 4.0);
  int x = int(p.x);
  int y = int(p.y);
  float v = 0.0;
  if (y == 0) {
    if (x == 0) v = 0.0; else if (x == 1) v = 8.0; else if (x == 2) v = 2.0; else v = 10.0;
  } else if (y == 1) {
    if (x == 0) v = 12.0; else if (x == 1) v = 4.0; else if (x == 2) v = 14.0; else v = 6.0;
  } else if (y == 2) {
    if (x == 0) v = 3.0; else if (x == 1) v = 11.0; else if (x == 2) v = 1.0; else v = 9.0;
  } else {
    if (x == 0) v = 15.0; else if (x == 1) v = 7.0; else if (x == 2) v = 13.0; else v = 5.0;
  }
  return (v / 16.0) - 0.5;
}

void main() {
  vec4 src = texture2D(uMainSampler, outTexCoord);
  float d = bayerOffset(gl_FragCoord.xy) * uDitherStrength;
  vec3 dithered = clamp(src.rgb + vec3(d), 0.0, 1.0);

  vec3 best = uPalette[0];
  float bestDist = 1000.0;
  for (int i = 0; i < ${PALETTE_SIZE}; i++) {
    vec3 diff = dithered - uPalette[i];
    float dist = dot(diff, diff);
    if (dist < bestDist) {
      bestDist = dist;
      best = uPalette[i];
    }
  }

  gl_FragColor = vec4(best, src.a);
}
`;

/** A non-zero default produces visibly dithered banding without obvious noise. */
const DEFAULT_DITHER_STRENGTH = 0.06;

export class DeslopPostFXPipeline extends Phaser.Renderer.WebGL.Pipelines
  .PostFXPipeline {
  private ditherStrength = DEFAULT_DITHER_STRENGTH;
  private readonly paletteFlat = paletteToFloat32();

  constructor(game: Phaser.Game) {
    super({
      game,
      name: DESLOP_PIPELINE_KEY,
      fragShader: FRAG_SHADER,
    });
  }

  /** Per-frame uniform refresh — palette is constant, dither strength may toggle. */
  onPreRender(): void {
    this.set3fv('uPalette', this.paletteFlat);
    this.set1f('uDitherStrength', this.ditherStrength);
  }

  /** 0 disables Bayer dithering; ~0.06 is a good visible default. */
  setDitherStrength(v: number): void {
    this.ditherStrength = Math.max(0, Math.min(1, v));
  }
}

// Re-export so consumers can do a single import for both the class and the palette.
export { DESLOP_PALETTE_HEX, PALETTE_SIZE };
