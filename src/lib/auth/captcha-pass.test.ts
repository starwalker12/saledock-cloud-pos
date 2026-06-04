import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readCaptchaPass } from './captcha-pass';
import { cookies } from 'next/headers';
import { createHmac } from 'crypto';

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

describe('readCaptchaPass', () => {
  const mockIp = '192.168.1.1';
  const mockKey = 'test-secret-key';

  beforeEach(() => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', mockKey);
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
      getAll: vi.fn(),
    } as any);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  const generateValidCookie = (data: any, key: string) => {
    const payload = JSON.stringify(data);
    const sig = createHmac('sha256', key).update(payload).digest('hex');
    return `${payload}.${sig}`;
  };

  it('returns null if RECAPTCHA_SECRET_KEY is missing', async () => {
    vi.stubEnv('RECAPTCHA_SECRET_KEY', '');
    const result = await readCaptchaPass(mockIp);
    expect(result).toBeNull();
  });

  it('returns null if cookie is missing', async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    } as any);
    const result = await readCaptchaPass(mockIp);
    expect(result).toBeNull();
  });

  it('returns null if cookie format is invalid (no dot)', async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: 'invalid-cookie-format' }),
    } as any);
    const result = await readCaptchaPass(mockIp);
    expect(result).toBeNull();
  });

  it('returns null if signature is invalid', async () => {
    const validData = { ip: mockIp, ts: Date.now(), remaining: 3 };
    const validCookie = generateValidCookie(validData, mockKey);
    const tamperedCookie = validCookie.replace(/\.[a-f0-9]+$/, '.invalid-signature');

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: tamperedCookie }),
    } as any);
    const result = await readCaptchaPass(mockIp);
    expect(result).toBeNull();
  });

  it('returns null if payload is invalid JSON', async () => {
    const payload = 'invalid-json';
    const sig = createHmac('sha256', mockKey).update(payload).digest('hex');
    const cookie = `${payload}.${sig}`;

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: cookie }),
    } as any);
    const result = await readCaptchaPass(mockIp);
    expect(result).toBeNull();
  });

  it('returns null if schema is invalid (missing fields)', async () => {
    const invalidData = { ip: mockIp, ts: Date.now() }; // Missing remaining
    const cookie = generateValidCookie(invalidData, mockKey);

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: cookie }),
    } as any);
    const result = await readCaptchaPass(mockIp);
    expect(result).toBeNull();
  });

  it('returns null if schema types are invalid', async () => {
    const invalidData = { ip: mockIp, ts: 'invalid-type', remaining: 3 };
    const cookie = generateValidCookie(invalidData, mockKey);

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: cookie }),
    } as any);
    const result = await readCaptchaPass(mockIp);
    expect(result).toBeNull();
  });

  it('returns null if IP does not match', async () => {
    const validData = { ip: '10.0.0.1', ts: Date.now(), remaining: 3 };
    const cookie = generateValidCookie(validData, mockKey);

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: cookie }),
    } as any);
    const result = await readCaptchaPass(mockIp);
    expect(result).toBeNull();
  });

  it('returns null if window has expired', async () => {
    const expiredData = { ip: mockIp, ts: Date.now() - 301000, remaining: 3 }; // > 300 seconds
    const cookie = generateValidCookie(expiredData, mockKey);

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: cookie }),
    } as any);
    const result = await readCaptchaPass(mockIp);
    expect(result).toBeNull();
  });

  it('returns null if no remaining attempts', async () => {
    const noAttemptsData = { ip: mockIp, ts: Date.now(), remaining: 0 };
    const cookie = generateValidCookie(noAttemptsData, mockKey);

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: cookie }),
    } as any);
    const result = await readCaptchaPass(mockIp);
    expect(result).toBeNull();
  });

  it('returns data if cookie is valid', async () => {
    const validData = { ip: mockIp, ts: Date.now(), remaining: 3 };
    const cookie = generateValidCookie(validData, mockKey);

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: cookie }),
    } as any);
    const result = await readCaptchaPass(mockIp);
    expect(result).toEqual(validData);
  });
});
