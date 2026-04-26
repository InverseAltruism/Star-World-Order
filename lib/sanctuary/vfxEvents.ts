/**
 * Shared companion-VFX event contract for Sanctuary V2 + V3.
 *
 * Gameplay code (radial menu, quest claim, level-up, equip flash, etc.)
 * emits a single `companion:vfx` event via {@link emitCompanionVfx}. The
 * active visual track listens via {@link onCompanionVfx} and renders
 * whatever is appropriate to its style:
 *
 *   - V2 (cosmic placeholder palette): emoji/CSS overlay (current behaviour)
 *   - V3 (Forgotten-Memories palette): FM-palette sprite sheets via
 *     `[SWO_V3_VFX_SPRITES]` — sheets differ per track, but trigger contract
 *     is shared.
 *
 * This file is the *trigger contract only* — kinds, payload shape, publisher,
 * subscriber. Renderers (and per-track sprite assets) live elsewhere.
 */

/**
 * Visual-effect kinds. Add new kinds here as new triggers arise. Keep the
 * list disjoint and self-describing — never overload one kind for two
 * different feelings.
 */
export type CompanionVfxKind =
  | 'sparkle'   // generic positive feedback (pet success, small bond gain)
  | 'heart'     // affection burst (large bond gain, milestone reached)
  | 'food'      // feed action / item received
  | 'level-up'  // level milestone celebration (largest VFX)
  | 'glow'      // ambient aura / equip flash
  | 'dust';     // movement / scene-transition footstep

export const COMPANION_VFX_KINDS: readonly CompanionVfxKind[] = [
  'sparkle',
  'heart',
  'food',
  'level-up',
  'glow',
  'dust',
];

/**
 * Standard event name. One event keeps the EventBus surface small and lets
 * a renderer subscribe once and dispatch internally on `payload.kind`.
 */
export const COMPANION_VFX_EVENT = 'companion:vfx';

export interface CompanionVfxPayload {
  /** What kind of VFX to render. See {@link CompanionVfxKind}. */
  kind: CompanionVfxKind;
  /** Screen-space X in pixels (from canvas/overlay top-left). */
  x: number;
  /** Screen-space Y in pixels. */
  y: number;
  /** How long the effect should run, ms. Renderers may clamp. */
  durationMs?: number;
  /**
   * Optional accent color override (CSS color string). Renderers may ignore
   * this if their palette doesn't compose with the override (V3 FM-palette
   * sheets typically will).
   */
  color?: string;
  /**
   * Free-form provenance string ("pet", "feed", "quest-claim", etc.) used
   * for logging/analytics, not for rendering. Optional.
   */
  source?: string;
}

/**
 * EventEmitter-shaped object. `Phaser.Events.EventEmitter` satisfies this,
 * as does any node-style EventEmitter or duck-typed test mock — kept minimal
 * so this contract has no Phaser dependency.
 */
export interface VfxEventBus {
  emit(event: string, payload: CompanionVfxPayload): unknown;
  on(event: string, listener: (p: CompanionVfxPayload) => void, ctx?: unknown): unknown;
  off(event: string, listener: (p: CompanionVfxPayload) => void, ctx?: unknown): unknown;
}

function isKnownKind(kind: unknown): kind is CompanionVfxKind {
  return typeof kind === 'string' && (COMPANION_VFX_KINDS as readonly string[]).includes(kind);
}

/**
 * Canonical publisher. Always use this instead of `bus.emit(COMPANION_VFX_EVENT, …)`
 * directly so future contract changes (extra fields, normalization,
 * throttling, dev-mode tracing) only need to change in one place.
 *
 * Unknown kinds are coerced to `sparkle` rather than thrown — gameplay paths
 * must never explode on a bad VFX call.
 */
export function emitCompanionVfx(bus: VfxEventBus, payload: CompanionVfxPayload): void {
  const safe: CompanionVfxPayload = isKnownKind(payload.kind)
    ? payload
    : { ...payload, kind: 'sparkle' };
  bus.emit(COMPANION_VFX_EVENT, safe);
}

/**
 * Canonical subscriber. Returns an unsubscribe function for symmetry with
 * React effect cleanup patterns:
 *
 *   useEffect(() => onCompanionVfx(EventBus, render), []);
 */
export function onCompanionVfx(
  bus: VfxEventBus,
  listener: (payload: CompanionVfxPayload) => void,
  ctx?: unknown,
): () => void {
  bus.on(COMPANION_VFX_EVENT, listener, ctx);
  return () => {
    bus.off(COMPANION_VFX_EVENT, listener, ctx);
  };
}
