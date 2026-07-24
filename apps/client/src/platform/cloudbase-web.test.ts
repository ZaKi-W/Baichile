import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
  callFunction: vi.fn(),
  init: vi.fn(),
}));

vi.mock('@cloudbase/js-sdk', () => ({
  default: {
    init: sdk.init,
  },
}));

import {
  hasWebPhoneSession,
  normalizeWebPhone,
  sendWebPhoneOtp,
} from './cloudbase-web';

describe('CloudBase Web phone auth', () => {
  beforeEach(() => {
    sdk.getSession.mockReset();
    sdk.signInWithOtp.mockReset();
    sdk.signOut.mockReset();
    sdk.callFunction.mockReset();
    sdk.init.mockReturnValue({
      auth: {
        getSession: sdk.getSession,
        signInWithOtp: sdk.signInWithOtp,
        signOut: sdk.signOut,
      },
      callFunction: sdk.callFunction,
    });
  });

  it('normalizes only mainland China mobile numbers', () => {
    expect(normalizeWebPhone('138 0013 8000')).toBe('+8613800138000');
    expect(normalizeWebPhone('+86-13800138000')).toBe('+8613800138000');
    expect(() => normalizeWebPhone('12345')).toThrow('中国大陆手机号');
  });

  it('restores login only from a real non-anonymous session', async () => {
    sdk.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(hasWebPhoneSession()).resolves.toBe(false);

    sdk.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'web-user', is_anonymous: false } } },
      error: null,
    });
    await expect(hasWebPhoneSession()).resolves.toBe(true);
  });

  it('verifies the OTP returned by signInWithOtp before accepting the session', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ data: {}, error: null });
    sdk.signInWithOtp.mockResolvedValue({ data: { verifyOtp }, error: null });
    sdk.getSession.mockResolvedValue({
      data: { session: { user: { id: 'web-user', is_anonymous: false } } },
      error: null,
    });

    const verify = await sendWebPhoneOtp('13800138000');
    await expect(verify('123456')).resolves.toBe('+8613800138000');

    expect(sdk.signInWithOtp).toHaveBeenCalledWith({ phone: '+8613800138000' });
    expect(verifyOtp).toHaveBeenCalledWith({ token: '123456' });
  });
});
