import { describe, it, expect } from 'vitest';
import {
  ethAddress,
  tokenId,
  paginationPage,
  paginationLimit,
  interactAction,
  nftTraitsAction,
  formatZodError,
} from '../validation';

describe('ethAddress', () => {
  it('accepts valid lowercase address', () => {
    expect(ethAddress.safeParse('0xabcdef1234567890abcdef1234567890abcdef12').success).toBe(true);
  });

  it('accepts valid checksummed address', () => {
    expect(ethAddress.safeParse('0xAbCdEf1234567890ABCDEF1234567890AbCdEf12').success).toBe(true);
  });

  it('rejects address without 0x prefix', () => {
    expect(ethAddress.safeParse('abcdef1234567890abcdef1234567890abcdef12').success).toBe(false);
  });

  it('rejects short address', () => {
    expect(ethAddress.safeParse('0xabc').success).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(ethAddress.safeParse('0xZZZZZZ1234567890abcdef1234567890abcdef12').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(ethAddress.safeParse('').success).toBe(false);
  });

  it('rejects non-string', () => {
    expect(ethAddress.safeParse(12345).success).toBe(false);
  });
});

describe('tokenId', () => {
  it('accepts valid integer', () => {
    expect(tokenId.safeParse(1).success).toBe(true);
    expect(tokenId.safeParse(3333).success).toBe(true);
    expect(tokenId.safeParse(500).success).toBe(true);
  });

  it('coerces string to number', () => {
    const result = tokenId.safeParse('42');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(42);
  });

  it('rejects 0', () => {
    expect(tokenId.safeParse(0).success).toBe(false);
  });

  it('rejects negative numbers', () => {
    expect(tokenId.safeParse(-1).success).toBe(false);
  });

  it('rejects numbers above 3333', () => {
    expect(tokenId.safeParse(3334).success).toBe(false);
  });

  it('rejects floats', () => {
    expect(tokenId.safeParse(1.5).success).toBe(false);
  });

  it('rejects non-numeric strings', () => {
    expect(tokenId.safeParse('abc').success).toBe(false);
  });
});

describe('paginationPage', () => {
  it('defaults to 1 when undefined', () => {
    const result = paginationPage.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(1);
  });

  it('coerces string', () => {
    const result = paginationPage.safeParse('3');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(3);
  });

  it('rejects 0', () => {
    expect(paginationPage.safeParse(0).success).toBe(false);
  });
});

describe('paginationLimit', () => {
  const limit = paginationLimit(100, 20);

  it('defaults when undefined', () => {
    const result = limit.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(20);
  });

  it('clamps to max', () => {
    expect(limit.safeParse(200).success).toBe(false);
  });

  it('rejects 0', () => {
    expect(limit.safeParse(0).success).toBe(false);
  });
});

describe('interactAction', () => {
  it('accepts valid actions', () => {
    expect(interactAction.safeParse('feed').success).toBe(true);
    expect(interactAction.safeParse('pet').success).toBe(true);
    expect(interactAction.safeParse('talk').success).toBe(true);
  });

  it('rejects invalid action', () => {
    expect(interactAction.safeParse('dance').success).toBe(false);
  });
});

describe('nftTraitsAction', () => {
  it('accepts valid actions', () => {
    expect(nftTraitsAction.safeParse('distribution').success).toBe(true);
    expect(nftTraitsAction.safeParse('filter').success).toBe(true);
  });

  it('rejects invalid action', () => {
    expect(nftTraitsAction.safeParse('search').success).toBe(false);
  });
});

describe('formatZodError', () => {
  it('formats path-based errors', () => {
    const result = ethAddress.safeParse('bad');
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain('Invalid Ethereum address format');
    }
  });

  it('joins multiple errors', () => {
    const schema = z.object({ a: z.string(), b: z.number() });
    const result = schema.safeParse({ a: 123, b: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain('a:');
      expect(msg).toContain('b:');
    }
  });
});

import { z } from 'zod';
