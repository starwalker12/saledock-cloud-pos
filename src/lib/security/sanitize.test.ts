import { describe, it, expect } from 'vitest';
import { sanitizePlainText } from './sanitize';

describe('sanitizePlainText', () => {
  it('returns empty string for non-string inputs', () => {
    expect(sanitizePlainText(null)).toBe('');
    expect(sanitizePlainText(undefined)).toBe('');
    expect(sanitizePlainText(123)).toBe('');
    expect(sanitizePlainText({})).toBe('');
    expect(sanitizePlainText([])).toBe('');
    expect(sanitizePlainText(true)).toBe('');
  });

  it('returns the same string for clean text', () => {
    expect(sanitizePlainText('hello world')).toBe('hello world');
    expect(sanitizePlainText('123 abc')).toBe('123 abc');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizePlainText('  hello world  ')).toBe('hello world');
    expect(sanitizePlainText('\t\t hello \t')).toBe('hello');
  });

  it('strips control characters', () => {
    // \x00-\x08\x0b\x0c\x0e-\x1f\x7f
    expect(sanitizePlainText('hello\x00world')).toBe('helloworld');
    expect(sanitizePlainText('\x01\x02\x03\x04\x05\x06\x07\x08test')).toBe('test');
    expect(sanitizePlainText('a\x0Bb\x0Cc')).toBe('abc');
    expect(sanitizePlainText('foo\x1Fbar\x7F')).toBe('foobar');
    // \x09 (\t), \x0a (\n), \x0d (\r) are allowed (whitespace)
    expect(sanitizePlainText('hello\tworld\n\r')).toBe('hello\tworld');
  });

  it('enforces default maxLength of 500', () => {
    const longString = 'a'.repeat(600);
    const sanitized = sanitizePlainText(longString);
    expect(sanitized.length).toBe(500);
    expect(sanitized).toBe('a'.repeat(500));
  });

  it('enforces custom maxLength', () => {
    expect(sanitizePlainText('hello world', 5)).toBe('hello');
    expect(sanitizePlainText('  hello world  ', 5)).toBe('hello');
  });
});
