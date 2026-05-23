// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  resolveCompanionActionState,
  companionActionVariantClasses,
  formatCooldownBadge,
  companionActionPreferenceBadge,
  previewBondDelta,
  previewActionReward,
  COMPANION_ACTIONS,
  type CompanionActionId,
  type CompanionActionState,
} from '../companionAction';
import { makeSeededRng } from '../variableRewards';

const baseInput = (override: Partial<Parameters<typeof resolveCompanionActionState>[0]> = {}) => ({
  action: 'feed' as CompanionActionId,
  busy: null,
  isSleeping: false,
  ...override,
});

describe('COMPANION_ACTIONS metadata', () => {
  it('exposes the canonical 5-action lineup with no raw-emoji labels', () => {
    expect(COMPANION_ACTIONS.map((a) => a.id)).toEqual([
      'feed',
      'pet',
      'talk',
      'sleep',
      'play',
    ]);
    // Labels must be plain text — emoji as the *primary* affordance lives
    // in the SVG icon slot, not in the label string. This regression test
    // protects the post-RD-Batch-1 invariant.
    for (const a of COMPANION_ACTIONS) {
      expect(a.label).toMatch(/^[A-Za-z][A-Za-z\s'-]*$/);
      expect(a.blockedHint.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveCompanionActionState — idle', () => {
  it('returns idle/disabled=false when nothing else is happening', () => {
    const r = resolveCompanionActionState(baseInput());
    expect(r.state).toBe<CompanionActionState>('idle');
    expect(r.disabled).toBe(false);
    expect(r.badge).toBeNull();
    expect(r.ariaLabel).toBe('Feed');
    expect(r.title).toBe('Feed');
  });
});

describe('resolveCompanionActionState — pressed', () => {
  it('returns pressed/disabled=true when this action is the busy one', () => {
    const r = resolveCompanionActionState(baseInput({ busy: 'feed' }));
    expect(r.state).toBe<CompanionActionState>('pressed');
    expect(r.disabled).toBe(true);
    expect(r.title).toContain('working');
  });
});

describe('resolveCompanionActionState — disabled by sibling', () => {
  it('marks disabled when ANOTHER action is currently dispatching', () => {
    const r = resolveCompanionActionState(baseInput({ busy: 'pet' }));
    expect(r.state).toBe<CompanionActionState>('disabled');
    expect(r.disabled).toBe(true);
    expect(r.title.toLowerCase()).toContain('progress');
  });
});

describe('resolveCompanionActionState — sleeping', () => {
  it('marks non-sleep actions as sleeping when companion is asleep', () => {
    const r = resolveCompanionActionState(
      baseInput({ action: 'feed', isSleeping: true }),
    );
    expect(r.state).toBe<CompanionActionState>('sleeping');
    expect(r.disabled).toBe(true);
    // 💤 codepoint as the cozy status badge (not a CTA).
    expect(r.badge).toBe('\u{1F4A4}');
    expect(r.ariaLabel.toLowerCase()).toContain('sleeping');
  });

  it('does NOT block the sleep action while sleeping (still cozy idle)', () => {
    const r = resolveCompanionActionState(
      baseInput({ action: 'sleep', isSleeping: true }),
    );
    // Already-asleep edge: sleep button stays idle so the callsite can
    // present a "they're already dreaming" hint via its own copy.
    expect(r.state).toBe<CompanionActionState>('idle');
    expect(r.disabled).toBe(false);
  });
});

describe('resolveCompanionActionState — cooldown', () => {
  it('renders cooldown variant + compact "12s" badge when cooldown > 0', () => {
    const r = resolveCompanionActionState(
      baseInput({ cooldownSeconds: 12 }),
    );
    expect(r.state).toBe<CompanionActionState>('cooldown');
    expect(r.disabled).toBe(true);
    expect(r.badge).toBe('12s');
  });

  it('clamps fractional / negative cooldowns and falls back to idle on 0', () => {
    expect(
      resolveCompanionActionState(baseInput({ cooldownSeconds: 0 })).state,
    ).toBe('idle');
    expect(
      resolveCompanionActionState(baseInput({ cooldownSeconds: -3 })).state,
    ).toBe('idle');
    expect(
      resolveCompanionActionState(baseInput({ cooldownSeconds: 12.7 })).badge,
    ).toBe('12s');
  });
});

describe('resolveCompanionActionState — selected', () => {
  it('returns selected when caller asks AND nothing else is preempting', () => {
    const r = resolveCompanionActionState(baseInput({ isSelected: true }));
    expect(r.state).toBe<CompanionActionState>('selected');
    expect(r.disabled).toBe(false);
  });

  it('selected loses to pressed/disabled/sleeping/cooldown precedence', () => {
    expect(
      resolveCompanionActionState(
        baseInput({ isSelected: true, busy: 'feed' }),
      ).state,
    ).toBe('pressed');
    expect(
      resolveCompanionActionState(
        baseInput({ isSelected: true, busy: 'pet' }),
      ).state,
    ).toBe('disabled');
    expect(
      resolveCompanionActionState(
        baseInput({ isSelected: true, isSleeping: true }),
      ).state,
    ).toBe('sleeping');
    expect(
      resolveCompanionActionState(
        baseInput({ isSelected: true, cooldownSeconds: 5 }),
      ).state,
    ).toBe('cooldown');
  });
});

describe('companionActionVariantClasses', () => {
  it('emits a unique class per variant so styling stays isolated', () => {
    const states: CompanionActionState[] = [
      'idle',
      'hover',
      'pressed',
      'disabled',
      'sleeping',
      'cooldown',
      'selected',
    ];
    const classes = states.map(companionActionVariantClasses);
    expect(new Set(classes).size).toBe(states.length);
    for (const c of classes) {
      expect(c.startsWith('companion-action--')).toBe(true);
    }
  });
});

describe('formatCooldownBadge', () => {
  it('formats seconds, minutes, and hours compactly', () => {
    expect(formatCooldownBadge(0)).toBe('');
    expect(formatCooldownBadge(7)).toBe('7s');
    expect(formatCooldownBadge(59)).toBe('59s');
    expect(formatCooldownBadge(60)).toBe('1m');
    expect(formatCooldownBadge(3599)).toBe('59m');
    expect(formatCooldownBadge(3600)).toBe('1h');
    expect(formatCooldownBadge(7200)).toBe('2h');
  });
});

describe('companionActionPreferenceBadge', () => {
  it('returns a distinct glyph for loved/liked/disliked/hated', () => {
    const loved = companionActionPreferenceBadge('loved');
    const liked = companionActionPreferenceBadge('liked');
    const disliked = companionActionPreferenceBadge('disliked');
    const hated = companionActionPreferenceBadge('hated');
    const set = new Set([loved, liked, disliked, hated]);
    expect(set.size).toBe(4);
    expect(loved.length).toBeGreaterThan(0);
    expect(hated.length).toBeGreaterThan(0);
  });

  it('returns empty string for neutral / null / undefined', () => {
    expect(companionActionPreferenceBadge('neutral')).toBe('');
    expect(companionActionPreferenceBadge(null)).toBe('');
    expect(companionActionPreferenceBadge(undefined)).toBe('');
  });
});

describe('previewBondDelta', () => {
  it('loved preview is 4× neutral preview at same baseline', () => {
    const neutral = previewBondDelta({ baseline: 0.5, preference: 'neutral' });
    const loved = previewBondDelta({ baseline: 0.5, preference: 'loved' });
    expect(loved).toBeCloseTo(neutral * 4);
  });

  it('hated preview is negative', () => {
    expect(previewBondDelta({ baseline: 0.5, preference: 'hated' })).toBeLessThan(0);
  });

  it('need-boost stacks multiplicatively', () => {
    const flat = previewBondDelta({ baseline: 0.5, preference: 'loved' });
    const boosted = previewBondDelta({ baseline: 0.5, preference: 'loved', needBoosted: true });
    expect(boosted).toBeGreaterThan(flat);
  });

  it('Tired halves non-sleep bond preview (matches server-side gate)', () => {
    const fresh = previewBondDelta({ baseline: 0.5, preference: 'neutral', action: 'feed' });
    const tired = previewBondDelta({
      baseline: 0.5,
      preference: 'neutral',
      action: 'feed',
      isTired: true,
    });
    expect(tired).toBeCloseTo(fresh * 0.5);
  });

  it('Tired does NOT halve the sleep action (matches sleepDynamics gate)', () => {
    const fresh = previewBondDelta({ baseline: 0.5, preference: 'neutral', action: 'sleep' });
    const tired = previewBondDelta({
      baseline: 0.5,
      preference: 'neutral',
      action: 'sleep',
      isTired: true,
    });
    expect(tired).toBe(fresh);
  });
});

// ---------------------------------------------------------------------------
// [SWO_V2_SANCTUARY_VARIABLE_REWARDS] — previewActionReward layers the
// variable-reward roll on top of the preference + need-state + tired-mult
// floor. The floor must always survive untouched.
// ---------------------------------------------------------------------------

describe('previewActionReward — variable reward layered on floor', () => {
  it('returns the same floor bond as previewBondDelta', () => {
    const floor = previewBondDelta({
      baseline: 0.5,
      preference: 'loved',
      needBoosted: true,
      action: 'feed',
    });
    // Drive the RNG so neither bonus fires — we want to assert the floor
    // path returns the unmodified preference + need-state result.
    const rng = () => 0.99;
    const out = previewActionReward({
      baseline: 0.5,
      preference: 'loved',
      needBoosted: true,
      action: 'feed',
      rng,
    });
    expect(out.floorBond).toBe(floor);
    expect(out.variableReward.tier).toBe('floor');
    expect(out.variableReward.bond).toBe(floor);
  });

  it('preserves floor even when a bonus rolls', () => {
    const floor = previewBondDelta({
      baseline: 0.5,
      preference: 'neutral',
      action: 'pet',
    });
    // Force bonus_star: trinket roll fails, star roll succeeds.
    const rolls = [0.99, 0.001, 0.5];
    let i = 0;
    const out = previewActionReward({
      baseline: 0.5,
      preference: 'neutral',
      action: 'pet',
      rng: () => rolls[i++ % rolls.length],
    });
    expect(out.floorBond).toBe(floor);
    expect(out.variableReward.tier).toBe('bonus_star');
    expect(out.variableReward.bond).toBe(floor); // variable layer never touches floor
    expect(out.variableReward.bonusStar).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic with a seeded RNG', () => {
    const seedA = makeSeededRng(99);
    const seedB = makeSeededRng(99);
    const a = previewActionReward({
      baseline: 0.4, preference: 'liked', action: 'play', rng: seedA,
    });
    const b = previewActionReward({
      baseline: 0.4, preference: 'liked', action: 'play', rng: seedB,
    });
    expect(a).toEqual(b);
  });
});

describe('resolveCompanionActionState — error path', () => {
  it('throws on an unknown action id (defensive — should never hit)', () => {
    expect(() =>
      resolveCompanionActionState({
        // @ts-expect-error — intentional invalid id for the runtime guard.
        action: 'nope',
        busy: null,
        isSleeping: false,
      }),
    ).toThrow(/Unknown companion action/);
  });
});
