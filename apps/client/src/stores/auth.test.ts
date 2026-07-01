import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from './auth';

describe('auth store WeChat login', () => {
  const storage = new Map<string, unknown>();

  beforeEach(() => {
    storage.clear();
    setActivePinia(createPinia());
    vi.stubGlobal('uni', {
      getStorageSync: vi.fn((key: string) => storage.get(key) ?? ''),
      setStorageSync: vi.fn((key: string, value: unknown) => storage.set(key, value)),
      login: vi.fn(({ success }: { success: (result: { code: string }) => void }) => {
        success({ code: 'wx-login-code' });
      }),
      request: vi.fn(({ url, data, success }: {
        url: string;
        data: unknown;
        success: (response: { data: unknown }) => void;
      }) => {
        expect(url).toBe('/v1/auth/wechat-mini');
        expect(data).toEqual({
          code: 'wx-login-code',
          visitorId: 'visitor_existing',
          profile: {
            avatarUrl: 'https://example.com/avatar.png',
            nickname: '小白',
          },
        });
        success({
          data: {
            accountId: 'account_wechat',
            accessToken: 'account.token',
            provider: 'wechat',
            profile: {
              avatarUrl: 'https://example.com/avatar.png',
              nickname: '小白',
            },
          },
        });
      }),
    });
  });

  it('logs in with a WeChat code and persists the account session', async () => {
    const auth = useAuthStore();
    auth.visitorId = 'visitor_existing';

    await auth.wechatLogin({
      avatarUrl: 'https://example.com/avatar.png',
      nickname: '小白',
    });

    expect(auth.accountId).toBe('account_wechat');
    expect(auth.provider).toBe('wechat');
    expect(auth.userProfile.nickname).toBe('小白');
    expect(storage.get('baichile:account')).toMatchObject({
      accountId: 'account_wechat',
      accessToken: 'account.token',
      provider: 'wechat',
    });
  });

  it('keeps the guest identity when WeChat login fails', async () => {
    vi.mocked(uni.login).mockImplementation((options) => {
      const { fail } = options as NonNullable<typeof options> & {
        fail?: (error: { errMsg: string }) => void;
      };
      fail?.({ errMsg: 'login:fail' });
      return undefined as never;
    });
    const auth = useAuthStore();
    auth.visitorId = 'visitor_existing';
    auth.accessToken = 'guest.token';

    await expect(auth.wechatLogin({
      avatarUrl: 'https://example.com/avatar.png',
      nickname: '小白',
    })).rejects.toBeTruthy();

    expect(auth.visitorId).toBe('visitor_existing');
    expect(auth.accessToken).toBe('guest.token');
    expect(auth.accountId).toBe('');
  });
});
