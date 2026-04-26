/**
 * SWO_V2_DESLOP_SHADER — palette + toggle plumbing
 *
 * This module is intentionally Phaser-free so it can be unit tested in node
 * without booting a renderer. The Phaser pipeline class lives in
 * `DeslopPostFX.ts` and consumes the constants exported here.
 */

export type DeslopRGB = readonly [number, number, number];

/**
 * Fixed N-color SWO palette used by the deslop post-FX shader.
 * Colors are normalised RGB in [0, 1]. Length must stay at PALETTE_SIZE
 * because the GLSL fragment shader unrolls the loop against that constant.
 */
export const DESLOP_PALETTE_HEX: readonly string[] = [
  '#0a0015', // 0  deep night (matches game bg)
  '#1a0a2e', // 1  dark purple
  '#2a1845', // 2  mid purple
  '#4a2a7a', // 3  purple
  '#7a4ab8', // 4  lavender
  '#9966ff', // 5  light lavender (UI accent)
  '#c9a6ff', // 6  pale purple
  '#00f7ff', // 7  cyan (UI accent)
  '#44ff88', // 8  green (UI accent)
  '#ffd700', // 9  gold (UI accent)
  '#ff6688', // 10 pink
  '#ff3344', // 11 red
  '#ffffff', // 12 white
  '#aaaaaa', // 13 light gray
  '#555566', // 14 mid gray
  '#1a1a2a', // 15 dark gray-blue
];

export const PALETTE_SIZE = DESLOP_PALETTE_HEX.length;

export function hexToRgbNormalised(hex: string): DeslopRGB {
  const h = hex.replace(/^#/, '');
  if (h.length !== 6) throw new Error(`Invalid palette hex: ${hex}`);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r / 255, g / 255, b / 255] as const;
}

export function paletteToFloat32(): Float32Array {
  const out = new Float32Array(PALETTE_SIZE * 3);
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const [r, g, b] = hexToRgbNormalised(DESLOP_PALETTE_HEX[i]);
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  return out;
}

/** Picks the palette index whose RGB has the smallest squared distance to the input. */
export function nearestPaletteIndex(r: number, g: number, b: number): number {
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const [pr, pg, pb] = hexToRgbNormalised(DESLOP_PALETTE_HEX[i]);
    const dr = r - pr;
    const dg = g - pg;
    const db = b - pb;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ---- Toggle plumbing -------------------------------------------------------

const URL_PARAM = 'deslop';
export const DESLOP_STORAGE_KEY = 'swo_deslop';
/**
 * Default-on policy: per task spec, ship default-OFF (opt-in) until operator
 * A/B inspection signs off. Flip to `true` once that happens.
 */
export const DESLOP_DEFAULT_ON = false;

export interface DeslopToggleEnv {
  /** URL search string, e.g. `window.location.search`. Optional. */
  search?: string;
  /** Localstorage getter, so node tests can stub it. Optional. */
  localStorageGet?: (key: string) => string | null;
  /** Falls back to this if neither URL nor storage has an opinion. */
  defaultOn?: boolean;
}

function parseFlag(raw: string | null | undefined): boolean | null {
  if (raw == null) return null;
  const v = raw.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return null;
}

/**
 * Resolves the deslop toggle state. URL flag (?deslop=…) wins over
 * localStorage; localStorage wins over the default. Used by both the runtime
 * scene wiring and the unit tests.
 */
export function isDeslopEnabled(env: DeslopToggleEnv = {}): boolean {
  const { search, localStorageGet, defaultOn = DESLOP_DEFAULT_ON } = env;

  if (search) {
    const params = new URLSearchParams(search);
    const fromUrl = parseFlag(params.get(URL_PARAM));
    if (fromUrl !== null) return fromUrl;
  }

  if (localStorageGet) {
    const fromStorage = parseFlag(localStorageGet(DESLOP_STORAGE_KEY));
    if (fromStorage !== null) return fromStorage;
  }

  return defaultOn;
}

/** Browser convenience that wires `window.location.search` and `localStorage`. */
export function isDeslopEnabledFromBrowser(): boolean {
  if (typeof window === 'undefined') return DESLOP_DEFAULT_ON;
  return isDeslopEnabled({
    search: window.location.search,
    localStorageGet: (k) => {
      try {
        return window.localStorage.getItem(k);
      } catch {
        return null;
      }
    },
  });
}
