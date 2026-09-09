// NEH-162: the appliance is offline and nothing verifies an email address,
// so email became optional on setup/user forms. These are the two pure
// helpers that back that behavior.
import { describe, it, expect } from 'vitest';
import { normalizeEmail, emailFormatError } from './email-field';

describe('normalizeEmail', () => {
  it('returns null for an empty string', () => {
    expect(normalizeEmail('')).toBeNull();
  });

  it('returns null for a whitespace-only string', () => {
    expect(normalizeEmail('  ')).toBeNull();
  });

  it('trims a real address', () => {
    expect(normalizeEmail(' a@b.co ')).toBe('a@b.co');
  });
});

describe('emailFormatError', () => {
  it('is false for an empty string (optional field, nothing to validate)', () => {
    expect(emailFormatError('')).toBe(false);
  });

  it('is true for a non-empty value that does not look like an email', () => {
    expect(emailFormatError('not-an-email')).toBe(true);
  });

  it('is false for a value that looks like an email', () => {
    expect(emailFormatError('a@b.co')).toBe(false);
  });
});
