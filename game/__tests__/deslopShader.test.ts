import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

import {
  DESLOP_PALETTE_HEX,
  PALETTE_SIZE,
  DESLOP_DEFAULT_ON,
  DESLOP_STORAGE_KEY,
  hexToRgbNormalised,
  paletteToFloat32,
  nearestPaletteIndex,
  isDeslopEnabled,
} from '../shaders/deslopPalette';

describe('deslop palette', () => {
  it('exports a fixed-size palette of 6-digit hex strings', () => {
    expect(PALETTE_SIZE).toBe(DESLOP_PALETTE_HEX.length);
    expect(PALETTE_SIZE).toBeGreaterThanOrEqual(8);
    for (const hex of DESLOP_PALETTE_HEX) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('hexToRgbNormalised maps hex to floats in [0,1]', () => {
    expect(hexToRgbNormalised('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgbNormalised('#ffffff')).toEqual([1, 1, 1]);
    const [r, g, b] = hexToRgbNormalised('#ffd700');
    expect(r).toBeCloseTo(1, 5);
    expect(g).toBeCloseTo(215 / 255, 5);
    expect(b).toBeCloseTo(0, 5);
  });

  it('paletteToFloat32 packs PALETTE_SIZE * 3 floats', () => {
    const flat = paletteToFloat32();
    expect(flat).toBeInstanceOf(Float32Array);
    expect(flat.length).toBe(PALETTE_SIZE * 3);
    // First palette entry should match DESLOP_PALETTE_HEX[0] exactly.
    const [r0, g0, b0] = hexToRgbNormalised(DESLOP_PALETTE_HEX[0]);
    expect(flat[0]).toBeCloseTo(r0, 5);
    expect(flat[1]).toBeCloseTo(g0, 5);
    expect(flat[2]).toBeCloseTo(b0, 5);
  });

  it('nearestPaletteIndex returns a palette index for any input', () => {
    const idx = nearestPaletteIndex(0.5, 0.5, 0.5);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(PALETTE_SIZE);
  });

  it('nearestPaletteIndex maps an exact palette color to itself', () => {
    const [r, g, b] = hexToRgbNormalised(DESLOP_PALETTE_HEX[7]); // cyan
    expect(nearestPaletteIndex(r, g, b)).toBe(7);
  });

  it('throws on a malformed hex literal', () => {
    expect(() => hexToRgbNormalised('#fff')).toThrow();
  });
});

describe('isDeslopEnabled — toggle resolution', () => {
  it('falls back to defaultOn when neither URL nor storage is set', () => {
    expect(isDeslopEnabled({})).toBe(DESLOP_DEFAULT_ON);
    expect(isDeslopEnabled({ defaultOn: true })).toBe(true);
    expect(isDeslopEnabled({ defaultOn: false })).toBe(false);
  });

  it('honours ?deslop=1 URL flag', () => {
    expect(isDeslopEnabled({ search: '?deslop=1', defaultOn: false })).toBe(true);
    expect(isDeslopEnabled({ search: '?v=2&deslop=1', defaultOn: false })).toBe(true);
    expect(isDeslopEnabled({ search: '?deslop=true' })).toBe(true);
  });

  it('honours ?deslop=0 URL flag (overrides defaultOn)', () => {
    expect(isDeslopEnabled({ search: '?deslop=0', defaultOn: true })).toBe(false);
    expect(isDeslopEnabled({ search: '?deslop=false', defaultOn: true })).toBe(false);
  });

  it('falls through to localStorage when URL flag is absent', () => {
    const get = (key: string) => (key === DESLOP_STORAGE_KEY ? '1' : null);
    expect(isDeslopEnabled({ localStorageGet: get, defaultOn: false })).toBe(true);
  });

  it('URL flag takes precedence over localStorage', () => {
    const get = () => '1';
    expect(
      isDeslopEnabled({ search: '?deslop=0', localStorageGet: get, defaultOn: true }),
    ).toBe(false);
  });

  it('ignores nonsense values and falls through to default', () => {
    expect(isDeslopEnabled({ search: '?deslop=banana', defaultOn: true })).toBe(true);
    expect(
      isDeslopEnabled({ localStorageGet: () => 'banana', defaultOn: true }),
    ).toBe(true);
  });
});

describe('DeslopPostFXPipeline source — wiring guarantees', () => {
  // Source-level smoke tests mirror the cosmeticSystem.test.ts pattern.
  // We can't boot Phaser/WebGL in node, but we can guarantee that the
  // critical glue (config registration, camera attach/detach, EventBus
  // toggle) is present.
  const pipelineSource = fs.readFileSync(
    new URL('../shaders/DeslopPostFX.ts', import.meta.url),
    'utf-8',
  );
  const configSource = fs.readFileSync(
    new URL('../config/GameConfig.ts', import.meta.url),
    'utf-8',
  );
  const worldSource = fs.readFileSync(
    new URL('../scenes/WorldScene.ts', import.meta.url),
    'utf-8',
  );

  it('pipeline class extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline', () => {
    expect(pipelineSource).toMatch(/extends Phaser\.Renderer\.WebGL\.Pipelines[\s\S]{0,40}\.PostFXPipeline/);
  });

  it('pipeline declares a fragShader string', () => {
    expect(pipelineSource).toContain('fragShader: FRAG_SHADER');
  });

  it('GameConfig registers the pipeline under the pipeline: key', () => {
    expect(configSource).toContain('pipeline:');
    expect(configSource).toContain('DESLOP_PIPELINE_KEY');
    expect(configSource).toContain('DeslopPostFXPipeline');
  });

  it('WorldScene attaches the pipeline via setPostPipeline and detaches via removePostPipeline', () => {
    expect(worldSource).toContain('cam.setPostPipeline(DeslopPostFXPipeline)');
    expect(worldSource).toContain('cam.removePostPipeline(DESLOP_PIPELINE_KEY)');
  });

  it('WorldScene listens for runtime toggle on EventBus without scene restart', () => {
    expect(worldSource).toContain("'deslop-toggle'");
    // No scene.restart / scene.stop used by the toggle path.
    const toggleBlock = worldSource.match(/setupDeslopShader[\s\S]+?(?=\n  private |\n  public |\n}\n)/);
    expect(toggleBlock).not.toBeNull();
    expect(toggleBlock?.[0] ?? '').not.toMatch(/scene\.restart/);
  });

  it('WorldScene resolves toggle via the shared isDeslopEnabledFromBrowser helper', () => {
    expect(worldSource).toContain('isDeslopEnabledFromBrowser');
  });
});
