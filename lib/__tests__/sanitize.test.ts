/**
 * Security Hardening Tests
 * 
 * Tests for sanitization utilities and timing-safe cron auth.
 */

import { describe, it, expect } from 'vitest';
import { escapeHtml, isValidWalletAddress } from '../sanitize';

describe('escapeHtml', () => {
  it('escapes HTML angle brackets', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#x27;s');
  });

  it('escapes img onerror XSS payload', () => {
    const payload = '<img src=x onerror=alert(1)>';
    expect(escapeHtml(payload)).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml(payload)).not.toContain('<');
  });

  it('does not alter safe strings', () => {
    expect(escapeHtml('hello world 123')).toBe('hello world 123');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('handles multiple special chars together', () => {
    expect(escapeHtml('a<b>c&d"e\'f')).toBe('a&lt;b&gt;c&amp;d&quot;e&#x27;f');
  });
});

describe('isValidWalletAddress', () => {
  it('accepts valid lowercase address', () => {
    expect(isValidWalletAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(true);
  });

  it('accepts valid mixed-case address', () => {
    expect(isValidWalletAddress('0xAbCdEf1234567890AbCdEf1234567890AbCdEf12')).toBe(true);
  });

  it('rejects address without 0x prefix', () => {
    expect(isValidWalletAddress('1234567890abcdef1234567890abcdef12345678')).toBe(false);
  });

  it('rejects too-short address', () => {
    expect(isValidWalletAddress('0x1234')).toBe(false);
  });

  it('rejects too-long address', () => {
    expect(isValidWalletAddress('0x1234567890abcdef1234567890abcdef123456789')).toBe(false);
  });

  it('rejects address with non-hex characters', () => {
    expect(isValidWalletAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidWalletAddress('')).toBe(false);
  });

  it('rejects SQL injection attempt', () => {
    expect(isValidWalletAddress("0x' OR 1=1 --")).toBe(false);
  });

  it('rejects script tag in address', () => {
    expect(isValidWalletAddress('<script>alert(1)</script>')).toBe(false);
  });
});
