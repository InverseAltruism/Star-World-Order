// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  EXPEDITION_OUTCOMES,
  EXPEDITION_OUTCOME_REWARD_SCALE,
  abandonExpedition,
  chooseExpeditionPath,
  getCurrentStep,
  getExpeditionRewards,
  isExpeditionComplete,
  startExpedition,
  validateExpeditionDefinition,
  type ExpeditionDefinition,
} from '../expeditions';

function buildSimpleExpedition(): ExpeditionDefinition {
  return {
    id: 'test-exp',
    title: 'Test Expedition',
    description: 'A small branching test.',
    npcSource: 'observatory',
    startStepId: 'start',
    rewards: { xp: 100, bond: 5, trait: 'TestTrait' },
    steps: [
      {
        id: 'start',
        narrative: 'You begin.',
        choices: [
          { id: 'left', label: 'Go left', nextStepId: 'middle-a' },
          { id: 'right', label: 'Go right', nextStepId: 'middle-b' },
        ],
      },
      {
        id: 'middle-a',
        narrative: 'You went left.',
        choices: [{ id: 'on', label: 'Onward', nextStepId: 'final' }],
      },
      {
        id: 'middle-b',
        narrative: 'You went right.',
        choices: [{ id: 'on', label: 'Onward', nextStepId: 'final' }],
      },
      {
        id: 'final',
        narrative: 'The journey ends.',
        isFinal: true,
        choices: [
          { id: 'win', label: 'Triumph', outcome: 'success' },
          { id: 'partial', label: 'Mixed result', outcome: 'partial' },
          { id: 'lose', label: 'Defeat', outcome: 'failure' },
        ],
      },
    ],
  };
}

describe('expedition definition validation', () => {
  it('accepts a well-formed definition', () => {
    const result = validateExpeditionDefinition(buildSimpleExpedition());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a missing startStepId', () => {
    const def = buildSimpleExpedition();
    def.startStepId = 'nope';
    const result = validateExpeditionDefinition(def);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('startStepId'))).toBe(true);
  });

  it('rejects a non-terminal choice missing nextStepId', () => {
    const def = buildSimpleExpedition();
    def.steps[0].choices[0].nextStepId = null;
    const result = validateExpeditionDefinition(def);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('nextStepId'))).toBe(true);
  });

  it('rejects a terminal choice missing outcome', () => {
    const def = buildSimpleExpedition();
    def.steps[3].choices[0].outcome = undefined;
    const result = validateExpeditionDefinition(def);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('outcome'))).toBe(true);
  });

  it('rejects nextStepId that points to nothing', () => {
    const def = buildSimpleExpedition();
    def.steps[0].choices[0].nextStepId = 'ghost';
    const result = validateExpeditionDefinition(def);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown step'))).toBe(true);
  });

  it('rejects duplicate step ids', () => {
    const def = buildSimpleExpedition();
    def.steps[1].id = 'start';
    const result = validateExpeditionDefinition(def);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate step id'))).toBe(true);
  });

  it('rejects a step with no choices', () => {
    const def = buildSimpleExpedition();
    def.steps[1].choices = [];
    const result = validateExpeditionDefinition(def);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('at least one choice'))).toBe(true);
  });
});

describe('expedition reducer', () => {
  it('starts at the declared start step', () => {
    const def = buildSimpleExpedition();
    const state = startExpedition(def);
    expect(state.expeditionId).toBe('test-exp');
    expect(state.currentStepId).toBe('start');
    expect(state.status).toBe('active');
    expect(state.history).toEqual([]);
    expect(state.finalOutcome).toBeUndefined();
  });

  it('throws when starting an expedition with an unresolved start step', () => {
    const def = buildSimpleExpedition();
    def.startStepId = 'no-such-step';
    expect(() => startExpedition(def)).toThrow(/startStepId/);
  });

  it('advances through non-terminal choices', () => {
    const def = buildSimpleExpedition();
    let state = startExpedition(def);
    state = chooseExpeditionPath(state, def, 'left');
    expect(state.currentStepId).toBe('middle-a');
    expect(state.status).toBe('active');
    expect(state.history).toEqual([
      { stepId: 'start', choiceId: 'left', outcome: undefined },
    ]);
  });

  it('does not mutate the input state when advancing', () => {
    const def = buildSimpleExpedition();
    const initial = startExpedition(def);
    const next = chooseExpeditionPath(initial, def, 'left');
    expect(initial.currentStepId).toBe('start');
    expect(initial.history).toEqual([]);
    expect(next).not.toBe(initial);
  });

  it('terminates the expedition when a final-step choice is taken', () => {
    const def = buildSimpleExpedition();
    let state = startExpedition(def);
    state = chooseExpeditionPath(state, def, 'right');
    state = chooseExpeditionPath(state, def, 'on');
    state = chooseExpeditionPath(state, def, 'win');
    expect(state.status).toBe('completed');
    expect(state.currentStepId).toBeNull();
    expect(state.finalOutcome).toBe('success');
    expect(state.history.map((h) => h.choiceId)).toEqual(['right', 'on', 'win']);
    expect(isExpeditionComplete(state)).toBe(true);
  });

  it('records the outcome attached to the terminal choice', () => {
    const def = buildSimpleExpedition();
    let state = startExpedition(def);
    state = chooseExpeditionPath(state, def, 'left');
    state = chooseExpeditionPath(state, def, 'on');
    state = chooseExpeditionPath(state, def, 'partial');
    expect(state.finalOutcome).toBe('partial');
  });

  it('throws when choosing a choice that does not exist on the current step', () => {
    const def = buildSimpleExpedition();
    const state = startExpedition(def);
    expect(() => chooseExpeditionPath(state, def, 'phantom')).toThrow(/no choice/);
  });

  it('throws when given a state from a different expedition', () => {
    const def = buildSimpleExpedition();
    const state = { ...startExpedition(def), expeditionId: 'other' };
    expect(() => chooseExpeditionPath(state, def, 'left')).toThrow(/mismatch/);
  });

  it('throws when advancing a completed expedition', () => {
    const def = buildSimpleExpedition();
    let state = startExpedition(def);
    state = chooseExpeditionPath(state, def, 'left');
    state = chooseExpeditionPath(state, def, 'on');
    state = chooseExpeditionPath(state, def, 'win');
    expect(() => chooseExpeditionPath(state, def, 'win')).toThrow(/not active/);
  });
});

