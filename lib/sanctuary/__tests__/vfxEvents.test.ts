// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

import {
  COMPANION_VFX_EVENT,
  COMPANION_VFX_KINDS,
  emitCompanionVfx,
  onCompanionVfx,
  type CompanionVfxPayload,
  type VfxEventBus,
} from '../vfxEvents';

interface TestBus extends VfxEventBus {
  emitted: Array<{ event: string; payload: CompanionVfxPayload }>;
}

function makeBus(): TestBus {
  const listeners = new Map<string, Array<(p: CompanionVfxPayload) => void>>();
  const emitted: Array<{ event: string; payload: CompanionVfxPayload }> = [];
  const bus: TestBus = {
    emitted,
    emit(event, payload) {
      emitted.push({ event, payload });
      (listeners.get(event) ?? []).forEach((fn) => fn(payload));
      return true;
    },
    on(event, listener) {
      const arr = listeners.get(event) ?? [];
      arr.push(listener);
      listeners.set(event, arr);
      return bus;
    },
    off(event, listener) {
      const arr = listeners.get(event) ?? [];
      listeners.set(event, arr.filter((l) => l !== listener));
      return bus;
    },
  };
  return bus;
}

describe('companion VFX event contract', () => {
  it('exposes the canonical event name', () => {
    expect(COMPANION_VFX_EVENT).toBe('companion:vfx');
  });

  it('lists all known kinds in a stable order', () => {
    expect(COMPANION_VFX_KINDS).toEqual([
      'sparkle',
      'heart',
      'food',
      'level-up',
      'glow',
      'dust',
    ]);
  });

  it('emits the payload through to subscribers unchanged for known kinds', () => {
    const bus = makeBus();
    const spy = vi.fn();
    onCompanionVfx(bus, spy);

    const payload: CompanionVfxPayload = {
      kind: 'heart',
      x: 100,
      y: 200,
      durationMs: 600,
      color: '#ff66aa',
      source: 'pet',
    };
    emitCompanionVfx(bus, payload);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(payload);
    expect(bus.emitted).toEqual([{ event: COMPANION_VFX_EVENT, payload }]);
  });

  it('coerces unknown kinds to sparkle rather than throwing', () => {
    const bus = makeBus();
    const spy = vi.fn();
    onCompanionVfx(bus, spy);

    emitCompanionVfx(bus, {
      // @ts-expect-error - intentional unknown kind for runtime guard test
      kind: 'wat',
      x: 0,
      y: 0,
    });

    expect(spy).toHaveBeenCalledWith({ kind: 'sparkle', x: 0, y: 0 });
  });

  it('returns an unsubscribe function that detaches the listener', () => {
    const bus = makeBus();
    const spy = vi.fn();
    const unsubscribe = onCompanionVfx(bus, spy);
    unsubscribe();

    emitCompanionVfx(bus, { kind: 'sparkle', x: 0, y: 0 });

    expect(spy).not.toHaveBeenCalled();
  });

  it('supports multiple independent subscribers', () => {
    const bus = makeBus();
    const a = vi.fn();
    const b = vi.fn();
    onCompanionVfx(bus, a);
    onCompanionVfx(bus, b);

    emitCompanionVfx(bus, { kind: 'glow', x: 5, y: 5 });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('every kind round-trips end-to-end', () => {
    const bus = makeBus();
    const seen: string[] = [];
    onCompanionVfx(bus, (p) => seen.push(p.kind));

    for (const kind of COMPANION_VFX_KINDS) {
      emitCompanionVfx(bus, { kind, x: 0, y: 0 });
    }

    expect(seen).toEqual([...COMPANION_VFX_KINDS]);
  });
});
