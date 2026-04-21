import { describe, it, expect } from 'vitest';

function safeParseTraits(attributesJson: string | null): Record<string, string> {
  if (!attributesJson) return {};
  try {
    return JSON.parse(attributesJson);
  } catch {
    return {};
  }
}

describe('attributes_json safety', () => {
  it('returns empty object for null', () => {
    expect(safeParseTraits(null)).toEqual({});
  });

  it('returns empty object for malformed JSON', () => {
    expect(safeParseTraits('{bad json')).toEqual({});
    expect(safeParseTraits('not json at all')).toEqual({});
    expect(safeParseTraits('')).toEqual({});
  });

  it('parses valid JSON', () => {
    const valid = '{"aura":"mystic","form":"classic"}';
    expect(safeParseTraits(valid)).toEqual({ aura: 'mystic', form: 'classic' });
  });

  it('handles truncated JSON gracefully', () => {
    expect(safeParseTraits('{"aura":"mys')).toEqual({});
  });
});