describe('abandon + reward payout', () => {
  it('abandon marks active state as abandoned', () => {
    const def = buildSimpleExpedition();
    const state = startExpedition(def);
    const abandoned = abandonExpedition(state);
    expect(abandoned.status).toBe('abandoned');
    expect(abandoned.currentStepId).toBeNull();
  });

  it('abandon is idempotent on already-completed states', () => {
    const def = buildSimpleExpedition();
    let state = startExpedition(def);
    state = chooseExpeditionPath(state, def, 'left');
    state = chooseExpeditionPath(state, def, 'on');
    state = chooseExpeditionPath(state, def, 'win');
    const after = abandonExpedition(state);
    expect(after).toBe(state);
    expect(after.status).toBe('completed');
  });

  it('returns zero rewards for an active expedition', () => {
    const def = buildSimpleExpedition();
    const state = startExpedition(def);
    expect(getExpeditionRewards(state, def)).toEqual({ xp: 0, bond: 0, trait: null });
  });

  it('returns zero rewards for an abandoned expedition', () => {
    const def = buildSimpleExpedition();
    const state = abandonExpedition(startExpedition(def));
    expect(getExpeditionRewards(state, def)).toEqual({ xp: 0, bond: 0, trait: null });
  });

  it('pays full rewards (incl. trait) on success', () => {
    const def = buildSimpleExpedition();
    let state = startExpedition(def);
    state = chooseExpeditionPath(state, def, 'left');
    state = chooseExpeditionPath(state, def, 'on');
    state = chooseExpeditionPath(state, def, 'win');
    expect(getExpeditionRewards(state, def)).toEqual({
      xp: 100,
      bond: 5,
      trait: 'TestTrait',
    });
  });

  it('pays scaled rewards and no trait on partial', () => {
    const def = buildSimpleExpedition();
    let state = startExpedition(def);
    state = chooseExpeditionPath(state, def, 'left');
    state = chooseExpeditionPath(state, def, 'on');
    state = chooseExpeditionPath(state, def, 'partial');
    expect(getExpeditionRewards(state, def)).toEqual({
      xp: 50,
      bond: 2.5,
      trait: null,
    });
  });

  it('pays minimum rewards on failure', () => {
    const def = buildSimpleExpedition();
    let state = startExpedition(def);
    state = chooseExpeditionPath(state, def, 'left');
    state = chooseExpeditionPath(state, def, 'on');
    state = chooseExpeditionPath(state, def, 'lose');
    expect(getExpeditionRewards(state, def)).toEqual({
      xp: 25,
      bond: 1.3,
      trait: null,
    });
  });

  it('exposes a stable outcome list and reward scale', () => {
    expect(EXPEDITION_OUTCOMES).toEqual(['success', 'partial', 'failure']);
    expect(EXPEDITION_OUTCOME_REWARD_SCALE).toEqual({
      success: 1.0,
      partial: 0.5,
      failure: 0.25,
    });
    expect(Object.isFrozen(EXPEDITION_OUTCOME_REWARD_SCALE)).toBe(true);
  });
});

describe('current-step lookup', () => {
  it('returns the current step while active', () => {
    const def = buildSimpleExpedition();
    const state = startExpedition(def);
    const step = getCurrentStep(state, def);
    expect(step?.id).toBe('start');
  });

  it('returns null after completion', () => {
    const def = buildSimpleExpedition();
    let state = startExpedition(def);
    state = chooseExpeditionPath(state, def, 'left');
    state = chooseExpeditionPath(state, def, 'on');
    state = chooseExpeditionPath(state, def, 'win');
    expect(getCurrentStep(state, def)).toBeNull();
  });
});

describe('seed expeditions in data/sanctuary/expeditions.json', () => {
  it('every shipped expedition validates cleanly', () => {
    const seedPath = resolve(__dirname, '..', '..', '..', 'data', 'sanctuary', 'expeditions.json');
    const raw = readFileSync(seedPath, 'utf8');
    const parsed = JSON.parse(raw) as { expeditions: ExpeditionDefinition[] };
    expect(parsed.expeditions.length).toBeGreaterThan(0);
    for (const def of parsed.expeditions) {
      const result = validateExpeditionDefinition(def);
      expect(result.errors, `expedition ${def.id}: ${result.errors.join('; ')}`).toEqual(
        [],
      );
      expect(result.ok).toBe(true);
    }
  });

  it('every shipped expedition has at least one reachable success outcome', () => {
    const seedPath = resolve(__dirname, '..', '..', '..', 'data', 'sanctuary', 'expeditions.json');
    const raw = readFileSync(seedPath, 'utf8');
    const parsed = JSON.parse(raw) as { expeditions: ExpeditionDefinition[] };
    for (const def of parsed.expeditions) {
      const hasSuccess = def.steps
        .filter((s) => s.isFinal)
        .some((s) => s.choices.some((c) => c.outcome === 'success'));
      expect(hasSuccess, `expedition ${def.id} has no success outcome`).toBe(true);
    }
  });
});
