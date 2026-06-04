import { describe, it, expect } from 'vitest';
import {
  validateSafeUrl,
  validateImageUrl,
  validateGoogleMapsUrl,
  normalizeSocialLink,
  isSafeRedirectPath
} from './sanitize';

describe('validateSafeUrl', () => {
  it('should accept valid http and https URLs', () => {
    expect(validateSafeUrl('https://example.com')).toBe('https://example.com');
    expect(validateSafeUrl('http://example.com/path?query=1')).toBe('http://example.com/path?query=1');
  });

  it('should reject non-string values', () => {
    expect(validateSafeUrl(null)).toBeNull();
    expect(validateSafeUrl(undefined)).toBeNull();
    expect(validateSafeUrl(123)).toBeNull();
    expect(validateSafeUrl({})).toBeNull();
  });

  it('should reject invalid or missing protocols', () => {
    expect(validateSafeUrl('javascript:alert(1)')).toBeNull();
    expect(validateSafeUrl('data:text/html,<html>')).toBeNull();
    expect(validateSafeUrl('file:///etc/passwd')).toBeNull();
    expect(validateSafeUrl('vbscript:msgbox("hello")')).toBeNull();
    expect(validateSafeUrl('ftp://example.com')).toBeNull();
  });

  it('should reject plain strings without protocol', () => {
    expect(validateSafeUrl('example.com')).toBeNull();
  });

  it('should trim leading and trailing spaces', () => {
    expect(validateSafeUrl('   https://example.com   ')).toBe('https://example.com');
  });

  it('should return null for empty or whitespace-only strings', () => {
    expect(validateSafeUrl('')).toBeNull();
    expect(validateSafeUrl('   ')).toBeNull();
  });
});

describe('validateImageUrl', () => {
  it('should accept absolute internal paths', () => {
    expect(validateImageUrl('/images/logo.png')).toBe('/images/logo.png');
  });

  it('should accept valid http/https URLs', () => {
    expect(validateImageUrl('https://example.com/logo.png')).toBe('https://example.com/logo.png');
  });

  it('should reject invalid protocols', () => {
    expect(validateImageUrl('javascript:alert("xss")')).toBeNull();
    expect(validateImageUrl('data:image/png;base64,iVBORw0KGgo...')).toBeNull(); // Data URLs are restricted by default in validateSafeUrl logic unless specifically added
  });

  it('should reject non-string values', () => {
    expect(validateImageUrl(null)).toBeNull();
  });
});

describe('validateGoogleMapsUrl', () => {
  it('should accept valid google maps hosts', () => {
    expect(validateGoogleMapsUrl('https://maps.google.com/?q=loc')).toBe('https://maps.google.com/?q=loc');
    expect(validateGoogleMapsUrl('https://www.google.com/maps/place/...')).toBe('https://www.google.com/maps/place/...');
    expect(validateGoogleMapsUrl('https://goo.gl/maps/xyz')).toBe('https://goo.gl/maps/xyz');
    expect(validateGoogleMapsUrl('https://maps.app.goo.gl/xyz')).toBe('https://maps.app.goo.gl/xyz');
  });

  it('should accept plain lat/lng pairs', () => {
    expect(validateGoogleMapsUrl('24.8607,67.0011')).toBe('24.8607,67.0011');
    expect(validateGoogleMapsUrl('-33.8688, 151.2093')).toBe('-33.8688, 151.2093');
  });

  it('should reject invalid hosts', () => {
    expect(validateGoogleMapsUrl('https://example.com/maps')).toBeNull();
    expect(validateGoogleMapsUrl('https://malicious.com/maps.google.com')).toBeNull();
  });

  it('should reject invalid protocols', () => {
    expect(validateGoogleMapsUrl('javascript:alert("xss")')).toBeNull();
  });
});

describe('normalizeSocialLink', () => {
  it('should accept and validate Facebook links and handles', () => {
    expect(normalizeSocialLink('facebook', 'https://www.facebook.com/username')).toBe('https://www.facebook.com/username');
    expect(normalizeSocialLink('facebook', 'https://fb.com/username')).toBe('https://fb.com/username');
    expect(normalizeSocialLink('facebook', '@username')).toBe('@username');
    expect(normalizeSocialLink('facebook', 'https://example.com')).toBeNull();
  });

  it('should accept and validate Instagram links and handles', () => {
    expect(normalizeSocialLink('instagram', 'https://instagram.com/username')).toBe('https://instagram.com/username');
    expect(normalizeSocialLink('instagram', '@username_123')).toBe('@username_123');
    expect(normalizeSocialLink('instagram', 'invalid_handle')).toBeNull();
  });

  it('should fallback to validateSafeUrl for unknown platforms', () => {
    expect(normalizeSocialLink('unknown', 'https://example.com')).toBe('https://example.com');
    expect(normalizeSocialLink('unknown', 'javascript:alert(1)')).toBeNull();
  });
});

describe('isSafeRedirectPath', () => {
  it('should return true for relative paths', () => {
    expect(isSafeRedirectPath('/path')).toBe(true);
    expect(isSafeRedirectPath('/path/to/page')).toBe(true);
    expect(isSafeRedirectPath('/path-123_456.js')).toBe(true);
  });

  it('should return false for absolute URLs', () => {
    expect(isSafeRedirectPath('https://example.com')).toBe(false);
    expect(isSafeRedirectPath('//example.com')).toBe(false); // protocol-relative
    expect(isSafeRedirectPath('javascript:alert(1)')).toBe(false);
  });

  it('should return false for null or empty strings', () => {
    expect(isSafeRedirectPath(null)).toBe(false);
    expect(isSafeRedirectPath('')).toBe(false);
  });
});
