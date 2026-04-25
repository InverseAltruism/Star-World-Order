import { describe, it, expect } from 'vitest';
import {
  BOND_STAGES,
  getBondStage,
  buildBondStageBlock,
} from '../bondStages';

describe('BOND_STAGES', () => {
  it('defines exactly four stages in ascending order', () => {
    expect(BOND_STAGES).toHaveLength(4);
    const keys = BOND_STAGES.map((s) => s.key);
    expect(keys).toEqual(['shy', 'friendly', 'bonded', 'devoted']);
  });

  it('covers the full 0-100 range with no gaps or overlaps', () => {
    expect(BOND_STAGES[0].min).toBe(0);
    expect(BOND_STAGES[BOND_STAGES.length - 1].max).toBe(100);
    for (let i = 1; i < BOND_STAGES.length; i++) {
      expect(BOND_STAGES[i].min).toBe(BOND_STAGES[i - 1].max + 1);
      expect(BOND_STAGES[i].max).toBeGreaterThan(BOND_STAGES[i].min);
    }
  });

  it('every stage has a non-empty label, description and tone guidance', () => {
    for (const stage of BOND_STAGES) {
      expect(stage.label.length).toBeGreaterThan(0);
      expect(stage.description.length).toBeGreaterThan(10);
      expect(stage.toneGuidance.length).toBeGreaterThan(20);
    }
  });
});

describe('getBondStage', () => {
  it('maps low scores to Shy', () => {
    expect(getBondStage(0).key).toBe('shy');
    expect(getBondStage(10).key).toBe('shy');
    expect(getBondStage(24).key).toBe('shy');
  });

  it('maps mid-low scores to Friendly', () => {
    expect(getBondStage(25).key).toBe('friendly');
    expect(getBondStage(40).key).toBe('friendly');
    expect(getBondStage(54).key).toBe('friendly');
  });

  it('maps mid-high scores to Bonded', () => {
    expect(getBondStage(55).key).toBe('bonded');
    expect(getBondStage(70).key).toBe('bonded');
    expect(getBondStage(79).key).toBe('bonded');
  });

  it('maps high scores to Devoted', () => {
    expect(getBondStage(80).key).toBe('devoted');
    expect(getBondStage(95).key).toBe('devoted');
    expect(getBondStage(100).key).toBe('devoted');
  });

  it('clamps negative scores to Shy', () => {
    expect(getBondStage(-50).key).toBe('shy');
  });

  it('clamps over-100 scores to Devoted', () => {
    expect(getBondStage(150).key).toBe('devoted');
    expect(getBondStage(99999).key).toBe('devoted');
  });

  it('treats null/undefined/NaN as 0 (Shy)', () => {
    expect(getBondStage(null).key).toBe('shy');
    expect(getBondStage(undefined).key).toBe('shy');
    expect(getBondStage(NaN).key).toBe('shy');
  });
});

describe('buildBondStageBlock', () => {
  it('includes the stage label, score and tone guidance', () => {
    const block = buildBondStageBlock(70);
    expect(block).toContain('Bonded');
    expect(block).toContain('70/100');
    expect(block).toContain(getBondStage(70).toneGuidance);
  });

  it('clamps the displayed score to 0-100', () => {
    expect(buildBondStageBlock(-5)).toContain('0/100');
    expect(buildBondStageBlock(150)).toContain('100/100');
  });

  it('handles null bond_score gracefully', () => {
    const block = buildBondStageBlock(null);
    expect(block).toContain('Shy');
    expect(block).toContain('0/100');
  });
});
