// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  ACTION_STATE_CLASS,
  SHELL_MOBILE_BREAKPOINT_PX,
  SHELL_ZONES,
  actionAriaDisabled,
  actionStateClass,
  bondHint,
  bondProgress,
  resolveActionState,
  shellLayoutFor,
  zoneOrderFor,
  type ActionVisualState,
  type ShellZone,
} from '../companionShell';

describe('shellLayoutFor', () => {
  it('returns desktop at and above the breakpoint', () => {
    expect(shellLayoutFor(SHELL_MOBILE_BREAKPOINT_PX)).toBe('desktop');
    expect(shellLayoutFor(SHELL_MOBILE_BREAKPOINT_PX + 200)).toBe('desktop');
    expect(shellLayoutFor(1920)).toBe('desktop');
  });

  it('returns mobile below the breakpoint', () => {
    expect(shellLayoutFor(SHELL_MOBILE_BREAKPOINT_PX - 1)).toBe('mobile');
    expect(shellLayoutFor(420)).toBe('mobile');
    expect(shellLayoutFor(320)).toBe('mobile');
  });

  it('falls back to mobile for invalid widths (SSR / 0px guard)', () => {
    expect(shellLayoutFor(0)).toBe('mobile');
    expect(shellLayoutFor(-10)).toBe('mobile');
    expect(shellLayoutFor(Number.NaN)).toBe('mobile');
    expect(shellLayoutFor(Number.POSITIVE_INFINITY)).toBe('mobile');
  });
});

describe('zoneOrderFor', () => {
  it('contains every shell zone exactly once for both layouts', () => {
    for (const layout of ['desktop', 'mobile'] as const) {
      const order = zoneOrderFor(layout);
      expect(order).toHaveLength(SHELL_ZONES.length);
      const set = new Set<ShellZone>(order);
      expect(set.size).toBe(SHELL_ZONES.length);
      for (const z of SHELL_ZONES) expect(set.has(z)).toBe(true);
    }
  });

  it('puts the action dock right under the viewport on mobile (thumb-down feel)', () => {
    const order = zoneOrderFor('mobile');
    const viewportIdx = order.indexOf('viewport');
    const actionsIdx = order.indexOf('actions');
    expect(actionsIdx).toBe(viewportIdx + 1);
  });

  it('keeps needs alongside the viewport on desktop', () => {
    const order = zoneOrderFor('desktop');
    const viewportIdx = order.indexOf('viewport');
    const needsIdx = order.indexOf('needs');
    expect(needsIdx).toBe(viewportIdx + 1);
  });

  it('always leads with the header and ends with the journal teaser', () => {
    for (const layout of ['desktop', 'mobile'] as const) {
      const order = zoneOrderFor(layout);
      expect(order[0]).toBe('header');
      expect(order[order.length - 1]).toBe('journal');
    }
  });
});

describe('resolveActionState', () => {
  it('returns idle when nothing is in flight and the companion is awake', () => {
    expect(
      resolveActionState({ id: 'feed', interacting: null, isSleeping: false }),
    ).toBe('idle');
  });

  it('returns busy for the action that is currently in flight', () => {
    expect(
      resolveActionState({ id: 'pet', interacting: 'pet', isSleeping: false }),
    ).toBe('busy');
  });

  it('disables the other actions while one is in flight', () => {
    expect(
      resolveActionState({ id: 'talk', interacting: 'pet', isSleeping: false }),
    ).toBe('disabled');
  });

  it('locks every non-sleep action while the companion is sleeping', () => {
    for (const id of ['feed', 'pet', 'talk', 'play'] as const) {
      expect(
        resolveActionState({ id, interacting: null, isSleeping: true }),
      ).toBe('sleep-locked');
    }
    expect(
      resolveActionState({
        id: 'sleep',
        interacting: null,
        isSleeping: true,
      }),
    ).toBe('idle');
  });

  it('honours an explicit unavailable flag (no wallet / companion missing)', () => {
    expect(
      resolveActionState({
        id: 'feed',
        interacting: null,
        isSleeping: false,
        unavailable: true,
      }),
    ).toBe('disabled');
  });
});

describe('actionStateClass / actionAriaDisabled', () => {
  it('maps every visual state to a non-empty className', () => {
    const states: ActionVisualState[] = [
      'idle',
      'hover',
      'pressed',
      'busy',
      'sleep-locked',
      'disabled',
    ];
    for (const s of states) {
      const cls = actionStateClass(s);
      expect(cls).toBeTruthy();
      expect(cls).toBe(ACTION_STATE_CLASS[s]);
      expect(cls.startsWith('companion-action-btn--')).toBe(true);
    }
  });

  it('exposes aria-disabled for non-actionable states', () => {
    expect(actionAriaDisabled('idle')).toBe(false);
    expect(actionAriaDisabled('hover')).toBe(false);
    expect(actionAriaDisabled('pressed')).toBe(false);
    expect(actionAriaDisabled('busy')).toBe(true);
    expect(actionAriaDisabled('sleep-locked')).toBe(true);
    expect(actionAriaDisabled('disabled')).toBe(true);
  });
});

describe('bondProgress', () => {
  it('clamps and identifies the next milestone for a fresh bond', () => {
    const p = bondProgress(0);
    expect(p.score).toBe(0);
    expect(p.pct).toBe(0);
    expect(p.nextMilestone).toBe(25);
    expect(p.reachedMilestone).toBeNull();
  });

  it('reports the correct reached/next milestone mid-range', () => {
    const p = bondProgress(60);
    expect(p.score).toBe(60);
    expect(p.reachedMilestone).toBe(50);
    expect(p.nextMilestone).toBe(75);
  });

  it('caps at 100 with no further milestone', () => {
    const p = bondProgress(125);
    expect(p.score).toBe(100);
    expect(p.pct).toBe(100);
    expect(p.reachedMilestone).toBe(100);
    expect(p.nextMilestone).toBeNull();
  });

  it('treats null/NaN as zero progress', () => {
    expect(bondProgress(null).score).toBe(0);
    expect(bondProgress(undefined).score).toBe(0);
    expect(bondProgress(Number.NaN).score).toBe(0);
  });
});

describe('bondHint', () => {
  it('returns null while still far from the next milestone', () => {
    const p = bondProgress(10);
    expect(bondHint(p, 'Mochi')).toBeNull();
  });

  it('nudges the player when within 10 of the next milestone', () => {
    const p = bondProgress(68);
    const hint = bondHint(p, 'Mochi');
    expect(hint).toBeTruthy();
    expect(hint).toContain('75');
    expect(hint).toContain('Mochi');
  });

  it('celebrates a maxed bond, returns null at every other plateau', () => {
    expect(bondHint(bondProgress(100), 'Mochi')).toContain('Devoted');
    // a plateau at 50 with a far-off next milestone is silent
    expect(bondHint(bondProgress(50), 'Mochi')).toBeNull();
  });

  it('falls back to a generic name when none is provided', () => {
    const hint = bondHint(bondProgress(95), '');
    expect(hint).toBeTruthy();
    expect(hint).toContain('them');
  });
});
